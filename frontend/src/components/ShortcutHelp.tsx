import { useRegisteredHotkeys } from '../lib/hotkeys'
import { Kbd } from './Kbd'
import { Modal } from './Modal'

const GROUP_ORDER = ['Navigation', 'General']

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hotkeys = useRegisteredHotkeys()
  const groups = new Map<string, typeof hotkeys>()
  for (const h of hotkeys) {
    const g = h.group ?? 'General'
    if (!groups.has(g)) groups.set(g, [])
    // Collapse duplicates (same description registered by several components).
    if (!groups.get(g)!.some((x) => x.description === h.description)) groups.get(g)!.push(h)
  }
  const ordered = [...groups.entries()].toSorted(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
  )
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" className="sm:max-w-2xl">
      <div className="grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2">
        {ordered.map(([group, items]) => (
          <section key={group}>
            <h3 className="eyebrow mb-2">{group}</h3>
            <ul className="space-y-1.5">
              {items.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-ink-2">{h.description}</span>
                  <Kbd keys={h.keys} className="!inline-flex" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

function rank(group: string) {
  const i = GROUP_ORDER.indexOf(group)
  return i < 0 ? 1 : i === 0 ? -1 : 2
}
