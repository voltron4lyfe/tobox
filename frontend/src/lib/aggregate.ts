import type { DayMetrics } from '../api/client'
import { addDays, weekday } from './dates'

export interface Bucket {
  key: string
  start: string
  end: string
  actual: Record<string, number>
  planned: number
  actualTotal: number
  days: DayMetrics[]
}

const QS = ['1', '2', '3', '4']

/** Group daily metrics into day or ISO-week (Mon-start) buckets for charting. */
export function bucketize(days: DayMetrics[], by: 'day' | 'week'): Bucket[] {
  const buckets = new Map<string, Bucket>()
  for (const d of days) {
    const start = by === 'day' ? d.date : addDays(d.date, -((weekday(d.date) + 6) % 7))
    let b = buckets.get(start)
    if (!b) {
      b = {
        key: start,
        start,
        end: by === 'day' ? start : addDays(start, 6),
        actual: Object.fromEntries(QS.map((q) => [q, 0])),
        planned: 0,
        actualTotal: 0,
        days: [],
      }
      buckets.set(start, b)
    }
    for (const q of QS) b.actual[q]! += d.actual_by_quadrant[q] ?? 0
    b.planned += d.planned_minutes
    b.actualTotal += d.actual_minutes
    b.days.push(d)
  }
  return [...buckets.values()]
}

/** A "nice" axis maximum and tick step for minute values (ticks on whole hours). */
export function niceHoursScale(maxMinutes: number): { max: number; step: number } {
  const hours = Math.max(1, Math.ceil(maxMinutes / 60))
  const step = hours <= 4 ? 1 : hours <= 10 ? 2 : hours <= 24 ? 4 : hours <= 60 ? 10 : 20
  return { max: Math.ceil(hours / step) * step * 60, step: step * 60 }
}
