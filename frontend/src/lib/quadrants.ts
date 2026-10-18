/**
 * Covey's time-management matrix. Q2 (important, not urgent) is where effectiveness lives.
 *
 * Colours are a validated categorical palette (rose-500, teal-600, amber-500/600, blue-500):
 * adjacent pairs stay >= 10 ΔE apart under protan/deutan/tritan simulation in both themes.
 * Q2 is teal rather than emerald so it can't be confused with Q1 red under red-green CVD.
 * Re-validate with the dataviz palette checker before changing any of these.
 */

export type Quadrant = 1 | 2 | 3 | 4
export const QUADRANTS: Quadrant[] = [1, 2, 3, 4]

export interface QuadrantMeta {
  q: Quadrant
  name: string
  axes: string
  verb: string
  hint: string
  /** Tailwind classes; full strings so the compiler sees them. */
  dot: string
  chip: string
  ring: string
  fill: string
  softBg: string
}

export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
  1: {
    q: 1,
    name: 'Necessity',
    axes: 'Urgent · Important',
    verb: 'Do',
    hint: 'Crises, deadlines, pressing problems.',
    dot: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
    ring: 'ring-rose-400/60',
    fill: 'fill-rose-500',
    softBg: 'bg-rose-50/70 dark:bg-rose-500/5',
  },
  2: {
    q: 2,
    name: 'Effectiveness',
    axes: 'Not urgent · Important',
    verb: 'Schedule',
    hint: 'Planning, growth, relationships, prevention.',
    dot: 'bg-teal-600',
    chip: 'bg-teal-100 text-teal-800 dark:bg-teal-600/15 dark:text-teal-300',
    ring: 'ring-teal-400/60',
    fill: 'fill-teal-600',
    softBg: 'bg-teal-50/70 dark:bg-teal-600/5',
  },
  3: {
    q: 3,
    name: 'Distraction',
    axes: 'Urgent · Not important',
    verb: 'Delegate',
    hint: 'Interruptions, some meetings, others’ priorities.',
    dot: 'bg-amber-500 dark:bg-amber-600',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    ring: 'ring-amber-400/60',
    fill: 'fill-amber-500 dark:fill-amber-600',
    softBg: 'bg-amber-50/70 dark:bg-amber-500/5',
  },
  4: {
    q: 4,
    name: 'Waste',
    axes: 'Not urgent · Not important',
    verb: 'Eliminate',
    hint: 'Busywork, time-wasters, escape activities.',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    ring: 'ring-blue-400/60',
    fill: 'fill-blue-500',
    softBg: 'bg-blue-50/70 dark:bg-blue-500/5',
  },
}

export function quadrantMeta(q: number): QuadrantMeta {
  return QUADRANT_META[(q >= 1 && q <= 4 ? q : 4) as Quadrant]
}
