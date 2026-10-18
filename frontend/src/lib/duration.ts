/** Parse a duration token like `45m`, `1h`, `1h30m`, `1.5h`, `90` into minutes. */
export function parseDuration(token: string): number | null {
  const t = token.trim().toLowerCase()
  if (!t) return null
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?$/.exec(t)
  if (!m || (!m[1] && !m[2])) return null
  const minutes = Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0))
  return minutes
}

export function formatMinutes(min: number): string {
  if (min <= 0) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

export function formatHours(min: number): string {
  const h = min / 60
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
