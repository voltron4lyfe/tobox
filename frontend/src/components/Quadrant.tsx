import { formatMinutes } from '../lib/duration'
import { QUADRANTS, quadrantMeta } from '../lib/quadrants'

export function QuadrantDot({ q, className = '' }: { q: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${quadrantMeta(q).dot} ${className}`}
    />
  )
}

export function QuadrantChip({ q, label }: { q: number; label?: string }) {
  const meta = quadrantMeta(q)
  return (
    <span
      title={`Q${q} · ${meta.name} (${meta.axes})`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}
    >
      Q{q}
      {label !== undefined && <span className="max-w-[12rem] truncate font-medium">{label}</span>}
    </span>
  )
}

/** Horizontal stacked bar of minutes per quadrant. */
export function QuadrantMixBar({
  minutes,
  total,
  className = 'h-2',
  label,
}: {
  minutes: Record<string, number>
  /** Scale against this total instead of the bar's own sum (for comparing bars). */
  total?: number
  className?: string
  label?: string
}) {
  const sum = QUADRANTS.reduce((acc, q) => acc + (minutes[q] ?? 0), 0)
  const denom = Math.max(total ?? sum, sum, 1)
  const description = QUADRANTS.map((q) => `Q${q} ${formatMinutes(minutes[q] ?? 0)}`).join(', ')
  return (
    <div
      role="img"
      aria-label={`${label ? `${label}: ` : ''}${description}`}
      title={description}
      className={`flex w-full gap-px overflow-hidden rounded-full bg-slate-100 dark:bg-white/5 ${className}`}
    >
      {QUADRANTS.map((q) => {
        const v = minutes[q] ?? 0
        if (!v) return null
        return (
          <div
            key={q}
            className={`${quadrantMeta(q).dot} transition-all`}
            style={{ width: `${(v / denom) * 100}%` }}
          />
        )
      })}
    </div>
  )
}

export function QuadrantLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 ${className}`}>
      {QUADRANTS.map((q) => (
        <span key={q} className="inline-flex items-center gap-1.5">
          <QuadrantDot q={q} />Q{q} {quadrantMeta(q).name}
        </span>
      ))}
    </div>
  )
}
