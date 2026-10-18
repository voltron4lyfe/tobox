import { describe, expect, it } from 'vitest'

import { formatMinutes, parseDuration } from './duration'

describe('parseDuration', () => {
  it.each([
    ['45m', 45],
    ['1h', 60],
    ['1h30m', 90],
    ['1.5h', 90],
    ['90', 90],
    ['2h5min', 125],
    ['', null],
    ['abc', null],
    ['h', null],
  ])('%s → %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected)
  })
})

describe('formatMinutes', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [95, '1h 35m'],
  ])('%s → %s', (input, expected) => {
    expect(formatMinutes(input)).toBe(expected)
  })
})
