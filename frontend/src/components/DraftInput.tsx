import { useState, type InputHTMLAttributes } from 'react'

/**
 * An input that edits a local draft and commits on blur or Enter (Escape reverts). Remount it
 * with `key={value}` so a new server value replaces the draft.
 */
export function DraftInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (value: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'defaultValue'
>) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }
  return (
    <input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          const input = e.currentTarget
          setDraft(value)
          // Blur after the revert renders, so the commit sees the original value.
          requestAnimationFrame(() => input.blur())
        }
      }}
    />
  )
}
