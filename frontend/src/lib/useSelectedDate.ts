import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { isValidISODate, today } from './dates'

/** The day being viewed, from `?d=YYYY-MM-DD` (default: today). */
export function useSelectedDate(): [string, (date: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('d')
  const date = isValidISODate(raw) ? raw : today()
  const setDate = useCallback(
    (next: string) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === today()) p.delete('d')
          else p.set('d', next)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  return [date, setDate]
}

export function dayHref(path: string, date: string): string {
  return date === today() ? path : `${path}?d=${date}`
}
