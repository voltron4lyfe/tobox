import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { fuzzyFilter } from '../lib/fuzzy'
import { useRegisteredHotkeys } from '../lib/hotkeys'
import { Kbd } from './Kbd'
import { Modal } from './Modal'

/** Fuzzy launcher over every registered (visible) hotkey action. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="top" title="Command palette">
      <PaletteBody onClose={onClose} />
    </Modal>
  )
}

/** Mounted only while the modal is open, so query/selection reset on every open. */
function PaletteBody({ onClose }: { onClose: () => void }) {
  const hotkeys = useRegisteredHotkeys()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const commands = useMemo(() => {
    const seen = new Set<string>()
    const unique = hotkeys
      .filter((h) => h.description !== 'Command palette')
      .toReversed()
      .filter((h) => !seen.has(h.description) && seen.add(h.description))
    return fuzzyFilter(unique, query, (h) => `${h.group ?? ''} ${h.description}`)
  }, [hotkeys, query])

  function run(index: number) {
    const cmd = commands[index]
    if (!cmd) return
    onClose()
    // Let the dialog close (and focus restore) before running the action.
    setTimeout(() => cmd.handler(new KeyboardEvent('keydown')), 0)
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line-soft px-4">
        <Search className="size-4 text-ink-4" />
        <input
          autoFocus
          aria-label="Search commands"
          className="w-full bg-transparent py-3 text-[15px] outline-none placeholder:text-ink-4"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(commands.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(active)
            }
          }}
        />
      </div>
      <ul className="max-h-80 overflow-y-auto p-1.5">
        {commands.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-3">No commands</li>
        )}
        {commands.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                i === active ? 'bg-sunken' : ''
              }`}
            >
              <span>
                <span className="text-ink-4">{c.group ?? 'General'} · </span>
                {c.description}
              </span>
              <Kbd keys={c.keys} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
