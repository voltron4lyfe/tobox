import { Pencil, Repeat, Trash2 } from 'lucide-react'

import type { Initiative, Routine } from '../api/client'
import { formatMinutes } from '../lib/duration'
import { describeSchedule } from '../lib/weekdays'
import { QuadrantChip } from './Quadrant'
import { Switch } from './Switch'

/** The routines list on the Initiatives page. */
export function RoutineList({
  routines,
  initiatives,
  onEdit,
  onDelete,
  onToggle,
  onAdd,
}: {
  routines: Routine[]
  initiatives: Initiative[]
  onEdit: (r: Routine) => void
  onDelete: (r: Routine) => void
  onToggle: (r: Routine, active: boolean) => void
  onAdd: () => void
}) {
  if (routines.length === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-lg border border-dashed border-line px-3 py-4 text-left text-xs text-ink-4 hover:border-line-strong hover:text-ink-2"
      >
        What recurs? A weekly class, soccer practice, a standing 1:1. Routines are offered on your
        plan on the days they’re due.
      </button>
    )
  }
  return (
    <ul className="divide-y divide-line-soft">
      {routines.map((r) => {
        const initiative = initiatives.find((i) => i.id === r.initiative_id)
        return (
          <li
            key={r.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${r.active ? '' : 'opacity-60'}`}
          >
            <Repeat className="size-4 shrink-0 text-ink-4" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.title}</div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
                <span>
                  {describeSchedule(r.weekdays, r.every_weeks)} ·{' '}
                  {formatMinutes(r.estimate_minutes)}
                </span>
                {initiative && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <QuadrantChip q={initiative.quadrant} />
                    <span className="truncate">{initiative.title}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                label={`${r.title} active`}
                checked={r.active}
                onChange={(active) => onToggle(r, active)}
              />
              <button
                type="button"
                aria-label={`Edit ${r.title}`}
                onClick={() => onEdit(r)}
                className="btn-ghost size-8 p-0"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${r.title}`}
                onClick={() => onDelete(r)}
                className="btn-ghost size-8 p-0 text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
