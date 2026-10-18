import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CornerDownRight,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import type { Initiative, PlannedItem } from '../api/client'
import {
  useAddItem,
  useCarryForward,
  useDay,
  useDeleteItem,
  useInitiatives,
  useReorderItems,
  useUpdateDay,
  useUpdateItem,
} from '../api/hooks'
import { DurationInput } from '../components/Estimate'
import { InitiativePicker } from '../components/InitiativePicker'
import { InlineTextEdit } from '../components/InlineTextEdit'
import { Kbd } from '../components/Kbd'
import { ErrorBlock, LoadingBlock, PageHeader } from '../components/PageHeader'
import { QuadrantChip, QuadrantMixBar } from '../components/Quadrant'
import { useErrorToast } from '../components/Toast'
import { addDays, formatDay, relativeDayLabel } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import { useHotkeys } from '../lib/hotkeys'
import { QUADRANTS, quadrantMeta } from '../lib/quadrants'
import { dayHref, useSelectedDate } from '../lib/useSelectedDate'
import { useListNav, useScrollSelected } from '../lib/useListNav'

const MAX_ITEMS = 6

export function PlanPage() {
  const [date] = useSelectedDate()
  const navigate = useNavigate()
  const day = useDay(date)
  const yesterday = useDay(addDays(date, -1))
  const initiativesQuery = useInitiatives()
  const initiatives = useMemo(
    () => (initiativesQuery.data ?? []).filter((i) => i.status === 'active'),
    [initiativesQuery.data],
  )
  const onError = useErrorToast()

  const addItem = useAddItem(date)
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const reorder = useReorderItems(date)
  const carry = useCarryForward(addDays(date, -1))
  const updateDay = useUpdateDay(date)

  const items = useMemo(() => day.data?.items ?? [], [day.data])
  const full = items.length >= MAX_ITEMS
  const [editingId, setEditingId] = useState<number | null>(null)

  // Add form state
  const [initiativeId, setInitiativeId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState(60)
  const pickerRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  function submitAdd() {
    if (!initiativeId) {
      pickerRef.current?.focus()
      return
    }
    addItem.mutate(
      { initiative_id: initiativeId, title, estimate_minutes: estimate },
      {
        onSuccess: () => {
          setTitle('')
          setInitiativeId(null)
          setEstimate(60)
          pickerRef.current?.focus()
        },
        onError,
      },
    )
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    reorder.mutate(ids, { onError, onSuccess: () => setSelected(target) })
  }

  function makeHighlight(index: number) {
    const ids = items.map((i) => i.id)
    const [picked] = ids.splice(index, 1)
    reorder.mutate([picked!, ...ids], { onError, onSuccess: () => setSelected(0) })
  }

  const [selected, setSelected] = useListNav(items.length, {
    group: 'Plan',
    enabled: editingId === null,
    actions: [
      { keys: 's, h', description: 'Make highlight', handler: makeHighlight },
      { keys: 'shift+k, alt+arrowup', description: 'Move up', handler: (i) => move(i, -1) },
      { keys: 'shift+j, alt+arrowdown', description: 'Move down', handler: (i) => move(i, 1) },
      {
        keys: 'e, enter',
        description: 'Edit item',
        handler: (i) => setEditingId(items[i]?.id ?? null),
      },
      {
        keys: 'x',
        description: 'Toggle done',
        handler: (i) =>
          items[i] && updateItem.mutate({ id: items[i].id, done: !items[i].done }, { onError }),
      },
      {
        keys: '=, +',
        description: 'Estimate +15m',
        handler: (i) =>
          items[i] &&
          updateItem.mutate(
            { id: items[i].id, estimate_minutes: items[i].estimate_minutes + 15 },
            { onError },
          ),
      },
      {
        keys: '-',
        description: 'Estimate −15m',
        handler: (i) =>
          items[i] &&
          updateItem.mutate(
            { id: items[i].id, estimate_minutes: Math.max(0, items[i].estimate_minutes - 15) },
            { onError },
          ),
      },
      {
        keys: 'd, backspace, delete',
        description: 'Remove item',
        handler: (i) => items[i] && deleteItem.mutate(items[i].id, { onError }),
      },
    ],
  })
  useScrollSelected(selected)

  const commit = () =>
    updateDay.mutate(
      { planned: true },
      { onSuccess: () => navigate(dayHref('/today', date)), onError },
    )

  useHotkeys([
    {
      keys: 'a, n',
      description: 'Add to plan',
      group: 'Plan',
      handler: () => pickerRef.current?.focus(),
    },
    {
      keys: 'mod+enter',
      description: 'Commit plan & start tracking',
      group: 'Plan',
      allowInInput: true,
      enabled: items.length > 0,
      handler: commit,
    },
  ])

  // Unfinished items from the previous day that haven't been brought over yet.
  const leftovers = useMemo(() => {
    const prev = yesterday.data?.items ?? []
    const carried = new Set(items.map((i) => i.carried_from_id))
    const sameKey = new Set(items.map((i) => `${i.initiative_id}:${i.title}`))
    return prev.filter(
      (p) => !p.done && !carried.has(p.id) && !sameKey.has(`${p.initiative_id}:${p.title}`),
    )
  }, [yesterday.data, items])

  if (day.isPending) return <LoadingBlock />
  if (day.error) return <ErrorBlock error={day.error} />
  const d = day.data
  const summary = d.summary
  const highlight = items[0]?.is_highlight ? items[0] : undefined

  return (
    <>
      <PageHeader
        eyebrow={`Morning plan · ${formatDay(date, { weekday: 'long' })}`}
        title="What matters most today?"
        description="Pick up to six things, most important first. The first is your Highlight: if you only did one thing today, it should be this."
        actions={
          d.planned_at ? (
            <button
              type="button"
              className="btn-outline"
              onClick={() => navigate(dayHref('/today', date))}
            >
              <Check className="size-4 text-emerald-600" /> Plan committed · Track{' '}
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={!items.length || updateDay.isPending}
              onClick={commit}
            >
              Commit plan <Kbd keys="mod+enter" className="opacity-60" />
            </button>
          )
        }
      />

      <IntentionField
        key={`${date}:${d.intention}`}
        value={d.intention}
        onSave={(intention) => updateDay.mutate({ intention }, { onError })}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {/* Ranked plan */}
          <section aria-label="Today's plan" className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-white/5">
              <h2 className="eyebrow">The plan</h2>
              <span
                className={`tabular text-xs ${full ? 'font-semibold text-amber-600' : 'text-slate-400'}`}
              >
                {items.length} / {MAX_ITEMS}
              </span>
            </div>
            {items.length === 0 ? (
              <EmptyPlan />
            ) : (
              <ol>
                {items.map((item, idx) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    index={idx}
                    count={items.length}
                    initiative={initiativesQuery.data?.find((i) => i.id === item.initiative_id)}
                    selected={idx === selected}
                    editing={editingId === item.id}
                    onSelect={() => setSelected(idx)}
                    onStartEdit={() => setEditingId(item.id)}
                    onStopEdit={() => setEditingId(null)}
                    onSave={(patch) => updateItem.mutate({ id: item.id, ...patch }, { onError })}
                    onMove={(delta) => move(idx, delta)}
                    onHighlight={() => makeHighlight(idx)}
                    onDelete={() => deleteItem.mutate(item.id, { onError })}
                  />
                ))}
              </ol>
            )}

            {/* Add form */}
            <form
              className={`grid gap-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_5.5rem_auto] dark:border-white/5 dark:bg-white/[0.02] ${full ? 'hidden' : ''}`}
              onSubmit={(e) => {
                e.preventDefault()
                submitAdd()
              }}
            >
              <InitiativePicker
                inputRef={pickerRef}
                initiatives={initiatives}
                value={initiativeId}
                onChange={(id) => {
                  setInitiativeId(id)
                  titleRef.current?.focus()
                }}
                placeholder="Initiative… (a)"
              />
              <input
                ref={titleRef}
                className="field"
                placeholder={
                  initiativeId
                    ? `Task (default: ${initiatives.find((i) => i.id === initiativeId)?.title ?? ''})`
                    : 'Specific task (optional)'
                }
                value={title}
                maxLength={300}
                onChange={(e) => setTitle(e.target.value)}
              />
              <DurationInput
                value={estimate}
                onChange={setEstimate}
                ariaLabel="Estimate"
                onEnter={submitAdd}
              />
              <button type="submit" className="btn-primary" disabled={addItem.isPending}>
                <Plus className="size-4" /> Add
              </button>
            </form>
            {full && (
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/5">
                Six is the limit. If something new matters more, remove something first.
              </p>
            )}
          </section>

          <PlanCheck
            items={items}
            highlight={highlight}
            plannedByQuadrant={summary.planned_by_quadrant}
            planned={summary.planned_minutes}
          />
        </div>

        {/* Sources */}
        <aside className="space-y-4">
          {leftovers.length > 0 && (
            <section className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="eyebrow">Unfinished · {relativeDayLabel(addDays(date, -1))}</h2>
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={carry.isPending || items.length + leftovers.length > MAX_ITEMS}
                  onClick={() => carry.mutate(date, { onError })}
                >
                  Carry all
                </button>
              </div>
              <ul className="space-y-1">
                {leftovers.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={full}
                      onClick={() =>
                        addItem.mutate(
                          {
                            initiative_id: p.initiative_id,
                            title: p.title,
                            estimate_minutes: p.estimate_minutes,
                          },
                          { onError },
                        )
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-white/5"
                    >
                      <CornerDownRight className="size-3.5 shrink-0 text-slate-400" />
                      <span className="flex-1 truncate">{p.title}</span>
                      <QuadrantChip q={p.quadrant} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-4">
            <h2 className="eyebrow mb-2">Initiatives</h2>
            {initiatives.length === 0 ? (
              <p className="text-sm text-slate-500">
                No initiatives yet.{' '}
                <Link className="font-medium text-violet-600 underline" to="/initiatives">
                  Create some
                </Link>{' '}
                to plan against.
              </p>
            ) : (
              <InitiativeSources
                initiatives={initiatives}
                plannedIds={new Set(items.map((i) => i.initiative_id))}
                disabled={full}
                onPick={(i) => {
                  setInitiativeId(i.id)
                  titleRef.current?.focus()
                }}
              />
            )}
          </section>
        </aside>
      </div>
    </>
  )
}

function IntentionField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  const save = () => text.trim() !== value && onSave(text.trim())
  return (
    <label className="card flex items-center gap-3 px-4 py-3">
      <span className="eyebrow shrink-0">Intention</span>
      <input
        className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
        placeholder="A word or phrase for how you want to show up today (optional)"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            save()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setText(value)
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function EmptyPlan() {
  return (
    <div className="px-4 py-8 text-center">
      <Star className="mx-auto size-6 text-violet-400" />
      <p className="mt-2 text-sm font-medium">Start with the one thing.</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
        Pick an initiative below (or press <Kbd keys="a" />) and add the task that would make today
        a success. Prefer Q2 work: important, not yet urgent.
      </p>
    </div>
  )
}

function PlanRow({
  item,
  index,
  count,
  initiative,
  selected,
  editing,
  onSelect,
  onStartEdit,
  onStopEdit,
  onSave,
  onMove,
  onHighlight,
  onDelete,
}: {
  item: PlannedItem
  index: number
  count: number
  initiative?: Initiative
  selected: boolean
  editing: boolean
  onSelect: () => void
  onStartEdit: () => void
  onStopEdit: () => void
  onSave: (patch: { title?: string; estimate_minutes?: number }) => void
  onMove: (delta: number) => void
  onHighlight: () => void
  onDelete: () => void
}) {
  const isHighlight = item.is_highlight
  const meta = quadrantMeta(item.quadrant)

  return (
    <li
      data-nav-index={index}
      onClick={onSelect}
      className={`group relative flex items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:px-4 dark:border-white/5 ${
        isHighlight ? 'bg-violet-50/70 dark:bg-violet-500/[0.07]' : ''
      } ${selected ? 'outline-2 -outline-offset-2 outline-violet-500/70' : ''}`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          isHighlight
            ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/30'
            : 'bg-slate-100 text-slate-500 dark:bg-white/5'
        }`}
        title={isHighlight ? 'Highlight' : `#${index + 1}`}
      >
        {isHighlight ? <Star className="size-3.5 fill-current" /> : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <InlineTextEdit
            initial={item.title}
            ariaLabel="Item title"
            onSave={(title) => onSave({ title })}
            onDone={onStopEdit}
          />
        ) : (
          <button
            type="button"
            onDoubleClick={onStartEdit}
            className={`block w-full truncate text-left text-[15px] font-medium ${item.done ? 'text-slate-400 line-through' : ''}`}
          >
            {isHighlight && (
              <span className="block text-[10px] font-semibold tracking-wide text-violet-600 uppercase sm:mr-1.5 sm:inline sm:text-[11px] dark:text-violet-400">
                Highlight
              </span>
            )}
            {item.title}
          </button>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${meta.dot}`} />
            <span className="truncate">
              Q{item.quadrant} · {initiative?.title ?? meta.name}
            </span>
          </span>
          {item.carried_from_id && <span title="Carried over from a previous day">↻ carried</span>}
        </div>
      </div>

      <DurationInput
        key={item.estimate_minutes}
        value={item.estimate_minutes}
        onChange={(m) => m !== item.estimate_minutes && onSave({ estimate_minutes: m })}
        className="w-[4.75rem] shrink-0 border-transparent bg-transparent px-1 py-1 text-xs hover:border-slate-200 dark:bg-transparent"
        ariaLabel={`Estimate for ${item.title}`}
      />

      <div className="flex shrink-0 items-center opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {!isHighlight && (
          <IconButton label="Make highlight" onClick={onHighlight}>
            <Star className="size-4" />
          </IconButton>
        )}
        <IconButton
          label="Move up"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="hidden sm:inline-flex"
        >
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton
          label="Move down"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          className="hidden sm:inline-flex"
        >
          <ArrowDown className="size-4" />
        </IconButton>
        <IconButton label="Remove" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
  className = '',
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`btn-ghost size-8 p-0 ${className}`}
    >
      {children}
    </button>
  )
}

function InitiativeSources({
  initiatives,
  plannedIds,
  disabled,
  onPick,
}: {
  initiatives: Initiative[]
  plannedIds: Set<number>
  disabled: boolean
  onPick: (i: Initiative) => void
}) {
  // Q2 first: it's the quadrant most likely to be neglected in the morning rush.
  const order = [2, 1, 3, 4] as const
  return (
    <div className="space-y-3">
      {order.map((q) => {
        const list = initiatives.filter((i) => i.quadrant === q)
        if (!list.length) return null
        return (
          <div key={q}>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span className={`size-1.5 rounded-full ${quadrantMeta(q).dot}`} />Q{q} ·{' '}
              {quadrantMeta(q).name}
            </p>
            <ul>
              {list.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(i)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-white/5"
                  >
                    <span className="flex-1 truncate">{i.title}</span>
                    {plannedIds.has(i.id) && <Check className="size-3.5 text-emerald-500" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function PlanCheck({
  items,
  highlight,
  plannedByQuadrant,
  planned,
}: {
  items: PlannedItem[]
  highlight?: PlannedItem
  plannedByQuadrant: Record<string, number>
  planned: number
}) {
  if (!items.length) return null
  const notes: { tone: 'warn' | 'good'; text: string }[] = []
  if (!items.some((i) => i.quadrant === 2))
    notes.push({
      tone: 'warn',
      text: 'Nothing from Q2 is planned. Is there important, non-urgent work you can protect time for?',
    })
  if (highlight && highlight.quadrant >= 3)
    notes.push({
      tone: 'warn',
      text: `Your Highlight is Q${highlight.quadrant} (${quadrantMeta(highlight.quadrant).name}). Is it really the most important thing?`,
    })
  if (planned > 8 * 60)
    notes.push({
      tone: 'warn',
      text: `${formatMinutes(planned)} of estimated work. Plans that overflow tend to push out the important stuff.`,
    })
  if (highlight?.quadrant === 2)
    notes.push({ tone: 'good', text: 'Your Highlight is Q2 work. That’s where the leverage is.' })

  return (
    <section className="card p-4" aria-label="Plan check">
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">Planned mix</h2>
        <span className="tabular text-sm font-semibold">{formatMinutes(planned)}</span>
      </div>
      <QuadrantMixBar
        minutes={plannedByQuadrant}
        className="mt-2 h-2.5"
        label="Planned time by quadrant"
      />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {QUADRANTS.filter((q) => (plannedByQuadrant[q] ?? 0) > 0).map((q) => (
          <span key={q} className="tabular inline-flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${quadrantMeta(q).dot}`} />Q{q}{' '}
            {formatMinutes(plannedByQuadrant[q] ?? 0)}
          </span>
        ))}
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.map((n) => (
            <li
              key={n.text}
              className={`rounded-lg px-3 py-2 text-xs ${
                n.tone === 'warn'
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
                  : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
              }`}
            >
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
