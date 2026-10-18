import { useState } from 'react'

import type { DayMetrics } from '../api/client'
import { bucketize, niceHoursScale, type Bucket } from '../lib/aggregate'
import { addDays, dateRange, formatDay, parseISODate, today, weekday } from '../lib/dates'
import { formatHours, formatMinutes, formatPercent } from '../lib/duration'
import { QUADRANTS, quadrantMeta } from '../lib/quadrants'
import { useElementWidth } from '../lib/useElementWidth'
import { VERDICT_META } from './Verdict'

/* ---------------------------------------------------------------------------------------------
 * Stacked bars: actual minutes per quadrant per day/week, with a planned-total tick.
 * Spec: thin bars, 2px surface gap between stacked segments, rounded data end, recessive grid,
 * per-bar hover tooltip.
 * ------------------------------------------------------------------------------------------- */

export function TimeByQuadrantChart({
  days,
  onSelectDay,
}: {
  days: DayMetrics[]
  onSelectDay?: (date: string) => void
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const by = days.length > 62 ? 'week' : 'day'
  const buckets = bucketize(days, by)
  const height = 200
  const pad = { top: 8, right: 4, bottom: 22, left: 34 }
  const innerW = Math.max(10, width - pad.left - pad.right)
  const innerH = height - pad.top - pad.bottom
  const maxVal = Math.max(60, ...buckets.map((b) => Math.max(b.actualTotal, b.planned)))
  const { max, step } = niceHoursScale(maxVal)
  const slot = innerW / Math.max(1, buckets.length)
  const barW = Math.max(2, Math.min(28, slot * 0.62))
  const y = (m: number) => innerH - (m / max) * innerH
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.ceil(buckets.length / Math.max(1, Math.floor(innerW / 44)))
  const hovered = hover !== null ? buckets[hover] : undefined

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        aria-label="Logged time by quadrant over time"
        className="block overflow-visible"
      >
        <g transform={`translate(${pad.left},${pad.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={innerW}
                y1={y(t)}
                y2={y(t)}
                className="stroke-slate-200 dark:stroke-white/[0.06]"
                strokeWidth={1}
              />
              <text
                x={-6}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-slate-400 text-[10px] tabular-nums"
              >
                {t / 60}h
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const cx = slot * i + slot / 2
            const x = cx - barW / 2
            let acc = 0
            const segs = QUADRANTS.filter((q) => (b.actual[q] ?? 0) > 0)
            return (
              <g
                key={b.key}
                opacity={hover === null || hover === i ? 1 : 0.45}
                className="transition-opacity"
              >
                {segs.map((q, si) => {
                  const v = b.actual[q] ?? 0
                  const y0 = y(acc)
                  acc += v
                  const y1 = y(acc)
                  const isTop = si === segs.length - 1
                  // 2px surface gap between stacked segments.
                  const h = Math.max(1, y0 - y1 - (si > 0 ? 2 : 0))
                  const top = y1
                  const r = isTop ? Math.min(4, barW / 2, h) : 0
                  return (
                    <path
                      key={q}
                      d={roundedTopRect(x, top, barW, h, r)}
                      className={quadrantMeta(q).fill}
                    />
                  )
                })}
                {b.planned > 0 && (
                  <line
                    x1={x - 3}
                    x2={x + barW + 3}
                    y1={y(b.planned)}
                    y2={y(b.planned)}
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="stroke-slate-700 dark:stroke-slate-200"
                    strokeDasharray="3 2"
                  />
                )}
                {/* Hit target larger than the mark */}
                <rect
                  x={cx - slot / 2}
                  y={0}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  className={onSelectDay && by === 'day' ? 'cursor-pointer' : ''}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => by === 'day' && onSelectDay?.(b.start)}
                />
                {i % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={innerH + 15}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px]"
                  >
                    {axisLabel(b.start, buckets.length)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      {hovered && hover !== null && (
        <ChartTooltip x={pad.left + slot * hover + slot / 2} width={width}>
          <p className="mb-1 font-semibold">
            {by === 'week'
              ? `Week of ${formatDay(hovered.start)}`
              : formatDay(hovered.start, { weekday: 'long' })}
          </p>
          <TooltipBody bucket={hovered} />
        </ChartTooltip>
      )}
    </div>
  )
}

function TooltipBody({ bucket }: { bucket: Bucket }) {
  return (
    <div className="space-y-0.5">
      {QUADRANTS.map((q) => (
        <p key={q} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${quadrantMeta(q).dot}`} />Q{q}{' '}
            {quadrantMeta(q).name}
          </span>
          <span className="tabular-nums">{formatMinutes(bucket.actual[q] ?? 0)}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between gap-4 border-t border-slate-200 pt-1 dark:border-white/10">
        <span>Logged / planned</span>
        <span className="tabular-nums">
          {formatMinutes(bucket.actualTotal)} / {formatMinutes(bucket.planned)}
        </span>
      </p>
    </div>
  )
}

export function ChartTooltip({
  x,
  width,
  children,
}: {
  x: number
  width: number
  children: React.ReactNode
}) {
  const left = Math.min(Math.max(x, 110), width - 110)
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-0 z-10 w-56 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
      style={{ left }}
    >
      {children}
    </div>
  )
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function axisLabel(iso: string, count: number) {
  const d = parseISODate(iso)
  if (count <= 8) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ---------------------------------------------------------------------------------------------
 * Planned vs. actual mix: two 100% bars with direct labels.
 * ------------------------------------------------------------------------------------------- */

export function MixComparison({
  planned,
  actual,
}: {
  planned: Record<string, number>
  actual: Record<string, number>
}) {
  return (
    <div className="space-y-4">
      <MixRow label="Planned" minutes={planned} />
      <MixRow label="Actual" minutes={actual} />
    </div>
  )
}

function MixRow({ label, minutes }: { label: string; minutes: Record<string, number> }) {
  const total = QUADRANTS.reduce((a, q) => a + (minutes[q] ?? 0), 0)
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular text-slate-500">{formatHours(total)}</span>
      </div>
      {total === 0 ? (
        <div className="h-6 rounded-md bg-slate-100 dark:bg-white/5" />
      ) : (
        <div className="flex h-6 gap-[2px]">
          {QUADRANTS.filter((q) => (minutes[q] ?? 0) > 0).map((q) => {
            const share = (minutes[q] ?? 0) / total
            return (
              <div
                key={q}
                title={`Q${q} ${quadrantMeta(q).name}: ${formatMinutes(minutes[q] ?? 0)} (${formatPercent(share)})`}
                className={`flex items-center overflow-hidden rounded-[4px] ${quadrantMeta(q).dot}`}
                style={{ width: `${share * 100}%` }}
              >
                {share >= 0.12 && (
                  <span className="truncate px-1.5 text-[11px] font-semibold text-white">
                    Q{q} {formatPercent(share)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------
 * Calendar heatmap: one cell per day, coloured by the day's verdict.
 * ------------------------------------------------------------------------------------------- */

export function VerdictCalendar({
  days,
  onSelectDay,
}: {
  days: DayMetrics[]
  onSelectDay: (date: string) => void
}) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const first = days[0]?.date ?? today()
  const last = days[days.length - 1]?.date ?? today()
  // Pad to whole Mon-Sun weeks.
  const start = addDays(first, -((weekday(first) + 6) % 7))
  const end = addDays(last, (7 - weekday(last)) % 7)
  const all = dateRange(start, end)
  const weeks: string[][] = []
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7))
  const big = weeks.length <= 6

  return (
    <div className="overflow-x-auto pb-1">
      <div className={`inline-flex ${big ? 'w-full max-w-xl flex-col gap-1' : 'gap-[3px]'}`}>
        {big && (
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        )}
        {weeks.map((week) => (
          <div key={week[0]} className={big ? 'grid grid-cols-7 gap-1' : 'flex flex-col gap-[3px]'}>
            {week.map((date) => {
              const d = byDate.get(date)
              const inRange = date >= first && date <= last
              const meta = d ? VERDICT_META[d.verdict] : undefined
              const label = d
                ? `${formatDay(date)}: ${meta!.label}${d.highlight ? ` · ${d.highlight.title}` : ''} · ${formatMinutes(d.actual_minutes)} logged`
                : formatDay(date)
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!inRange}
                  title={label}
                  aria-label={label}
                  onClick={() => onSelectDay(date)}
                  className={`${big ? 'flex aspect-square items-start justify-end rounded-md p-1 text-[10px] sm:aspect-[1.3]' : 'size-3 rounded-[3px]'} ${
                    inRange
                      ? `${meta?.swatch ?? VERDICT_META.idle.swatch} hover:ring-2 hover:ring-slate-400/60`
                      : 'bg-transparent'
                  } ${date === today() ? 'ring-2 ring-slate-900/70 dark:ring-white/70' : ''}`}
                >
                  {big && inRange && (
                    <span
                      className={
                        d && d.verdict !== 'idle'
                          ? 'font-medium text-slate-900/70'
                          : 'text-slate-400'
                      }
                    >
                      {parseISODate(date).getDate()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function VerdictLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {(['done', 'worked', 'missed', 'unplanned', 'idle'] as const).map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[3px] ${VERDICT_META[v].swatch}`} />
          {VERDICT_META[v].label}
        </span>
      ))}
    </div>
  )
}
