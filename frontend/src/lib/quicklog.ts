import type { Initiative, PlannedItem } from '../api/client'
import { parseDuration } from './duration'
import { fuzzyScore } from './fuzzy'

/**
 * Quick-entry grammar for logging work, e.g. `drafted intro #book 45m`.
 *   - `#word`  picks the target: `#1`..`#6` = planned item by position, otherwise a fuzzy
 *              match over today's planned items, then initiatives.
 *   - `45m`, `1h`, `1h30m`, `1.5h` sets minutes (bare numbers stay in the title).
 *   - everything else is the title (may be empty: the server falls back to the target name).
 */
export interface ParsedQuickLog {
  title: string
  minutes: number | null
  targetQuery: string | null
}

export function parseQuickLog(input: string): ParsedQuickLog {
  let minutes: number | null = null
  let targetQuery: string | null = null
  const words: string[] = []
  for (const token of input.split(/\s+/).filter(Boolean)) {
    if (targetQuery === null && token.startsWith('#') && token.length > 1) {
      targetQuery = token.slice(1)
      continue
    }
    if (minutes === null && /[hm]/i.test(token)) {
      const parsed = parseDuration(token)
      if (parsed !== null) {
        minutes = parsed
        continue
      }
    }
    words.push(token)
  }
  return { title: words.join(' '), minutes, targetQuery }
}

export type LogTarget =
  | { kind: 'item'; item: PlannedItem; initiative?: Initiative }
  | { kind: 'initiative'; initiative: Initiative }

export function targetKey(t: LogTarget): string {
  return t.kind === 'item' ? `item:${t.item.id}` : `init:${t.initiative.id}`
}

export function targetLabel(t: LogTarget): string {
  return t.kind === 'item' ? t.item.title : t.initiative.title
}

export function targetQuadrant(t: LogTarget): number {
  return t.kind === 'item' ? t.item.quadrant : t.initiative.quadrant
}

/** All candidate targets: planned items first (in plan order), then active initiatives. */
export function logTargets(items: PlannedItem[], initiatives: Initiative[]): LogTarget[] {
  const byId = new Map(initiatives.map((i) => [i.id, i]))
  return [
    ...items.map((item): LogTarget => ({
      kind: 'item',
      item,
      initiative: byId.get(item.initiative_id),
    })),
    ...initiatives
      .filter((i) => i.status === 'active' || i.status === 'paused')
      .map((initiative): LogTarget => ({ kind: 'initiative', initiative })),
  ]
}

/** Rank targets for a `#query`. Planned items get a small bonus so they win ties. */
export function matchTargets(query: string, targets: LogTarget[]): LogTarget[] {
  const q = query.trim()
  if (/^[1-9]$/.test(q)) {
    const items = targets.filter((t) => t.kind === 'item')
    const hit = items[Number(q) - 1]
    return hit ? [hit] : []
  }
  return targets
    .map((t) => {
      const texts =
        t.kind === 'item' ? [t.item.title, t.initiative?.title ?? ''] : [t.initiative.title]
      const scores = texts.map((s) => fuzzyScore(q, s)).filter((s): s is number => s !== null)
      if (!scores.length) return null
      return { t, score: Math.max(...scores) + (t.kind === 'item' ? 5 : 0) }
    })
    .filter((r): r is { t: LogTarget; score: number } => r !== null)
    .toSorted((a, b) => b.score - a.score)
    .map((r) => r.t)
}
