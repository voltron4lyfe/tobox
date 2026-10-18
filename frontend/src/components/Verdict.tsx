import type { Verdict } from '../api/client'

export interface VerdictMeta {
  label: string
  short: string
  /** Heatmap/legend swatch. */
  swatch: string
  tone: string
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  done: {
    label: 'Highlight done',
    short: 'Done',
    swatch: 'bg-emerald-500',
    tone: 'text-emerald-700 dark:text-emerald-300',
  },
  worked: {
    label: 'Worked on highlight',
    short: 'Worked',
    swatch: 'bg-emerald-300 dark:bg-emerald-700',
    tone: 'text-emerald-700 dark:text-emerald-300',
  },
  missed: {
    label: 'Highlight missed',
    short: 'Missed',
    swatch: 'bg-rose-400 dark:bg-rose-500/80',
    tone: 'text-rose-700 dark:text-rose-300',
  },
  unplanned: {
    label: 'No plan',
    short: 'No plan',
    swatch: 'bg-amber-300 dark:bg-amber-500/70',
    tone: 'text-amber-700 dark:text-amber-300',
  },
  idle: {
    label: 'Nothing tracked',
    short: '—',
    swatch: 'bg-slate-200 dark:bg-white/[0.06]',
    tone: 'text-slate-400',
  },
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
      <span className={`size-2 rounded-full ${meta.swatch}`} />
      {meta.short}
    </span>
  )
}
