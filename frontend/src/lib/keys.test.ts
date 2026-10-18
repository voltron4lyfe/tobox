import { describe, expect, it } from 'vitest'

import { chordFromEvent, normalizeSpec } from './keys'

const ev = (
  key: string,
  mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('chordFromEvent', () => {
  it('normalises modifiers to mod/alt/shift', () => {
    expect(chordFromEvent(ev('Enter', { ctrlKey: true }))).toBe('mod+enter')
    expect(chordFromEvent(ev('Enter', { metaKey: true }))).toBe('mod+enter')
    expect(chordFromEvent(ev('J', { shiftKey: true }))).toBe('shift+j')
    expect(chordFromEvent(ev('ArrowUp', { altKey: true }))).toBe('alt+arrowup')
  })

  it('drops implied shift for symbols', () => {
    expect(chordFromEvent(ev('?', { shiftKey: true }))).toBe('?')
    expect(chordFromEvent(ev('+', { shiftKey: true }))).toBe('+')
  })
})

describe('normalizeSpec', () => {
  it('splits sequences and orders modifiers', () => {
    expect(normalizeSpec('g p')).toEqual(['g', 'p'])
    expect(normalizeSpec('Shift+Ctrl+K')).toEqual(['mod+shift+k'])
    expect(normalizeSpec('esc')).toEqual(['escape'])
  })
})
