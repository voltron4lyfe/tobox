import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { chordFromEvent, isTypingTarget, normalizeSpec } from './keys'

export interface Hotkey {
  /** One or more specs separated by commas, e.g. `j, arrowdown` or `g p`. */
  keys: string
  description: string
  group?: string
  handler: (e: KeyboardEvent) => void
  /** Fire even while focus is in a text field (use for mod+… and escape). */
  allowInInput?: boolean
  enabled?: boolean
  /** Hide from the help overlay and command palette. */
  hidden?: boolean
}

interface Registered extends Hotkey {
  id: number
  sequences: string[][]
  /** Live enabled check; reads the caller's latest props, not the registration snapshot. */
  isEnabled: () => boolean
}

interface HotkeyContextValue {
  register: (hotkeys: (Hotkey & { isEnabled?: () => boolean })[]) => () => void
  list: () => Registered[]
  version: number
}

const HotkeyContext = createContext<HotkeyContextValue | null>(null)
const SEQUENCE_TIMEOUT_MS = 1200

export function HotkeyProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<number, Registered>())
  const nextId = useRef(1)
  const pending = useRef<{ chords: string[]; at: number } | null>(null)
  const [version, setVersion] = useState(0)

  const register = useCallback((hotkeys: (Hotkey & { isEnabled?: () => boolean })[]) => {
    const ids = hotkeys.map((h) => {
      const id = nextId.current++
      registry.current.set(id, {
        ...h,
        id,
        sequences: h.keys.split(',').map((s) => normalizeSpec(s)),
        isEnabled: h.isEnabled ?? (() => h.enabled !== false),
      })
      return id
    })
    setVersion((v) => v + 1)
    return () => {
      ids.forEach((id) => registry.current.delete(id))
      setVersion((v) => v + 1)
    }
  }, [])

  const list = useCallback(() => [...registry.current.values()], [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || ['shift', 'control', 'alt', 'meta'].includes(e.key.toLowerCase())) return
      const chord = chordFromEvent(e)
      const typing = isTypingTarget(e.target)
      const now = Date.now()
      const prefix =
        pending.current && now - pending.current.at < SEQUENCE_TIMEOUT_MS
          ? pending.current.chords
          : []
      const attempt = [...prefix, chord]

      // Latest registration wins, so page-level bindings override global ones.
      const candidates = [...registry.current.values()]
        .toReversed()
        .filter((h) => h.isEnabled() && (!typing || h.allowInInput))

      const match = (seq: string[]) =>
        candidates.find((h) =>
          h.sequences.some((s) => s.length === seq.length && s.every((c, i) => c === seq[i])),
        )
      const exact = match(attempt) ?? (prefix.length ? match([chord]) : undefined)
      if (exact) {
        pending.current = null
        e.preventDefault()
        exact.handler(e)
        return
      }
      const isPrefix = candidates.some((h) =>
        h.sequences.some((s) => s.length > 1 && s[0] === chord),
      )
      pending.current = isPrefix ? { chords: [chord], at: now } : null
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo(() => ({ register, list, version }), [register, list, version])
  return <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>
}

function useHotkeyContext(): HotkeyContextValue {
  const ctx = useContext(HotkeyContext)
  if (!ctx) throw new Error('useHotkeys must be used inside <HotkeyProvider>')
  return ctx
}

/**
 * Register hotkeys for the lifetime of the calling component. Handlers are read
 * through a ref so callers don't need to memoise them.
 */
export function useHotkeys(hotkeys: Hotkey[]) {
  const { register } = useHotkeyContext()
  const latest = useRef(hotkeys)
  latest.current = hotkeys
  const signature = hotkeys
    .map((h) => `${h.keys}|${h.description}|${h.group}|${h.enabled}|${h.allowInInput}|${h.hidden}`)
    .join('\n')

  useEffect(() => {
    return register(
      latest.current.map((h, i) => ({
        ...h,
        handler: (e: KeyboardEvent) => latest.current[i]?.handler(e),
        // Read live so a binding enabled by the latest render works before this effect re-runs.
        isEnabled: () => latest.current[i]?.enabled !== false,
      })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, signature])
}

/** Snapshot of currently registered, visible hotkeys (re-renders on change). */
export function useRegisteredHotkeys(): Registered[] {
  const { list, version } = useHotkeyContext()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => list().filter((h) => !h.hidden && h.isEnabled()), [list, version])
}
