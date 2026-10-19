/** Python weekday numbering (0 = Monday), matching the API. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** "Mon, Wed, Fri", "Weekdays", "Every day"; plus "· every 2 weeks" when not weekly. */
export function describeSchedule(weekdays: number[], everyWeeks = 1): string {
  const days = [...new Set(weekdays)].toSorted((a, b) => a - b)
  const key = days.join(',')
  const when =
    key === '0,1,2,3,4,5,6'
      ? 'Every day'
      : key === '0,1,2,3,4'
        ? 'Weekdays'
        : key === '5,6'
          ? 'Weekends'
          : days.map((d) => WEEKDAYS[d] ?? '?').join(', ')
  return everyWeeks > 1 ? `${when} · every ${everyWeeks} weeks` : when
}
