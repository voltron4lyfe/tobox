import type { Theme } from '../api/client'

/**
 * The colour scheme lives in index.css as tokens under <html data-theme="light|dark">. This
 * module only decides which one is active. The choice is mirrored to localStorage so the inline
 * script in index.html can set it before first paint (no flash while preferences load).
 */
export const THEME_STORAGE_KEY = 'tobox.theme'
export const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Browser chrome colour per resolved theme; keep in step with --canvas in index.css. */
const CHROME: Record<Resolved, string> = { light: '#f8fafc', dark: '#0b1120' }
const DARK_QUERY = '(prefers-color-scheme: dark)'

export type Resolved = 'light' | 'dark'

export function resolveTheme(theme: Theme, systemDark: boolean): Resolved {
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

export function nextTheme(theme: Theme): Theme {
  const i = THEMES.findIndex((t) => t.value === theme)
  return THEMES[(i + 1) % THEMES.length]?.value ?? 'system'
}

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((t) => t.value === value)
}

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function paint(resolved: Resolved) {
  document.documentElement.dataset.theme = resolved
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', CHROME[resolved])
  }
}

/**
 * Activate a theme preference. For `system`, follows OS changes until the returned cleanup runs.
 */
export function applyTheme(theme: Theme): () => void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private mode or blocked storage: the theme still applies, it just may flash on reload.
  }
  const media = window.matchMedia(DARK_QUERY)
  paint(resolveTheme(theme, media.matches))
  if (theme !== 'system') return () => {}
  const onChange = (e: MediaQueryListEvent) => paint(resolveTheme('system', e.matches))
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
