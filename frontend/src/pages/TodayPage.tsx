import { ArrowRight, Check, Plus, Star, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { Initiative, LogEntry, PlannedItem } from '../api/client'
import {
  useAddLog,
  useDay,
  useDeleteLog,
  useInitiatives,
  useUpdateItem,
  useUpdateLog,
} from '../api/hooks'
import { DurationInput } from '../components/Estimate'
import { Kbd } from '../components/Kbd'
import { LogComposer, type LogComposerHandle } from '../components/LogComposer'
import { ErrorBlock, LoadingBlock, PageHeader } from '../components/PageHeader'
import { QuadrantChip, QuadrantMixBar } from '../components/Quadrant'
import { useErrorToast, useToast } from '../components/Toast'
import { formatDay, today } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import { useHotkeys } from '../lib/hotkeys'
import { quadrantMeta } from '../lib/quadrants'
import { logTargets, targetKey, targetLabel, type LogTarget } from '../lib/quicklog'
import { dayHref, useSelectedDate } from '../lib/useSelectedDate'
import { useListNav, useScrollSelected } from '../lib/useListNav'
import { IconButton } from './PlanPage'

type LogPatch = {
  title?: string
  minutes?: number
  planned_item_id?: number | null
  initiative_id?: number
}

type Row = { kind: 'item'; item: PlannedItem } | { kind: 'log'; log: LogEntry }

export function TodayPage() {
  const [date] = useSelectedDate()
  const day = useDay(date)
  const initiativesQuery = useInitiatives(true)
  const initiatives = useMemo(() => initiativesQuery.data ?? [], [initiativesQuery.data])
  const addLog = useAddLog(date)
  const updateLog = useUpdateLog()
  const deleteLog = useDeleteLog()
  const updateItem = useUpdateItem()
  const onError = useErrorToast()
  const toast = useToast()
  const composer = useRef<LogComposerHandle>(null)
  const [editingLogId, setEditingLogId] = useState<number | null>(null)

  const items = useMemo(() => day.data?.items ?? [], [day.data])
  const logs = useMemo(() => (day.data?.logs ?? []).toReversed(), [day.data])
  const targets = useMemo(() => logTargets(items, initiatives), [items, initiatives])
  const plannedInitiatives = useMemo(() => new Set(items.map((i) => i.initiative_id)), [items])
  const highlightTarget = targets.find((t) => t.kind === 'item' && t.item.is_highlight)
  const rows: Row[] = useMemo(
    () => [
      ...items.map((item): Row => ({ kind: 'item', item })),
      ...logs.map((log): Row => ({ kind: 'log', log })),
    ],
    [items, logs],
  )

  const toggleDone = (item: PlannedItem) =>
    updateItem.mutate({ id: item.id, done: !item.done }, { onError })
  const logFor = (item: PlannedItem) =>
    composer.current?.focus(targets.find((t) => t.kind === 'item' && t.item.id === item.id))

  const [selected, setSelected] = useListNav(rows.length, {
    group: 'Track',
    enabled: editingLogId === null,
    actions: [
      {
        keys: 'x, space',
        description: 'Toggle planned item done',
        handler: (i) => {
          const r = rows[i]
          if (r?.kind === 'item') toggleDone(r.item)
        },
      },
      {
        keys: 'enter, shift+l',
        description: 'Log time on planned item',
        handler: (i) => {
          const r = rows[i]
          if (r?.kind === 'item') logFor(r.item)
          else if (r?.kind === 'log') setEditingLogId(r.log.id)
        },
      },
      {
        keys: 'e',
        description: 'Edit log entry',
        handler: (i) => {
          const r = rows[i]
          if (r?.kind === 'log') setEditingLogId(r.log.id)
        },
      },
      {
        keys: 'd, backspace, delete',
        description: 'Delete log entry',
        handler: (i) => {
          const r = rows[i]
          if (r?.kind === 'log') deleteLog.mutate(r.log.id, { onError })
        },
      },
    ],
  })
  useScrollSelected(selected)

  useHotkeys([
    {
      keys: 'shift+h',
      description: 'Log time on the Highlight',
      group: 'Track',
      enabled: !!highlightTarget,
      handler: () => composer.current?.focus(highlightTarget),
    },
  ])

  if (day.isPending) return <LoadingBlock />
  if (day.error) return <ErrorBlock error={day.error} />
  const d = day.data
  const s = d.summary
  const highlight = items.find((i) => i.is_highlight)

  async function submitLog(body: Parameters<typeof addLog.mutateAsync>[0], target: LogTarget) {
    try {
      await addLog.mutateAsync(body)
      toast(
        `Logged ${formatMinutes(body.minutes ?? 0)} · ${targetLabel(target)}${body.mark_done ? ' ✓' : ''}`,
      )
    } catch (err) {
      onError(err)
      throw err
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={`Tracking · ${formatDay(date, { weekday: 'long' })}`}
        title={date === today() ? 'Stay on what matters' : 'What you worked on'}
        actions={
          <Link to={dayHref('/review', date)} className="btn-outline">
            Review day <ArrowRight className="size-4" />
          </Link>
        }
      />

      {!items.length && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No plan for this day yet. You can still log work, but you won’t know if it was the right
            work.
          </p>
          <Link to={dayHref('/plan', date)} className="btn-primary">
            Plan the day <Kbd keys="g p" className="opacity-60" />
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {highlight && (
            <HighlightCard
              item={highlight}
              initiative={initiatives.find((i) => i.id === highlight.initiative_id)}
              onLog={() => logFor(highlight)}
              onToggleDone={() => toggleDone(highlight)}
            />
          )}

          <LogComposer
            ref={composer}
            targets={targets}
            defaultTarget={highlightTarget}
            busy={addLog.isPending}
            onSubmit={submitLog}
          />

          {items.length > 0 && (
            <section className="card overflow-hidden" aria-label="Planned items">
              <h2 className="eyebrow border-b border-slate-100 px-4 py-2.5 dark:border-white/5">
                Plan · {s.items_done}/{s.items_planned} done
              </h2>
              <ul>
                {items.map((item, idx) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    index={idx}
                    selected={selected === idx}
                    onSelect={() => setSelected(idx)}
                    onToggle={() => toggleDone(item)}
                    onLog={() => logFor(item)}
                  />
                ))}
              </ul>
            </section>
          )}

          <section className="card overflow-hidden" aria-label="Log">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-white/5">
              <h2 className="eyebrow">Log</h2>
              <span className="tabular text-xs text-slate-500">
                {formatMinutes(s.actual_minutes)}
              </span>
            </div>
            {logs.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Nothing logged yet. Press <Kbd keys="l" /> to log work as you go.
              </p>
            ) : (
              <ul>
                {logs.map((log, j) => {
                  const idx = items.length + j
                  return (
                    <LogRow
                      key={log.id}
                      log={log}
                      index={idx}
                      targets={targets}
                      initiatives={initiatives}
                      unplanned={!plannedInitiatives.has(log.initiative_id)}
                      selected={selected === idx}
                      editing={editingLogId === log.id}
                      onSelect={() => setSelected(idx)}
                      onEdit={() => setEditingLogId(log.id)}
                      onDone={() => setEditingLogId(null)}
                      onSave={(patch) => updateLog.mutate({ id: log.id, ...patch }, { onError })}
                      onDelete={() => deleteLog.mutate(log.id, { onError })}
                    />
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4" aria-label="Day so far">
            <h2 className="eyebrow">So far</h2>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className="tabular text-3xl font-semibold tracking-tight whitespace-nowrap">
                {formatMinutes(s.actual_minutes)}
              </span>
              <span className="tabular text-sm text-slate-500">
                of {formatMinutes(s.planned_minutes)} planned
              </span>
            </div>
            <div className="mt-4 space-y-2.5 text-xs text-slate-500">
              <div>
                <div className="mb-1 flex justify-between">
                  <span>Planned</span>
                </div>
                <QuadrantMixBar
                  minutes={s.planned_by_quadrant}
                  total={Math.max(s.planned_minutes, s.actual_minutes)}
                  label="Planned"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <span>Actual</span>
                </div>
                <QuadrantMixBar
                  minutes={s.actual_by_quadrant}
                  total={Math.max(s.planned_minutes, s.actual_minutes)}
                  label="Actual"
                />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Q2 share" value={`${Math.round(s.q2_share * 100)}%`} />
              <Stat label="On plan" value={`${Math.round(s.plan_adherence * 100)}%`} />
              <Stat label="Unplanned" value={formatMinutes(s.unplanned_minutes)} />
              <Stat label="Done" value={`${s.items_done}/${s.items_planned}`} />
            </dl>
          </section>
          <p className="hidden px-1 text-xs leading-relaxed text-slate-500 [@media(hover:hover)]:block">
            <Kbd keys="l" /> log · <Kbd keys="shift+h" /> log highlight · <Kbd keys="j" />/
            <Kbd keys="k" /> select · <Kbd keys="x" /> done · <Kbd keys="e" /> edit ·{' '}
            <Kbd keys="d" /> delete
          </p>
        </aside>
      </div>
    </>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="tabular font-semibold" title={hint}>
        {value}
      </dd>
    </div>
  )
}

function HighlightCard({
  item,
  initiative,
  onLog,
  onToggleDone,
}: {
  item: PlannedItem
  initiative?: Initiative
  onLog: () => void
  onToggleDone: () => void
}) {
  const pct = item.estimate_minutes ? Math.min(1, item.logged_minutes / item.estimate_minutes) : 0
  return (
    <section
      aria-label="Highlight"
      className={`card relative overflow-hidden p-4 sm:p-5 ${
        item.done
          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5'
          : 'border-violet-200 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-slate-900/60'
      }`}
    >
      <p
        className={`eyebrow flex items-center gap-1.5 ${item.done ? '!text-emerald-700 dark:!text-emerald-400' : '!text-violet-700 dark:!text-violet-300'}`}
      >
        <Star className="size-3.5 fill-current" /> Today’s highlight
      </p>
      <h2
        className={`mt-1.5 text-lg font-semibold tracking-tight sm:text-xl ${item.done ? 'line-through decoration-emerald-500/60' : ''}`}
      >
        {item.title}
      </h2>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
        <QuadrantChip q={item.quadrant} /> {initiative?.title}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-violet-100 dark:bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${item.done ? 'bg-emerald-500' : 'bg-violet-500'}`}
            style={{ width: `${item.done ? 100 : pct * 100}%` }}
          />
        </div>
        <span className="tabular shrink-0 text-xs text-slate-500">
          {formatMinutes(item.logged_minutes)} / {formatMinutes(item.estimate_minutes)}
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-outline flex-1 sm:flex-none" onClick={onLog}>
          <Plus className="size-4" /> Log time <Kbd keys="shift+h" className="opacity-60" />
        </button>
        <button
          type="button"
          className={`btn flex-1 sm:flex-none ${item.done ? 'btn-ghost' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
          onClick={onToggleDone}
        >
          <Check className="size-4" /> {item.done ? 'Reopen' : 'Mark done'}
        </button>
      </div>
    </section>
  )
}

function ChecklistRow({
  item,
  index,
  selected,
  onSelect,
  onToggle,
  onLog,
}: {
  item: PlannedItem
  index: number
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onLog: () => void
}) {
  const over = item.logged_minutes > item.estimate_minutes
  return (
    <li
      data-nav-index={index}
      onClick={onSelect}
      className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 sm:px-4 dark:border-white/5 ${
        selected ? 'outline-2 -outline-offset-2 outline-violet-500/70' : ''
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={`Mark “${item.title}” ${item.done ? 'not done' : 'done'}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition sm:size-5 ${
          item.done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 hover:border-emerald-400 dark:border-white/20'
        }`}
      >
        {item.done && <Check className="size-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${item.done ? 'text-slate-400 line-through' : ''}`}
        >
          {item.is_highlight && (
            <Star className="mr-1 inline size-3.5 -translate-y-px fill-violet-500 text-violet-500" />
          )}
          {item.title}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`size-1.5 rounded-full ${quadrantMeta(item.quadrant).dot}`} />
          <span className={`tabular ${over ? 'text-amber-600' : ''}`}>
            {formatMinutes(item.logged_minutes)} / {formatMinutes(item.estimate_minutes)}
          </span>
        </p>
      </div>
      <IconButton label={`Log time on ${item.title}`} onClick={onLog}>
        <Plus className="size-4" />
      </IconButton>
    </li>
  )
}

function LogRow({
  log,
  index,
  targets,
  initiatives,
  unplanned,
  selected,
  editing,
  onSelect,
  onEdit,
  onDone,
  onSave,
  onDelete,
}: {
  log: LogEntry
  index: number
  targets: LogTarget[]
  initiatives: Initiative[]
  unplanned: boolean
  selected: boolean
  editing: boolean
  onSelect: () => void
  onEdit: () => void
  onDone: () => void
  onSave: (patch: LogPatch) => void
  onDelete: () => void
}) {
  if (editing) {
    return (
      <LogEditor
        log={log}
        index={index}
        targets={targets}
        initiatives={initiatives}
        onDone={onDone}
        onSave={onSave}
        onDelete={onDelete}
      />
    )
  }
  const time = new Date(log.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const initiative = initiatives.find((i) => i.id === log.initiative_id)

  return (
    <li
      data-nav-index={index}
      onClick={onSelect}
      onDoubleClick={onEdit}
      className={`group flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 sm:px-4 dark:border-white/5 ${
        selected ? 'outline-2 -outline-offset-2 outline-violet-500/70' : ''
      }`}
    >
      <span className="tabular w-14 shrink-0 text-xs text-slate-400">{time}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{log.title}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
          <QuadrantChip q={log.quadrant} />
          <span className="min-w-0 truncate">{initiative?.title}</span>
          {unplanned && (
            <span className="shrink-0 whitespace-nowrap text-amber-600 dark:text-amber-400">
              · unplanned
            </span>
          )}
        </p>
      </div>
      <span className="tabular shrink-0 text-sm font-medium">{formatMinutes(log.minutes)}</span>
      <IconButton label="Edit" onClick={onEdit} className="sm:opacity-0 sm:group-hover:opacity-100">
        <span className="text-xs">Edit</span>
      </IconButton>
    </li>
  )
}

function LogEditor({
  log,
  index,
  targets,
  initiatives,
  onDone,
  onSave,
  onDelete,
}: {
  log: LogEntry
  index: number
  targets: LogTarget[]
  initiatives: Initiative[]
  onDone: () => void
  onSave: (patch: LogPatch) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(log.title)
  const initiative = initiatives.find((i) => i.id === log.initiative_id)
  const currentKey = log.planned_item_id
    ? `item:${log.planned_item_id}`
    : `init:${log.initiative_id}`

  return (
    <li
      data-nav-index={index}
      className="space-y-2 border-b border-slate-100 bg-slate-50/60 px-3 py-3 last:border-b-0 sm:px-4 dark:border-white/5 dark:bg-white/[0.02]"
    >
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim() !== log.title) onSave({ title: title.trim() })
          onDone()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onDone()
          }
        }}
      >
        <input
          autoFocus
          aria-label="Log title"
          className="field"
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
        />
        <DurationInput
          value={log.minutes}
          onChange={(m) => m !== log.minutes && onSave({ minutes: m })}
        />
        <select
          aria-label="Logged against"
          className="field sm:col-span-2"
          value={currentKey}
          onChange={(e) => {
            const t = targets.find((x) => targetKey(x) === e.target.value)
            if (!t) return
            onSave(
              t.kind === 'item'
                ? { planned_item_id: t.item.id }
                : { initiative_id: t.initiative.id, planned_item_id: null },
            )
          }}
        >
          {!targets.some((t) => targetKey(t) === currentKey) && (
            <option value={currentKey}>{initiative?.title ?? 'Unknown'}</option>
          )}
          <optgroup label="Planned">
            {targets
              .filter((t) => t.kind === 'item')
              .map((t) => (
                <option key={targetKey(t)} value={targetKey(t)}>
                  {targetLabel(t)}
                </option>
              ))}
          </optgroup>
          <optgroup label="Initiatives">
            {targets
              .filter((t) => t.kind === 'initiative')
              .map((t) => (
                <option key={targetKey(t)} value={targetKey(t)}>
                  Q{t.kind === 'initiative' ? t.initiative.quadrant : ''} · {targetLabel(t)}
                </option>
              ))}
          </optgroup>
        </select>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-ghost text-rose-600" onClick={onDelete}>
            <Trash2 className="size-4" /> Delete
          </button>
          <button type="submit" className="btn-primary">
            Done
          </button>
        </div>
      </form>
    </li>
  )
}
