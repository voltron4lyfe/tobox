import { useRef, useState } from 'react'

/**
 * Text input mounted only while editing, so its draft always starts from `initial`.
 * Enter or blur saves; Escape cancels.
 */
export function InlineTextEdit({
  initial,
  onSave,
  onDone,
  ariaLabel,
  className = 'field py-1',
  maxLength = 300,
}: {
  initial: string
  onSave: (value: string) => void
  onDone: () => void
  ariaLabel: string
  className?: string
  maxLength?: number
}) {
  const [value, setValue] = useState(initial)
  const cancelled = useRef(false)
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      className={className}
      value={value}
      maxLength={maxLength}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const v = value.trim()
        if (!cancelled.current && v && v !== initial) onSave(v)
        onDone()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}
