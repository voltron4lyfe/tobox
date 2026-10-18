import { useEffect, useState } from 'react'

import { useHotkeys, type Hotkey } from './hotkeys'

/**
 * j/k (and arrow) selection over a list. Returns the selected index (-1 = none) and a setter.
 * Extra hotkeys receive the selected index and are only enabled when something is selected.
 */
export function useListNav(
  length: number,
  {
    group = 'List',
    actions = [],
    enabled = true,
  }: {
    group?: string
    actions?: (Omit<Hotkey, 'handler' | 'group'> & { handler: (index: number) => void })[]
    enabled?: boolean
  } = {},
): [number, (i: number) => void] {
  const [rawSelected, setSelected] = useState(-1)
  // Clamp during render so a shrinking list never leaves the selection out of range.
  const selected = Math.min(rawSelected, length - 1)

  useHotkeys([
    {
      keys: 'j, arrowdown',
      description: 'Next item',
      group,
      enabled: enabled && length > 0,
      handler: () => setSelected(Math.min(length - 1, selected + 1)),
    },
    {
      keys: 'k, arrowup',
      description: 'Previous item',
      group,
      enabled: enabled && length > 0,
      handler: () => setSelected(selected < 0 ? length - 1 : Math.max(0, selected - 1)),
    },
    {
      keys: 'escape',
      description: 'Clear selection',
      group,
      hidden: true,
      enabled: enabled && selected >= 0,
      handler: () => setSelected(-1),
    },
    ...actions.map((a) => ({
      ...a,
      group,
      enabled: enabled && selected >= 0 && selected < length && a.enabled !== false,
      handler: () => a.handler(selected),
    })),
  ])

  return [selected, setSelected]
}

/** Scroll the selected element into view when selection changes. */
export function useScrollSelected(selected: number, attr = 'data-nav-index') {
  useEffect(() => {
    if (selected < 0) return
    document
      .querySelector(`[${attr}="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected, attr])
}
