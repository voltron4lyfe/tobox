import { describe, expect, it } from 'vitest'

import { addDays, dateRange, dayPhrase, isValidISODate, relativeDayLabel } from './dates'
import { bucketize, niceHoursScale } from './aggregate'
import type { DayMetrics } from '../api/client'

describe('dates', () => {
  it('adds days across month and DST boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false)
    expect(isValidISODate('2028-02-29')).toBe(true)
    expect(isValidISODate('nope')).toBe(false)
  })

  it('labels relative days', () => {
    expect(relativeDayLabel('2026-03-02', '2026-03-02')).toBe('Today')
    expect(relativeDayLabel('2026-03-01', '2026-03-02')).toBe('Yesterday')
    expect(dayPhrase('2026-03-03', '2026-03-02')).toBe('tomorrow')
  })

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-03-01', '2026-03-03')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ])
  })
})

const day = (date: string, q2: number): DayMetrics =>
  ({
    date,
    actual_by_quadrant: { '1': 0, '2': q2, '3': 0, '4': 0 },
    planned_minutes: 60,
    actual_minutes: q2,
  }) as unknown as DayMetrics

describe('aggregate', () => {
  it('buckets by Monday-start week', () => {
    // 2026-03-01 is a Sunday; 03-02 is Monday.
    const b = bucketize(
      [day('2026-03-01', 30), day('2026-03-02', 45), day('2026-03-03', 15)],
      'week',
    )
    expect(b.map((x) => [x.start, x.actualTotal])).toEqual([
      ['2026-02-23', 30],
      ['2026-03-02', 60],
    ])
  })

  it('picks whole-hour ticks', () => {
    expect(niceHoursScale(170)).toEqual({ max: 180, step: 60 })
    expect(niceHoursScale(7 * 60 + 5)).toEqual({ max: 480, step: 120 })
  })
})
