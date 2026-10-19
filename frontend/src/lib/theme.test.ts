import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyTheme, nextTheme, resolveTheme, storedTheme, THEME_STORAGE_KEY } from './theme'

type Listener = (e: { matches: boolean }) => void

function mockSystem(dark: boolean) {
  const listeners = new Set<Listener>()
  const media = {
    matches: dark,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => media)
  return {
    listeners,
    flip(next: boolean) {
      media.matches = next
      listeners.forEach((fn) => fn({ matches: next }))
    },
  }
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.head.innerHTML = '<meta name="theme-color" content="" />'
    delete document.documentElement.dataset.theme
  })
  afterEach(() => vi.unstubAllGlobals())

  it('resolves system against the OS setting', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  it('applies an explicit theme and remembers it for the pre-paint script', () => {
    mockSystem(true)
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(storedTheme()).toBe('light')
    expect(document.querySelector('meta')?.getAttribute('content')).toBe('#f8fafc')
  })

  it('follows the OS while set to system, and stops after cleanup', () => {
    const os = mockSystem(false)
    const stop = applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    os.flip(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    stop()
    expect(os.listeners.size).toBe(0)
  })

  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    expect(storedTheme()).toBe('system')
  })
})
