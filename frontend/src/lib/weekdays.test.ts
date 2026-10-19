import { describe, expect, it } from 'vitest'

import { describeSchedule } from './weekdays'

describe('describeSchedule', () => {
  it('lists days in week order', () => {
    expect(describeSchedule([4, 0, 2])).toBe('Mon, Wed, Fri')
  })
  it('names common sets', () => {
    expect(describeSchedule([0, 1, 2, 3, 4])).toBe('Weekdays')
    expect(describeSchedule([6, 5])).toBe('Weekends')
    expect(describeSchedule([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
  })
  it('adds the interval when not weekly', () => {
    expect(describeSchedule([1], 2)).toBe('Tue · every 2 weeks')
  })
})
