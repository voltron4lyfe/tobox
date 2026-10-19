import { useState } from 'react'

import type { Initiative, Routine } from '../api/client'
import { today } from '../lib/dates'
import { WEEKDAYS } from '../lib/weekdays'
import { DurationInput } from './Estimate'
import { InitiativePicker } from './InitiativePicker'
import { Kbd } from './Kbd'
import { Switch } from './Switch'

export interface RoutineDraft {
  initiative_id: number | null
  title: string
  estimate_minutes: number
  weekdays: number[]
  every_weeks: number
  start_date: string
  active: boolean
}

const INTERVALS = [1, 2, 3, 4]

export function RoutineForm({
  initial,
  initiatives,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Routine
  initiatives: Initiative[]
  onSubmit: (draft: RoutineDraft & { initiative_id: number }) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [draft, setDraft] = useState<RoutineDraft>({
    initiative_id: initial?.initiative_id ?? null,
    title: initial?.title ?? '',
    estimate_minutes: initial?.estimate_minutes ?? 60,
    weekdays: initial?.weekdays ?? [],
    every_weeks: initial?.every_weeks ?? 1,
    start_date: initial?.start_date ?? today(),
    active: initial?.active ?? true,
  })
  const set = <K extends keyof RoutineDraft>(k: K, v: RoutineDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))
  const toggleDay = (d: number) =>
    set(
      'weekdays',
      draft.weekdays.includes(d)
        ? draft.weekdays.filter((x) => x !== d)
        : [...draft.weekdays, d].toSorted((a, b) => a - b),
    )
  const initiativeId = draft.initiative_id
  const valid = initiativeId !== null && draft.weekdays.length > 0
  const initiative = initiatives.find((i) => i.id === initiativeId)

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ ...draft, initiative_id: initiativeId, title: draft.title.trim() })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          e.currentTarget.requestSubmit()
        }
      }}
    >
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-ink-3">Initiative</span>
        <InitiativePicker
          initiatives={initiatives}
          value={draft.initiative_id}
          onChange={(id) => set('initiative_id', id)}
          placeholder="Which initiative is this part of?"
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-ink-3">What</span>
        <input
          className="field"
          value={draft.title}
          maxLength={300}
          placeholder={
            initiative ? `Default: ${initiative.title}` : 'e.g. Spin class, Soccer practice'
          }
          onChange={(e) => set('title', e.target.value)}
        />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-ink-3">On</legend>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Weekdays">
          {WEEKDAYS.map((name, i) => {
            const on = draft.weekdays.includes(i)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(i)}
                className={`h-8 w-11 rounded-lg border text-xs font-semibold transition ${
                  on
                    ? 'border-accent-line bg-accent-soft text-accent-ink'
                    : 'border-line text-ink-3 hover:bg-subtle'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-3">Repeats</span>
          <select
            className="field"
            value={draft.every_weeks}
            onChange={(e) => set('every_weeks', Number(e.target.value))}
          >
            {INTERVALS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Every week' : `Every ${n} weeks`}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-ink-3">Takes</span>
          <DurationInput
            value={draft.estimate_minutes}
            onChange={(m) => set('estimate_minutes', m)}
            ariaLabel="Takes"
          />
        </div>
        <label className="col-span-2 block space-y-1.5 sm:col-span-1">
          <span className="text-xs font-medium text-ink-3">Starting</span>
          <input
            type="date"
            className="field"
            value={draft.start_date}
            required
            onChange={(e) => e.target.value && set('start_date', e.target.value)}
          />
        </label>
      </div>

      {initial && (
        <div className="flex items-center justify-between">
          <span className="text-sm">Offer it on the plan</span>
          <Switch label="Active" checked={draft.active} onChange={(v) => set('active', v)} />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || !valid}>
          {initial ? 'Save' : 'Create'} <Kbd keys="mod+enter" className="opacity-60" />
        </button>
      </div>
    </form>
  )
}
