import { useEffect, useRef } from 'react'

import type { Theme } from '../api/client'
import { usePreferences, useSavePreferences } from '../api/hooks'
import { applyTheme, nextTheme, storedTheme, THEMES } from '../lib/theme'
import { useErrorToast, useToast } from './Toast'

/** Keeps <html data-theme> and the server's timezone in step with preferences. Renders nothing. */
export function PreferencesSync() {
  const { data } = usePreferences()
  const save = useSavePreferences()
  const theme = data?.theme ?? storedTheme()
  const zoneSent = useRef(false)

  useEffect(() => applyTheme(theme), [theme])

  // Reminders fire in the user's timezone; adopt this device's until they pick one.
  useEffect(() => {
    if (!data || data.timezone !== null || zoneSent.current) return
    zoneSent.current = true
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    save.mutate((current) => (current.timezone === null ? { ...current, timezone } : current))
  }, [data, save])

  return null
}

export function useSetTheme() {
  const { data } = usePreferences()
  const save = useSavePreferences()
  const onError = useErrorToast()
  return (theme: Theme) => {
    if (!data) applyTheme(theme)
    else save.mutate((current) => ({ ...current, theme }), { onError })
  }
}

export function useCycleTheme() {
  const { data } = usePreferences()
  const setTheme = useSetTheme()
  const toast = useToast()
  return () => {
    const next = nextTheme(data?.theme ?? storedTheme())
    setTheme(next)
    toast(`Theme: ${THEMES.find((t) => t.value === next)?.label ?? next}`)
  }
}
