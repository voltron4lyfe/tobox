import { useId, useMemo, useState } from 'react'

import type { Initiative } from '../api/client'
import { fuzzyFilter } from '../lib/fuzzy'
import { QuadrantChip } from './Quadrant'

/** Keyboard-first combobox for choosing an initiative. */
export function InitiativePicker({
  initiatives,
  value,
  onChange,
  autoFocus,
  placeholder = 'Initiative…',
  inputRef,
}: {
  initiatives: Initiative[]
  value: number | null
  onChange: (id: number) => void
  autoFocus?: boolean
  placeholder?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const listId = useId()
  const selected = initiatives.find((i) => i.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const options = useMemo(
    () => fuzzyFilter(initiatives, query, (i) => i.title).slice(0, 8),
    [initiatives, query],
  )

  function choose(i: Initiative | undefined) {
    if (!i) return
    onChange(i.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        className="field pr-14"
        placeholder={selected ? selected.title : placeholder}
        value={open ? query : (selected?.title ?? '')}
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(options.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && options.length && (query || !selected)) {
            e.preventDefault()
            choose(options[active])
          } else if (e.key === 'Tab' && query && options.length) {
            choose(options[active])
          } else if (e.key === 'Escape' && query) {
            e.stopPropagation()
            setQuery('')
          }
        }}
      />
      {selected && !open && (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
          <QuadrantChip q={selected.quadrant} />
        </span>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="card absolute z-20 mt-1 max-h-64 w-full overflow-y-auto p-1 shadow-xl"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-3">No matching initiative</li>
          )}
          {options.map((i, idx) => (
            <li
              key={i.id}
              role="option"
              aria-selected={idx === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(i)
              }}
              onMouseEnter={() => setActive(idx)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                idx === active ? 'bg-sunken' : ''
              }`}
            >
              <QuadrantChip q={i.quadrant} />
              <span className="truncate">{i.title}</span>
              {i.status !== 'active' && (
                <span className="ml-auto text-xs text-ink-4">{i.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
