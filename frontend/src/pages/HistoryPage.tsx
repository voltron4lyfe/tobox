import { Flame, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import type { DayMetrics, Metrics } from '../api/client'
import { useMetrics } from '../api/hooks'
import {
  MixComparison,
  TimeByQuadrantChart,
  VerdictCalendar,
  VerdictLegend,
} from '../components/charts'
import { Kbd } from '../components/Kbd'
import { ErrorBlock, LoadingBlock, PageHeader } from '../components/PageHeader'
import { QuadrantChip, QuadrantDot } from '../components/Quadrant'
import { VerdictBadge } from '../components/Verdict'
import { addDays, formatDay, today } from '../lib/dates'
import { formatHours, formatMinutes, formatPercent } from '../lib/duration'
import { useHotkeys } from '../lib/hotkeys'
import { QUADRANTS, quadrantMeta } from '../lib/quadrants'
import { dayHref } from '../lib/useSelectedDate'

const RANGES = [
  { key: 'w', label: '7 days', days: 7 },
  { key: 'm', label: '30 days', days: 30 },
  { key: 'q', label: '90 days', days: 90 },
  { key: 'y', label: 'Year', days: 365 },
] as const

export function HistoryPage() {
  const [rangeDays, setRangeDays] = useState<number>(30)
  const end = today()
  const start = addDays(end, -(rangeDays - 1))
  const { data, isPending, error } = useMetrics(start, end)
  const navigate = useNavigate()
  const openDay = (date: string) => navigate(dayHref('/review', date))

  useHotkeys(
    RANGES.map((r) => ({
      keys: r.key,
      description: `Show last ${r.label.toLowerCase()}`,
      group: 'History',
      handler: () => setRangeDays(r.days),
    })),
  )

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Are you working on what matters?"
        description="How often you did your most important thing, and where your time actually went compared to where you planned for it to go."
        actions={
          <div
            role="tablist"
            aria-label="Range"
            className="inline-flex rounded-lg border border-line bg-surface p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={rangeDays === r.days}
                onClick={() => setRangeDays(r.days)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                  rangeDays === r.days ? 'bg-inverse text-on-inverse' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {r.label}
                <Kbd keys={r.key} className="opacity-60" />
              </button>
            ))}
          </div>
        }
      />
      {isPending ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : (
        <HistoryBody data={data} onOpenDay={openDay} />
      )}
    </>
  )
}

function HistoryBody({ data, onOpenDay }: { data: Metrics; onOpenDay: (date: string) => void }) {
  const s = data.summary
  const tracked = useMemo(
    () => data.days.filter((d) => d.verdict !== 'idle').toReversed(),
    [data.days],
  )

  if (s.days_tracked === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-sm font-medium">No tracked days in this range yet.</p>
        <p className="mt-1 text-sm text-ink-3">
          Plan a day, log what you work on, and review it in the evening. Your trends show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card col-span-2 p-4 md:p-5">
          <p className="eyebrow flex items-center gap-1.5">
            <Star className="size-3.5" /> Highlight hit rate
          </p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight md:text-5xl">
            {formatPercent(s.highlight_hit_rate)}
          </p>
          <p className="mt-1 text-sm text-ink-3">
            You worked on your most important thing on{' '}
            <b className="font-semibold text-ink-2">{s.highlight_days}</b> of{' '}
            {data.days.filter((d) => d.highlight).length} planned days.
          </p>
        </div>
        <Tile
          label="Streak"
          value={`${s.current_streak}d`}
          sub={`Best ${s.longest_streak}d`}
          icon={<Flame className={`size-3.5 ${s.current_streak ? 'text-orange-500' : ''}`} />}
        />
        <Tile
          label="Q2 share"
          value={formatPercent(s.q2_share)}
          sub={`${formatPercent(s.important_share)} important`}
        />
        <Tile label="On plan" value={formatPercent(s.avg_plan_adherence)} sub="of logged time" />
        <Tile
          label="Time logged"
          value={formatHours(s.total_minutes)}
          sub={`${s.days_tracked} days tracked`}
        />
        <Tile label="Avg. rating" value={s.avg_rating?.toFixed(1) ?? '—'} sub="out of 5" />
        <Tile label="Plan accuracy" value={formatPercent(s.plan_accuracy)} sub="logged ÷ planned" />
      </section>

      <section className="card min-w-0 p-4" aria-label="Time by quadrant">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="eyebrow">Where the time went</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
            {QUADRANTS.map((q) => (
              <span key={q} className="inline-flex items-center gap-1.5">
                <QuadrantDot q={q} />Q{q} {quadrantMeta(q).name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t-2 border-dashed border-ink-2" />
              Planned
            </span>
          </div>
        </div>
        <div className="pt-16 -mt-14">
          <TimeByQuadrantChart days={data.days} onSelectDay={onOpenDay} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card p-4" aria-label="Highlight calendar">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="eyebrow">Did you do the most important thing?</h2>
            <VerdictLegend />
          </div>
          <VerdictCalendar days={data.days} onSelectDay={onOpenDay} />
        </section>
        <section className="card p-4" aria-label="Planned versus actual mix">
          <h2 className="eyebrow mb-3">Intended vs. actual</h2>
          <MixComparison planned={s.planned_by_quadrant} actual={s.actual_by_quadrant} />
          <p className="mt-4 text-xs leading-relaxed text-ink-3">{mixInsight(data)}</p>
        </section>
      </div>

      {(data.roles.length > 0 || data.routines.length > 0) && (
        <div
          className={`grid gap-4 ${data.roles.length > 0 && data.routines.length > 0 ? 'lg:grid-cols-2' : ''}`}
        >
          {data.roles.length > 0 && <RoleBalance data={data} />}
          {data.routines.length > 0 && <RoutinesKept data={data} />}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <InitiativesTable data={data} />
        <DaysTable days={tracked} onOpenDay={onOpenDay} />
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="card p-4">
      <p className="eyebrow flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function mixInsight(data: Metrics): string {
  const s = data.summary
  const plannedTotal = QUADRANTS.reduce((a, q) => a + (s.planned_by_quadrant[q] ?? 0), 0)
  const plannedQ2 = plannedTotal ? (s.planned_by_quadrant['2'] ?? 0) / plannedTotal : 0
  const urgentActual = s.total_minutes
    ? ((s.actual_by_quadrant['1'] ?? 0) + (s.actual_by_quadrant['3'] ?? 0)) / s.total_minutes
    : 0
  const parts: string[] = []
  if (plannedTotal && s.total_minutes) {
    const gap = s.q2_share - plannedQ2
    if (gap < -0.1)
      parts.push(
        `You planned ${formatPercent(plannedQ2)} Q2 time but spent ${formatPercent(s.q2_share)}. Urgent work is crowding out important work.`,
      )
    else if (gap > 0.1)
      parts.push(
        `You spent more time in Q2 (${formatPercent(s.q2_share)}) than you planned (${formatPercent(plannedQ2)}). Nice.`,
      )
    else
      parts.push(
        `Your Q2 time (${formatPercent(s.q2_share)}) is close to what you planned (${formatPercent(plannedQ2)}).`,
      )
  }
  if (urgentActual > 0.5)
    parts.push(
      `${formatPercent(urgentActual)} of logged time was urgent (Q1+Q3). Covey would ask which of it could have been prevented.`,
    )
  if ((s.actual_by_quadrant['4'] ?? 0) / Math.max(1, s.total_minutes) > 0.15)
    parts.push('More than 15% of your time went to Q4.')
  return parts.join(' ') || 'Log more work to see how your time compares with your plans.'
}

function RoleBalance({ data }: { data: Metrics }) {
  const total = data.roles.reduce((sum, r) => sum + r.actual_minutes, 0)
  const max = Math.max(1, ...data.roles.map((r) => Math.max(r.actual_minutes, r.planned_minutes)))
  const neglected = data.roles.filter((r) => r.role_id !== null && r.actual_minutes === 0)
  return (
    <section className="card overflow-hidden" aria-label="Time by role">
      <h2 className="eyebrow border-b border-line-soft px-4 py-2.5">Balance across roles</h2>
      <ul className="divide-y divide-line-soft">
        {data.roles.map((r) => (
          <li key={r.role_id ?? 'none'} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={`truncate font-medium ${r.role_id === null ? 'text-ink-3' : ''}`}>
                {r.name}
              </span>
              <span className="tabular shrink-0 text-xs text-ink-2">
                {formatMinutes(r.actual_minutes)}
                <span className="text-ink-4">
                  {' '}
                  · {formatPercent(total ? r.actual_minutes / total : 0)} · {r.days_worked}d
                </span>
              </span>
            </div>
            <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent-solid"
                style={{ width: `${(r.actual_minutes / max) * 100}%` }}
              />
            </div>
            {r.planned_minutes > 0 && (
              <p className="tabular mt-1 text-[11px] text-ink-4">
                {formatMinutes(r.planned_minutes)} planned
              </p>
            )}
          </li>
        ))}
      </ul>
      {neglected.length > 0 && (
        <p className="border-t border-line-soft bg-warning-soft px-4 py-2.5 text-xs text-warning-ink">
          Nothing logged for {neglected.map((r) => r.name).join(', ')} in this range. Is that
          deliberate?
        </p>
      )}
    </section>
  )
}

function RoutinesKept({ data }: { data: Metrics }) {
  return (
    <section className="card overflow-hidden" aria-label="Routines">
      <h2 className="eyebrow border-b border-line-soft px-4 py-2.5">Routines kept</h2>
      <ul className="divide-y divide-line-soft">
        {data.routines.map((r) => {
          const rate = r.due_days ? Math.min(1, r.kept_days / r.due_days) : 0
          return (
            <li key={r.routine_id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <QuadrantChip q={r.quadrant} />
                  <span className="truncate font-medium">{r.title}</span>
                </span>
                <span className="tabular shrink-0 text-xs text-ink-2">
                  {r.kept_days} of {r.due_days}
                  <span className="text-ink-4"> · {r.planned_days} planned</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div
                  className={`h-full rounded-full ${quadrantMeta(r.quadrant).dot}`}
                  style={{ width: `${rate * 100}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function InitiativesTable({ data }: { data: Metrics }) {
  const max = Math.max(
    1,
    ...data.initiatives.map((i) => Math.max(i.actual_minutes, i.planned_minutes)),
  )
  return (
    <section className="card overflow-hidden" aria-label="Initiatives">
      <h2 className="eyebrow border-b border-line-soft px-4 py-2.5">Initiatives</h2>
      {data.initiatives.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">No initiative activity in this range.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-32" />
            <col className="w-14" />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th>Initiative</th>
              <th>Logged / planned</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            {data.initiatives.map((i) => (
              <tr key={i.initiative_id} className="border-b border-line-soft last:border-b-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <QuadrantChip q={i.quadrant} />
                    <span className="truncate font-medium">{i.title}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className={`h-full rounded-full ${quadrantMeta(i.quadrant).dot}`}
                      style={{ width: `${(i.actual_minutes / max) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="tabular px-2 py-2.5 text-right text-xs whitespace-nowrap text-ink-2">
                  {formatMinutes(i.actual_minutes)}
                  <span className="block text-ink-4">
                    of {formatMinutes(i.planned_minutes)} plan
                  </span>
                </td>
                <td className="tabular px-4 py-2.5 text-right text-xs whitespace-nowrap text-ink-3">
                  {i.days_worked}d
                  {i.highlight_days > 0 && (
                    <span className="block text-accent">★ {i.highlight_days}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function DaysTable({ days, onOpenDay }: { days: DayMetrics[]; onOpenDay: (d: string) => void }) {
  return (
    <section className="card overflow-hidden" aria-label="Days">
      <h2 className="eyebrow border-b border-line-soft px-4 py-2.5">Days</h2>
      <div className="max-h-[28rem] overflow-y-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-24" />
            <col />
            <col className="w-24" />
            <col className="w-12" />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th>Date</th>
              <th>Highlight</th>
              <th>Q2 share</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.date}
                onClick={() => onOpenDay(d.date)}
                className="cursor-pointer border-b border-line-soft last:border-b-0 hover:bg-subtle"
              >
                <td className="px-4 py-2.5 text-xs whitespace-nowrap text-ink-3">
                  {formatDay(d.date)}
                </td>
                <td className="px-2 py-2.5">
                  <p className="truncate">
                    {d.highlight?.title ?? <span className="text-ink-4">No highlight</span>}
                  </p>
                  <VerdictBadge verdict={d.verdict} />
                </td>
                <td className="tabular px-2 py-2.5 text-right text-xs whitespace-nowrap">
                  {formatPercent(d.q2_share)} <span className="text-ink-4">Q2</span>
                  <span className="block text-ink-4">{formatMinutes(d.actual_minutes)}</span>
                </td>
                <td className="tabular px-4 py-2.5 text-right text-xs text-ink-3">
                  {d.rating ? `${d.rating}/5` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
