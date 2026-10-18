import { useState } from 'react'

import { formatMinutes, parseDuration } from '../lib/duration'

/** Duration text input that accepts `45m`, `1h30m`, `90` and normalises on blur. */
export function DurationInput({
  value,
  onChange,
  className = '',
  ariaLabel = 'Minutes',
  onEnter,
}: {
  value: number
  onChange: (minutes: number) => void
  className?: string
  ariaLabel?: string
  onEnter?: () => void
}) {
  const [text, setText] = useState(formatMinutes(value))
  const [focused, setFocused] = useState(false)
  const shown = focused ? text : formatMinutes(value)
  const commit = () => {
    const parsed = parseDuration(text.replace(/\s+/g, ''))
    if (parsed !== null) onChange(Math.min(parsed, 24 * 60))
    setText(formatMinutes(parsed ?? value))
  }
  return (
    <input
      aria-label={ariaLabel}
      inputMode="text"
      className={`field tabular text-center ${className}`}
      value={shown}
      onFocus={(e) => {
        setFocused(true)
        setText(formatMinutes(value))
        e.target.select()
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          onEnter?.()
        }
      }}
    />
  )
}
