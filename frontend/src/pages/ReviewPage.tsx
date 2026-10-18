import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Moon,
  Star,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import type { Day, Initiative } from '../api/client'
import { useCarryForward, useDay, useInitiatives, useUpdateDay } from '../api/hooks'
import { Kbd } from '../components/Kbd'
import { ErrorBlock, LoadingBlock, PageHeader } from '../components/PageHeader'
import { QuadrantChip } from '../components/Quadrant'
import { useErrorToast, useToast } from '../components/Toast'
import { addDays, dayPhrase, formatDay } from '../lib/dates'
import { formatMinutes, formatPercent } from '../lib/duration'
import { useHotkeys } from '../lib/hotkeys'
import { QUADRANTS, quadrantMeta } from '../lib/quadrants'
import { dayHref, useSelectedDate } from '../lib/useSelectedDate'
import { Stat } from './TodayPage'

export function ReviewPage() {
  const [date] = useSelectedDate()
  const day = useDay(date)
  const { data: initiatives = [] } = useInitiatives(true)
  const updateDay = useUpdateDay(date)
  const carry = useCarryForward(date)
  const tomorrow = addDays(date, 1)
  const tomorrowDay = useDay(tomorrow)
  const onError = useErrorToast()
  const toast = useToast()
  // Draft of the reflection; null means "unchanged from the server value".
  const [draft, setDraft] = useState<{ date: string; text: string } | null>(null)
  const reflection = draft?.date === date ? draft.text : (day.data?.reflection ?? '')
  const setReflection = (text: string) => setDraft({ date, text })

  const items = day.data?.items ?? []
  const carriedIds = new Set((tomorrowDay.data?.items ?? []).map((i) => i.carried_from_id))
  const unfinished = items.filter((i) => !i.done && !carriedIds.has(i.id))

  const saveReflection = () => {
    if (day.data && reflection.trim() !== day.data.reflection)
      updateDay.mutate({ reflection: reflection.trim() }, { onError })
  }
  const setRating = (rating: number) => updateDay.mutate({ rating }, { onError })
  const carryForward = () =>
    unfinished.length &&
    carry.mutate(tomorrow, {
      onSuccess: () => toast(`Moved ${unfinished.length} item(s) to ${dayPhrase(tomorrow)}`),
      onError,
    })
  const complete = () =>
    updateDay.mutate(
      { reflection: reflection.trim(), reviewed: true },
      { onSuccess: () => toast('Day reviewed. Rest well.'), onError },
    )

  useHotkeys([
    ...[1, 2, 3, 4, 5].map((n) => ({
      keys: String(n),
      description: `Rate day ${n}/5`,
      group: 'Review',
      hidden: n !== 1,
      handler: () => setRating(n),
    })),
    {
      keys: 'c',
      description: 'Carry unfinished to tomorrow',
      group: 'Review',
      enabled: unfinished.length > 0,
      handler: carryForward,
    },
    {
      keys: 'r',
      description: 'Write reflection',
      group: 'Review',
      handler: () => document.getElementById('reflection')?.focus(),
    },
    {
      keys: 'mod+enter',
      description: 'Complete review',
      group: 'Review',
      allowInInput: true,
      handler: complete,
    },
  ])

  if (day.isPending) return <LoadingBlock />
  if (day.error) return <ErrorBlock error={day.error} />
  const d = day.data
  const s = d.summary

  return (
    <>
      <PageHeader
        eyebrow={`Evening review · ${formatDay(date, { weekday: 'long' })}`}
        title="Did you work on the most important thing?"
        actions={
          d.reviewed_at ? (
            <Link to={dayHref('/plan', tomorrow)} className="btn-outline">
              <Check className="size-4 text-emerald-600" /> Reviewed · Plan {dayPhrase(tomorrow)}
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={complete}
              disabled={updateDay.isPending}
            >
              <Moon className="size-4" /> Complete review{' '}
              <Kbd keys="mod+enter" className="opacity-60" />
            </button>
          )
        }
      />

      <VerdictHero day={d} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <PlannedVsActual day={d} />
          <ItemsTable day={d} />
          <UnplannedWork day={d} initiatives={initiatives} />
        </div>

        <aside className="space-y-4">
          <section className="card p-4" aria-label="Day metrics">
            <h2 className="eyebrow mb-3">The numbers</h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
              <Stat label="Time logged" value={formatMinutes(s.actual_minutes)} />
              <Stat label="Planned" value={formatMinutes(s.planned_minutes)} />
              <Stat
                label="Q2 share"
                value={formatPercent(s.q2_share)}
                hint="Share of logged time on important, non-urgent work"
              />
              <Stat label="Important (Q1+Q2)" value={formatPercent(s.important_share)} />
              <Stat
                label="On plan"
                value={formatPercent(s.plan_adherence)}
                hint="Share of logged time on initiatives you planned"
              />
              <Stat label="Items done" value={`${s.items_done}/${s.items_planned}`} />
            </dl>
          </section>

          <section className="card space-y-3 p-4" aria-label="Reflection">
            <div>
              <h2 className="eyebrow mb-2 flex items-center justify-between">
                How did today go? <Kbd keys="1" />
              </h2>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Day rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={d.rating === n}
                    onClick={() => setRating(n)}
                    className={`tabular rounded-lg border py-2 text-sm font-semibold transition ${
                      d.rating === n
                        ? 'border-violet-500 bg-violet-600 text-white'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="eyebrow mb-2 flex items-center justify-between">
                Reflection <Kbd keys="r" />
              </span>
              <textarea
                id="reflection"
                className="field min-h-32 resize-y"
                placeholder="What pulled you away from the important work? What will you do differently tomorrow?"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                onBlur={saveReflection}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') e.currentTarget.blur()
                }}
              />
            </label>
          </section>

          {unfinished.length > 0 && (
            <section className="card p-4" aria-label="Unfinished">
              <h2 className="eyebrow mb-1">Unfinished</h2>
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                {unfinished.length} planned item{unfinished.length > 1 ? 's' : ''} didn’t get
                finished.
              </p>
              <button
                type="button"
                className="btn-outline w-full"
                onClick={carryForward}
                disabled={carry.isPending}
              >
                Carry to {dayPhrase(tomorrow)} <Kbd keys="c" />
              </button>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}

function VerdictHero({ day }: { day: Day }) {
  const s = day.summary
  const h = s.highlight
  const content = {
    done: {
      icon: CheckCircle2,
      title: 'Yes. You finished your Highlight.',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
      iconTone: 'text-emerald-600 dark:text-emerald-400',
    },
    worked: {
      icon: CircleDashed,
      title: 'Yes, you worked on your Highlight.',
      tone: 'border-emerald-200/70 bg-emerald-50/50 text-emerald-900 dark:border-emerald-500/15 dark:bg-emerald-500/5 dark:text-emerald-100',
      iconTone: 'text-emerald-600 dark:text-emerald-400',
    },
    missed: {
      icon: X,
      title: 'No. Your Highlight didn’t get any time.',
      tone: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100',
      iconTone: 'text-rose-600 dark:text-rose-400',
    },
    unplanned: {
      icon: CircleSlash,
      title: 'There was no plan, so there was no Highlight.',
      tone: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100',
      iconTone: 'text-amber-600 dark:text-amber-400',
    },
    idle: {
      icon: CircleSlash,
      title: 'Nothing was planned or logged.',
      tone: 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200',
      iconTone: 'text-slate-400',
    },
  }[s.verdict]
  const Icon = content.icon

  return (
    <section
      aria-label="Verdict"
      className={`flex gap-4 rounded-2xl border p-4 sm:p-6 ${content.tone}`}
    >
      <Icon className={`size-8 shrink-0 sm:size-10 ${content.iconTone}`} strokeWidth={1.75} />
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{content.title}</h2>
        {h ? (
          <p className="mt-1 text-sm opacity-80">
            <Star className="mr-1 inline size-3.5 -translate-y-px fill-current" />
            {h.title} · {formatMinutes(h.logged_minutes)} logged
          </p>
        ) : s.actual_minutes > 0 ? (
          <p className="mt-1 text-sm opacity-80">
            You logged {formatMinutes(s.actual_minutes)} without choosing what mattered most first.
          </p>
        ) : null}
        {s.actual_minutes > 0 && (
          <p className="mt-2 text-sm opacity-80">
            {formatPercent(s.important_share)} of your time went to important work
            {s.q2_share > 0 && <> ({formatPercent(s.q2_share)} to Q2)</>}.
          </p>
        )}
      </div>
    </section>
  )
}

function PlannedVsActual({ day }: { day: Day }) {
  const s = day.summary
  const max = Math.max(
    1,
    ...QUADRANTS.flatMap((q) => [s.planned_by_quadrant[q] ?? 0, s.actual_by_quadrant[q] ?? 0]),
  )
  return (
    <section className="card p-4" aria-label="Planned versus actual">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow">Planned vs. actual</h2>
        <span className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm border border-slate-400 border-dashed" />
            Planned
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-slate-500" />
            Actual
          </span>
        </span>
      </div>
      <ul className="space-y-3">
        {QUADRANTS.map((q) => {
          const meta = quadrantMeta(q)
          const planned = s.planned_by_quadrant[q] ?? 0
          const actual = s.actual_by_quadrant[q] ?? 0
          const delta = actual - planned
          return (
            <li
              key={q}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_5rem]"
            >
              <span className="flex items-center gap-1.5 truncate text-xs font-medium">
                <span className={`size-2 rounded-full ${meta.dot}`} />Q{q}{' '}
                <span className="truncate text-slate-500">{meta.name}</span>
              </span>
              <div className="space-y-1">
                <div
                  className={`h-2 rounded-full border-dashed border-slate-400 dark:border-white/30 ${planned ? 'border' : ''}`}
                  style={{ width: `${(planned / max) * 100}%`, minWidth: planned ? 4 : 0 }}
                />
                <div
                  className={`h-2 rounded-full ${meta.dot}`}
                  style={{ width: `${(actual / max) * 100}%`, minWidth: actual ? 4 : 0 }}
                />
              </div>
              <span className="tabular text-right text-xs">
                {formatMinutes(actual)}
                {(planned > 0 || actual > 0) && (
                  <span
                    className={`block ${delta > 0 ? (q <= 2 ? 'text-emerald-600' : 'text-rose-600') : delta < 0 ? (q <= 2 ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-400'}`}
                  >
                    {delta === 0
                      ? '±0'
                      : `${delta > 0 ? '+' : '−'}${formatMinutes(Math.abs(delta))}`}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ItemsTable({ day }: { day: Day }) {
  if (!day.items.length) return null
  return (
    <section className="card overflow-hidden" aria-label="Planned items">
      <h2 className="eyebrow border-b border-slate-100 px-4 py-2.5 dark:border-white/5">
        The plan, revisited
      </h2>
      <ul>
        {day.items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-white/5"
          >
            {item.done ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            ) : item.logged_minutes > 0 ? (
              <CircleDashed className="size-5 shrink-0 text-amber-500" />
            ) : (
              <X className="size-5 shrink-0 text-slate-300 dark:text-slate-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.is_highlight && (
                  <Star className="mr-1 inline size-3.5 -translate-y-px fill-violet-500 text-violet-500" />
                )}
                {item.title}
              </p>
            </div>
            <QuadrantChip q={item.quadrant} />
            <span className="tabular w-24 shrink-0 text-right text-xs text-slate-500">
              {formatMinutes(item.logged_minutes)} / {formatMinutes(item.estimate_minutes)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function UnplannedWork({ day, initiatives }: { day: Day; initiatives: Initiative[] }) {
  const grouped = useMemo(() => {
    const planned = new Set(day.items.map((i) => i.initiative_id))
    const byInit = new Map<number, { minutes: number; titles: string[]; quadrant: number }>()
    for (const log of day.logs) {
      if (planned.has(log.initiative_id)) continue
      const g = byInit.get(log.initiative_id) ?? { minutes: 0, titles: [], quadrant: log.quadrant }
      g.minutes += log.minutes
      g.titles.push(log.title)
      byInit.set(log.initiative_id, g)
    }
    return [...byInit.entries()].toSorted((a, b) => b[1].minutes - a[1].minutes)
  }, [day])
  if (!grouped.length) return null
  return (
    <section className="card overflow-hidden" aria-label="Unplanned work">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-white/5">
        <h2 className="eyebrow">Unplanned work</h2>
        <span className="tabular text-xs text-slate-500">
          {formatMinutes(day.summary.unplanned_minutes)}
        </span>
      </div>
      <ul>
        {grouped.map(([id, g]) => (
          <li
            key={id}
            className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-white/5"
          >
            <QuadrantChip q={g.quadrant} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {initiatives.find((i) => i.id === id)?.title ?? 'Unknown'}
              </p>
              <p className="truncate text-xs text-slate-500">
                {[...new Set(g.titles)].join(' · ')}
              </p>
            </div>
            <span className="tabular text-sm">{formatMinutes(g.minutes)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
