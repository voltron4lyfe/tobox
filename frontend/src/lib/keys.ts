/** Pure keyboard helpers (no React) so they can be unit-tested. */

export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  esc: 'escape',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  del: 'delete',
}

/** Normalise a KeyboardEvent to a chord string like `mod+enter`, `shift+j`, `?`. */
export function chordFromEvent(e: KeyLike): string {
  let key = e.key.toLowerCase()
  key = KEY_ALIASES[key] ?? key
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  // Shift is implied for symbols like `?`; only keep it for letters and named keys.
  const isSymbol = key.length === 1 && !/[a-z0-9]/.test(key)
  if (e.shiftKey && !isSymbol) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

/** Normalise a binding spec (`Mod+Enter`, `g p`) so it can be compared with chordFromEvent. */
export function normalizeSpec(spec: string): string[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((chord) => {
      const parts = chord.toLowerCase().split('+')
      const key = parts.pop() ?? ''
      const mods = new Set(
        parts.map((p) => (p === 'ctrl' || p === 'cmd' || p === 'meta' ? 'mod' : p)),
      )
      const ordered = ['mod', 'alt', 'shift'].filter((m) => mods.has(m))
      return [...ordered, KEY_ALIASES[key] ?? key].join('+')
    })
}

const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)

const KEY_LABELS: Record<string, string> = {
  mod: IS_MAC ? '⌘' : 'Ctrl',
  alt: IS_MAC ? '⌥' : 'Alt',
  shift: '⇧',
  enter: '↵',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  space: 'Space',
}

/** Human labels for a spec: `mod+enter` → [["⌘","↵"]]; `g p` → [["G"],["P"]]. */
export function specLabels(spec: string): string[][] {
  return normalizeSpec(spec).map((chord) =>
    chord.split('+').map((k) => KEY_LABELS[k] ?? (k.length === 1 ? k.toUpperCase() : k)),
  )
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
