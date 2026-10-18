import { CornerDownLeft, Hash, Timer } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import type { LogEntryCreate } from '../api/client'
import { formatMinutes } from '../lib/duration'
import { consumeFocusLog, FOCUS_LOG_EVENT } from '../lib/events'
import {
  matchTargets,
  parseQuickLog,
  targetKey,
  targetLabel,
  targetQuadrant,
  type LogTarget,
} from '../lib/quicklog'
import { Kbd } from './Kbd'
import { QuadrantChip } from './Quadrant'

export interface LogComposerHandle {
  focus: (target?: LogTarget) => void
}

const DEFAULT_MINUTES = 30

/**
 * Single-line quick entry: `what you did #target 45m`. Enter logs; Mod+Enter logs and marks
 * the planned item done. Targets can also be picked from the chips below the input.
 */
export const LogComposer = forwardRef<
  LogComposerHandle,
  {
    targets: LogTarget[]
    defaultTarget?: LogTarget
    busy?: boolean
    onSubmit: (body: LogEntryCreate, target: LogTarget) => Promise<unknown>
  }
>(function LogComposer({ targets, defaultTarget, busy, onSubmit }, ref) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<LogTarget | null>(null)
  const [suggestIndex, setSuggestIndex] = useState(0)

  useImperativeHandle(ref, () => ({
    focus: (target) => {
      if (target) setChosen(target)
      inputRef.current?.focus()
    },
  }))

  // Honour `l` pressed anywhere in the app, including before this page finished loading.
  useEffect(() => {
    const focusIfRequested = () => {
      if (consumeFocusLog()) inputRef.current?.focus()
    }
    focusIfRequested()
    window.addEventListener(FOCUS_LOG_EVENT, focusIfRequested)
    return () => window.removeEventListener(FOCUS_LOG_EVENT, focusIfRequested)
  }, [])

  const parsed = useMemo(() => parseQuickLog(text), [text])
  // The `#token` currently being typed (last token, no trailing space) drives suggestions.
  const typingTag = /(?:^|\s)#(\S*)$/.exec(text)?.[1]
  const suggestions = useMemo(
    () => (typingTag !== undefined ? matchTargets(typingTag, targets).slice(0, 6) : []),
    [typingTag, targets],
  )
  const tagMatch = parsed.targetQuery ? matchTargets(parsed.targetQuery, targets)[0] : undefined
  const resolvedChosen = chosen && targets.find((t) => targetKey(t) === targetKey(chosen))
  const target = tagMatch ?? resolvedChosen ?? defaultTarget
  const minutes = parsed.minutes ?? DEFAULT_MINUTES
  const unknownTag = parsed.targetQuery !== null && !tagMatch

  function acceptSuggestion(t: LogTarget) {
    setChosen(t)
    setText((s) => s.replace(/(?:^|\s)#\S*$/, '').trimEnd() + (s.trim().startsWith('#') ? '' : ' '))
    setSuggestIndex(0)
    inputRef.current?.focus()
  }

  async function submit(markDone: boolean) {
    if (!target || busy || unknownTag) return
    const body: LogEntryCreate = {
      title: parsed.title,
      minutes,
      ...(target.kind === 'item'
        ? { planned_item_id: target.item.id, mark_done: markDone }
        : { initiative_id: target.initiative.id }),
    }
    try {
      await onSubmit(body, target)
      setText('')
      setChosen(target)
    } catch {
      // Error toast is shown by the caller; keep the text so nothing is lost.
    }
  }

  const items = targets.filter((t) => t.kind === 'item')

  return (
    <div className="card p-3 sm:p-4">
      <div className="relative">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            aria-label="Log work"
            enterKeyHint="send"
            autoComplete="off"
            className="field py-2.5 text-[15px]"
            placeholder="What did you work on?  #target  45m"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSuggestIndex(0)
            }}
            onKeyDown={(e) => {
              if (suggestions.length) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSuggestIndex((i) => Math.min(suggestions.length - 1, i + 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSuggestIndex((i) => Math.max(0, i - 1))
                  return
                }
                if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
                  e.preventDefault()
                  const s = suggestions[suggestIndex]
                  if (s) acceptSuggestion(s)
                  return
                }
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit(e.metaKey || e.ctrlKey)
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                if (text) setText('')
                else e.currentTarget.blur()
              }
            }}
          />
          <button
            type="button"
            className="btn-primary shrink-0 px-3 py-2.5"
            disabled={!target || busy || unknownTag}
            onClick={() => void submit(false)}
          >
            Log <CornerDownLeft className="size-3.5 opacity-70" />
          </button>
        </div>

        {suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Targets"
            className="card absolute z-20 mt-1 w-full p-1 shadow-xl"
          >
            {suggestions.map((s, i) => (
              <li
                key={targetKey(s)}
                role="option"
                aria-selected={i === suggestIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  acceptSuggestion(s)
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${
                  i === suggestIndex ? 'bg-slate-100 dark:bg-white/10' : ''
                }`}
              >
                <QuadrantChip q={targetQuadrant(s)} />
                <span className="truncate">{targetLabel(s)}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-400">
                  {s.kind === 'item'
                    ? s.item.is_highlight
                      ? '★ highlight'
                      : 'planned'
                    : 'initiative'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Parsed preview */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Hash className="size-3.5" />
          {target ? (
            <>
              <QuadrantChip q={targetQuadrant(target)} />
              <span className="max-w-[14rem] truncate font-medium text-slate-700 dark:text-slate-200">
                {targetLabel(target)}
              </span>
            </>
          ) : unknownTag ? (
            <span className="text-rose-600">No match for #{parsed.targetQuery}</span>
          ) : (
            <span>Type # to pick what this was for</span>
          )}
        </span>
        <span className="tabular inline-flex items-center gap-1">
          <Timer className="size-3.5" />
          {formatMinutes(minutes)}
          {parsed.minutes === null && <span className="text-slate-400">(default)</span>}
        </span>
        <span className="ml-auto hidden items-center gap-1 [@media(hover:hover)]:inline-flex">
          <Kbd keys="enter" /> log · <Kbd keys="mod+enter" /> log &amp; complete
        </span>
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {items.map((t, i) => {
            const active = target && targetKey(t) === targetKey(target)
            return (
              <button
                key={targetKey(t)}
                type="button"
                onClick={() => {
                  setChosen(t)
                  inputRef.current?.focus()
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  active
                    ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
                }`}
              >
                <span className="text-slate-400">#{i + 1}</span>
                {t.kind === 'item' && t.item.is_highlight && (
                  <span className="text-violet-500">★</span>
                )}
                <span className="max-w-[10rem] truncate">{targetLabel(t)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})
