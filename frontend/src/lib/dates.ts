/** Local-calendar date helpers. Days are identified by ISO `YYYY-MM-DD` strings. */

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function today(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function isValidISODate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISODate(parseISODate(s)) === s
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  })
}

/** "Today", "Yesterday", "Tomorrow", or a formatted date. */
export function relativeDayLabel(iso: string, now: string = today()): string {
  if (iso === now) return 'Today'
  if (iso === addDays(now, -1)) return 'Yesterday'
  if (iso === addDays(now, 1)) return 'Tomorrow'
  return formatDay(iso)
}

export function weekday(iso: string): number {
  return parseISODate(iso).getDay()
}

/** Lower-case phrase for a target day in forward-looking actions: "today", "tomorrow", or a date. */
export function dayPhrase(iso: string, now: string = today()): string {
  if (iso === now) return 'today'
  if (iso === addDays(now, 1)) return 'tomorrow'
  return formatDay(iso)
}
