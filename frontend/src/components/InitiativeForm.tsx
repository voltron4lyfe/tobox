import { useState } from 'react'

import type { Initiative, InitiativeStatus, Role } from '../api/client'
import { QUADRANTS, quadrantMeta, type Quadrant } from '../lib/quadrants'
import { Kbd } from './Kbd'

export interface InitiativeDraft {
  title: string
  description: string
  quadrant: Quadrant
  status: InitiativeStatus
  role_id: number | null
}

const STATUSES: InitiativeStatus[] = ['active', 'paused', 'done', 'archived']

export function InitiativeForm({
  initial,
  defaultQuadrant = 2,
  defaultRoleId = null,
  roles,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  initial?: Initiative
  defaultQuadrant?: Quadrant
  defaultRoleId?: number | null
  roles: Role[]
  onSubmit: (draft: InitiativeDraft) => void
  onCancel: () => void
  submitLabel?: string
  busy?: boolean
}) {
  const [draft, setDraft] = useState<InitiativeDraft>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    quadrant: (initial?.quadrant as Quadrant | undefined) ?? defaultQuadrant,
    status: initial?.status ?? 'active',
    role_id: initial ? initial.role_id : defaultRoleId,
  })
  const set = <K extends keyof InitiativeDraft>(k: K, v: InitiativeDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.title.trim()) onSubmit({ ...draft, title: draft.title.trim() })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          e.currentTarget.requestSubmit()
        }
        // Alt+1..4 picks a quadrant without leaving the keyboard.
        if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
          e.preventDefault()
          set('quadrant', Number(e.code.slice(-1)) as Quadrant)
        }
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-ink-3">Title</span>
        <input
          autoFocus
          className="field"
          value={draft.title}
          maxLength={200}
          placeholder="e.g. Ship the Q4 roadmap, Marathon training"
          onChange={(e) => set('title', e.target.value)}
        />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="flex w-full items-center justify-between text-xs font-medium text-ink-3">
          Quadrant <Kbd keys="alt+1" className="opacity-70" />
        </legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {QUADRANTS.map((q) => {
            const meta = quadrantMeta(q)
            const checked = draft.quadrant === q
            return (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => set('quadrant', q)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  checked
                    ? `border-transparent ring-2 ${meta.ring} ${meta.softBg}`
                    : 'border-line hover:bg-subtle'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className={`size-2 rounded-full ${meta.dot}`} />Q{q} · {meta.name}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-3">{meta.axes}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {roles.length > 0 && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-3">Role</span>
          <select
            className="field"
            value={draft.role_id ?? ''}
            onChange={(e) => set('role_id', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-ink-3">Why it matters (optional)</span>
        <textarea
          className="field min-h-[4.5rem] resize-y"
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      {initial && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-3">Status</span>
          <select
            className="field"
            value={draft.status}
            onChange={(e) => set('status', e.target.value as InitiativeStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || !draft.title.trim()}>
          {submitLabel ?? (initial ? 'Save' : 'Create')}{' '}
          <Kbd keys="mod+enter" className="opacity-60" />
        </button>
      </div>
    </form>
  )
}
