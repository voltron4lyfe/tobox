import { specLabels } from '../lib/keys'

/** Render a hotkey spec (`mod+enter`, `g p`) as keycaps. Hidden on touch-only screens. */
export function Kbd({ keys, className = '' }: { keys: string; className?: string }) {
  const first = keys.split(',')[0] ?? keys
  return (
    <span className={`hidden items-center gap-1 [@media(hover:hover)]:inline-flex ${className}`}>
      {specLabels(first).map((chord, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {chord.map((k) => (
            <kbd
              key={k}
              className="min-w-[1.4em] rounded border border-line-strong/80 bg-subtle px-1 text-center font-sans text-[10.5px] leading-[1.5] font-medium text-ink-3"
            >
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  )
}
