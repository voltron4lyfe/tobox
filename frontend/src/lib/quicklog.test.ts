import { describe, expect, it } from 'vitest'

import type { Initiative, PlannedItem } from '../api/client'
import { logTargets, matchTargets, parseQuickLog, targetLabel } from './quicklog'

const initiative = (id: number, title: string, quadrant = 2): Initiative => ({
  id,
  title,
  quadrant,
  description: '',
  status: 'active',
  sort_order: 0,
  created_at: '',
  updated_at: '',
})

const item = (id: number, initiativeId: number, title: string, highlight = false): PlannedItem => ({
  id,
  date: '2026-03-02',
  initiative_id: initiativeId,
  title,
  quadrant: 2,
  estimate_minutes: 60,
  rank: id,
  is_highlight: highlight,
  done: false,
  carried_from_id: null,
  logged_minutes: 0,
})

describe('parseQuickLog', () => {
  it('extracts target, minutes and title in any order', () => {
    expect(parseQuickLog('drafted intro #book 45m')).toEqual({
      title: 'drafted intro',
      minutes: 45,
      targetQuery: 'book',
    })
    expect(parseQuickLog('1h30m #2 review')).toEqual({
      title: 'review',
      minutes: 90,
      targetQuery: '2',
    })
  })

  it('keeps bare numbers and unknown tokens in the title', () => {
    expect(parseQuickLog('fixed 3 bugs')).toEqual({
      title: 'fixed 3 bugs',
      minutes: null,
      targetQuery: null,
    })
    expect(parseQuickLog('read hamlet')).toMatchObject({ title: 'read hamlet', minutes: null })
  })

  it('only takes the first # tag and duration', () => {
    expect(parseQuickLog('#a #b 10m 20m')).toEqual({
      title: '#b 20m',
      minutes: 10,
      targetQuery: 'a',
    })
  })
})

describe('matchTargets', () => {
  const inits = [initiative(1, 'Write the book'), initiative(2, 'Email', 3)]
  const targets = logTargets([item(10, 1, 'Chapter 3 draft', true)], inits)

  it('maps #N to the Nth planned item', () => {
    expect(matchTargets('1', targets).map(targetLabel)).toEqual(['Chapter 3 draft'])
    expect(matchTargets('4', targets)).toEqual([])
  })

  it('prefers planned items on ties and fuzzy-matches initiatives', () => {
    expect(targetLabel(matchTargets('book', targets)[0]!)).toBe('Chapter 3 draft')
    expect(targetLabel(matchTargets('eml', targets)[0]!)).toBe('Email')
  })
})
