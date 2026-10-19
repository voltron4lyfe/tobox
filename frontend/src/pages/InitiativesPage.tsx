import { Pause, Plus, Repeat, Users } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

import type { Initiative, Role, Routine } from '../api/client'
import {
  useCreateInitiative,
  useCreateRoutine,
  useDeleteInitiative,
  useDeleteRoutine,
  useInitiatives,
  useRoles,
  useRoutines,
  useUpdateInitiative,
  useUpdateRoutine,
} from '../api/hooks'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InitiativeForm } from '../components/InitiativeForm'
import { Kbd } from '../components/Kbd'
import { Modal } from '../components/Modal'
import { ErrorBlock, LoadingBlock, PageHeader } from '../components/PageHeader'
import { RolesEditor } from '../components/RolesEditor'
import { RoutineForm } from '../components/RoutineForm'
import { RoutineList } from '../components/RoutineList'
import { useErrorToast } from '../components/Toast'
import { useHotkeys } from '../lib/hotkeys'
import { QUADRANTS, quadrantMeta, type Quadrant } from '../lib/quadrants'
import { useListNav, useScrollSelected } from '../lib/useListNav'

type Editing = { mode: 'new'; quadrant: Quadrant } | { mode: 'edit'; initiative: Initiative } | null
type EditingRoutine = { mode: 'new' } | { mode: 'edit'; routine: Routine } | null
/** Which initiatives to show: every role, one role, or those without a role. */
type RoleFilter = 'all' | 'none' | number

function matchesRole(filter: RoleFilter, roleId: number | null) {
  return filter === 'all' || (filter === 'none' ? roleId === null : roleId === filter)
}

export function InitiativesPage() {
  const [showInactive, setShowInactive] = useState(false)
  const { data, isPending, error } = useInitiatives(showInactive)
  const create = useCreateInitiative()
  const update = useUpdateInitiative()
  const remove = useDeleteInitiative()
  const onError = useErrorToast()
  const roles = useRoles()
  const roleList = useMemo(() => roles.data ?? [], [roles.data])
  const routines = useRoutines()
  const createRoutine = useCreateRoutine()
  const updateRoutine = useUpdateRoutine()
  const deleteRoutine = useDeleteRoutine()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Initiative | null>(null)
  const [editingRoutine, setEditingRoutine] = useState<EditingRoutine>(null)
  const [deletingRoutine, setDeletingRoutine] = useState<Routine | null>(null)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const modalOpen =
    editing !== null ||
    deleting !== null ||
    editingRoutine !== null ||
    deletingRoutine !== null ||
    rolesOpen
  const filters: RoleFilter[] = ['all', ...roleList.map((r) => r.id), 'none']
  const roleName = (id: number | null) => roleList.find((r) => r.id === id)?.name

  const visible = useMemo(
    () =>
      (data ?? []).filter(
        (i) =>
          (showInactive || i.status === 'active' || i.status === 'paused') &&
          matchesRole(roleFilter, i.role_id),
      ),
    [data, showInactive, roleFilter],
  )
  const visibleRoutines = useMemo(
    () =>
      (routines.data ?? []).filter((r) => {
        const initiative = data?.find((i) => i.id === r.initiative_id)
        return matchesRole(roleFilter, initiative?.role_id ?? null)
      }),
    [routines.data, data, roleFilter],
  )
  const activeInitiatives = useMemo(() => (data ?? []).filter((i) => i.status === 'active'), [data])
  // Flattened in quadrant order so j/k walks the matrix Q1 → Q4.
  const flat = useMemo(
    () => QUADRANTS.flatMap((q) => visible.filter((i) => i.quadrant === q)),
    [visible],
  )

  const patch = (i: Initiative, body: Partial<Initiative>) =>
    update.mutate({ id: i.id, ...body }, { onError })

  const [selected, setSelected] = useListNav(flat.length, {
    group: 'Initiatives',
    enabled: !modalOpen,
    actions: [
      {
        keys: 'e, enter',
        description: 'Edit initiative',
        handler: (i) => flat[i] && setEditing({ mode: 'edit', initiative: flat[i] }),
      },
      ...QUADRANTS.map((q) => ({
        keys: String(q),
        description: `Move to Q${q}`,
        handler: (i: number) => flat[i] && patch(flat[i], { quadrant: q }),
      })),
      {
        keys: 'p',
        description: 'Pause / resume',
        handler: (i) =>
          flat[i] && patch(flat[i], { status: flat[i].status === 'paused' ? 'active' : 'paused' }),
      },
      {
        keys: 'x',
        description: 'Mark done / reopen',
        handler: (i) =>
          flat[i] && patch(flat[i], { status: flat[i].status === 'done' ? 'active' : 'done' }),
      },
      {
        keys: 'a',
        description: 'Archive / unarchive',
        handler: (i) =>
          flat[i] &&
          patch(flat[i], { status: flat[i].status === 'archived' ? 'active' : 'archived' }),
      },
      {
        keys: 'd, backspace, delete',
        description: 'Delete initiative',
        handler: (i) => flat[i] && setDeleting(flat[i]),
      },
    ],
  })
  useScrollSelected(selected)
  const selectedInit = flat[selected]

  useHotkeys([
    {
      keys: 'n, c',
      description: 'New initiative',
      group: 'Initiatives',
      enabled: !modalOpen,
      handler: () =>
        setEditing({ mode: 'new', quadrant: (selectedInit?.quadrant as Quadrant) ?? 2 }),
    },
    {
      keys: 'v',
      description: 'Toggle inactive initiatives',
      group: 'Initiatives',
      enabled: !modalOpen,
      handler: () => setShowInactive((s) => !s),
    },
    {
      keys: 'f',
      description: 'Next role filter',
      group: 'Initiatives',
      enabled: !modalOpen && roleList.length > 0,
      handler: () =>
        setRoleFilter((f) => filters[(filters.indexOf(f) + 1) % filters.length] ?? 'all'),
    },
    {
      keys: 'shift+r',
      description: 'Manage roles',
      group: 'Initiatives',
      enabled: !modalOpen,
      handler: () => setRolesOpen(true),
    },
    {
      keys: 'r',
      description: 'New routine',
      group: 'Initiatives',
      enabled: !modalOpen,
      handler: () => setEditingRoutine({ mode: 'new' }),
    },
  ])

  return (
    <>
      <PageHeader
        eyebrow="Your portfolio"
        title="Initiatives"
        description="Everything competing for your time, sorted by importance and urgency. Effective people live in Q2: important work done before it becomes urgent."
        actions={
          <>
            <label className="btn-ghost cursor-pointer text-xs">
              <input
                type="checkbox"
                className="accent-accent-solid"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive <Kbd keys="v" />
            </label>
            <button type="button" className="btn-outline" onClick={() => setRolesOpen(true)}>
              <Users className="size-4" /> Roles <Kbd keys="shift+r" className="opacity-60" />
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEditing({ mode: 'new', quadrant: 2 })}
            >
              <Plus className="size-4" /> New <Kbd keys="n" className="opacity-60" />
            </button>
          </>
        }
      />

      {isPending ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : (
        <div>
          {roleList.length > 0 && (
            <RoleFilterBar
              roles={roleList}
              value={roleFilter}
              onChange={setRoleFilter}
              hasUnassigned={(data ?? []).some((i) => i.role_id === null)}
            />
          )}
          {/* Matrix with axis labels on desktop; a single column of quadrants on mobile. */}
          <div className="grid gap-3 md:grid-cols-[1.25rem_1fr_1fr]">
            <span className="hidden md:block" />
            <span className="eyebrow hidden text-center md:block">Urgent</span>
            <span className="eyebrow hidden text-center md:block">Not urgent</span>
            {QUADRANTS.map((q) => (
              <Fragment key={q}>
                {q % 2 === 1 && (
                  <span className="eyebrow hidden rotate-180 items-center justify-center [writing-mode:vertical-rl] md:flex">
                    {q === 1 ? 'Important' : 'Not important'}
                  </span>
                )}
                <QuadrantPanel
                  q={q}
                  initiatives={flat.filter((i) => i.quadrant === q)}
                  indexOf={(i) => flat.indexOf(i)}
                  selected={selected}
                  onSelect={setSelected}
                  onAdd={() => setEditing({ mode: 'new', quadrant: q })}
                  onEdit={(i) => setEditing({ mode: 'edit', initiative: i })}
                  roleName={roleFilter === 'all' ? roleName : () => undefined}
                />
              </Fragment>
            ))}
          </div>
          {flat.length > 0 && (
            <p className="mt-4 hidden text-xs text-ink-3 [@media(hover:hover)]:block">
              <Kbd keys="j" /> <Kbd keys="k" /> select · <Kbd keys="1" />–<Kbd keys="4" /> move
              quadrant · <Kbd keys="e" /> edit · <Kbd keys="p" /> pause · <Kbd keys="x" /> done ·{' '}
              <Kbd keys="a" /> archive
              {roleList.length > 0 && (
                <>
                  {' '}
                  · <Kbd keys="f" /> filter by role
                </>
              )}
            </p>
          )}

          <section aria-label="Routines" className="card mt-6 p-4">
            <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Repeat className="size-4 text-accent" /> Routines
                </h2>
                <p className="mt-0.5 text-xs text-ink-3">
                  Things that recur. Each is offered on your plan on the days it’s due; you choose
                  whether it makes the six.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setEditingRoutine({ mode: 'new' })}
              >
                <Plus className="size-4" /> New routine <Kbd keys="r" className="opacity-60" />
              </button>
            </div>
            <RoutineList
              routines={visibleRoutines}
              initiatives={data ?? []}
              onAdd={() => setEditingRoutine({ mode: 'new' })}
              onEdit={(r) => setEditingRoutine({ mode: 'edit', routine: r })}
              onDelete={setDeletingRoutine}
              onToggle={(r, active) => updateRoutine.mutate({ id: r.id, active }, { onError })}
            />
          </section>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'edit' ? 'Edit initiative' : 'New initiative'}
      >
        {editing && (
          <InitiativeForm
            key={editing.mode === 'edit' ? editing.initiative.id : `new-${editing.quadrant}`}
            initial={editing.mode === 'edit' ? editing.initiative : undefined}
            defaultQuadrant={editing.mode === 'new' ? editing.quadrant : 2}
            defaultRoleId={typeof roleFilter === 'number' ? roleFilter : null}
            roles={roleList}
            busy={create.isPending || update.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(draft) => {
              const done = { onSuccess: () => setEditing(null), onError }
              if (editing.mode === 'edit')
                update.mutate({ id: editing.initiative.id, ...draft }, done)
              else create.mutate(draft, done)
            }}
          />
        )}
      </Modal>

      <Modal
        open={editingRoutine !== null}
        onClose={() => setEditingRoutine(null)}
        title={editingRoutine?.mode === 'edit' ? 'Edit routine' : 'New routine'}
      >
        {editingRoutine && (
          <RoutineForm
            key={editingRoutine.mode === 'edit' ? editingRoutine.routine.id : 'new'}
            initial={editingRoutine.mode === 'edit' ? editingRoutine.routine : undefined}
            initiatives={activeInitiatives}
            busy={createRoutine.isPending || updateRoutine.isPending}
            onCancel={() => setEditingRoutine(null)}
            onSubmit={(draft) => {
              const done = { onSuccess: () => setEditingRoutine(null), onError }
              if (editingRoutine.mode === 'edit')
                updateRoutine.mutate({ id: editingRoutine.routine.id, ...draft }, done)
              else createRoutine.mutate(draft, done)
            }}
          />
        )}
      </Modal>

      <Modal open={rolesOpen} onClose={() => setRolesOpen(false)} title="Roles">
        {rolesOpen && <RolesEditor />}
      </Modal>

      <ConfirmDialog
        open={deletingRoutine !== null}
        title="Delete routine?"
        message={`“${deletingRoutine?.title}” stops being offered. Days it was already planned on keep their items.`}
        confirmLabel="Delete"
        onConfirm={() => deletingRoutine && deleteRoutine.mutate(deletingRoutine.id, { onError })}
        onClose={() => setDeletingRoutine(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete initiative?"
        message={`“${deleting?.title}” and all of its planned items and logged work will be permanently removed from history. Archive it instead to keep your metrics intact.`}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onError })}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function RoleFilterBar({
  roles,
  value,
  onChange,
  hasUnassigned,
}: {
  roles: Role[]
  value: RoleFilter
  onChange: (f: RoleFilter) => void
  hasUnassigned: boolean
}) {
  const options: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'All roles' },
    ...roles.map((r) => ({ value: r.id as RoleFilter, label: r.name })),
    ...(hasUnassigned ? [{ value: 'none' as RoleFilter, label: 'No role' }] : []),
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Filter by role"
      className="mb-3 flex flex-wrap items-center gap-1.5"
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-8 rounded-full border px-3 text-xs font-medium transition ${
              on
                ? 'border-accent-line bg-accent-soft text-accent-ink'
                : 'border-line text-ink-3 hover:bg-subtle hover:text-ink-2'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function QuadrantPanel({
  q,
  initiatives,
  indexOf,
  selected,
  onSelect,
  onAdd,
  onEdit,
  roleName,
}: {
  q: Quadrant
  initiatives: Initiative[]
  indexOf: (i: Initiative) => number
  selected: number
  onSelect: (i: number) => void
  onAdd: () => void
  onEdit: (i: Initiative) => void
  roleName: (roleId: number | null) => string | undefined
}) {
  const meta = quadrantMeta(q)
  return (
    <section
      aria-label={`Q${q} ${meta.name}`}
      className={`card flex min-h-44 flex-col p-3 sm:p-4 ${q === 2 ? 'ring-1 ring-teal-600/20' : ''}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className={`size-2.5 rounded-full ${meta.dot}`} />Q{q} · {meta.name}
            <span className="font-normal text-ink-4">— {meta.verb}</span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">{meta.hint}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add to Q${q}`}
          className="btn-ghost size-7 p-0"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <ul className="flex-1 space-y-1">
        {initiatives.map((i) => {
          const idx = indexOf(i)
          const isSel = idx === selected
          return (
            <li key={i.id} data-nav-index={idx}>
              <button
                type="button"
                onClick={() => (isSel ? onEdit(i) : onSelect(idx))}
                onDoubleClick={() => onEdit(i)}
                className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                  isSel ? `ring-2 ${meta.ring} ${meta.softBg}` : 'hover:bg-subtle'
                } ${i.status !== 'active' ? 'opacity-60' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-medium ${i.status === 'done' ? 'line-through' : ''}`}
                  >
                    {i.title}
                  </span>
                  {i.description && (
                    <span className="line-clamp-1 text-xs text-ink-3">{i.description}</span>
                  )}
                </span>
                {roleName(i.role_id) && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-sunken px-1.5 text-[11px] text-ink-3">
                    {roleName(i.role_id)}
                  </span>
                )}
                {i.status === 'paused' && <Pause className="mt-0.5 size-3.5 text-ink-4" />}
                {(i.status === 'done' || i.status === 'archived') && (
                  <span className="text-[11px] text-ink-4">{i.status}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {initiatives.length === 0 && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-1 rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-4 hover:border-line-strong hover:text-ink-2"
        >
          {q === 2 ? 'What important work keeps getting pushed aside?' : 'Nothing here yet'}
        </button>
      )}
    </section>
  )
}
