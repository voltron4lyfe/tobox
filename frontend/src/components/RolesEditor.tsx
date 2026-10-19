import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { Role } from '../api/client'
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from '../api/hooks'
import { ConfirmDialog } from './ConfirmDialog'
import { DraftInput } from './DraftInput'
import { useErrorToast } from './Toast'

/** Covey's examples; offered as one-tap starters when no roles exist yet. */
const SUGGESTED = ['Parent', 'Partner', 'Professional', 'Health', 'Friend', 'Community']

/** Add, rename, reorder, and delete roles. */
export function RolesEditor() {
  const roles = useRoles()
  const create = useCreateRole()
  const update = useUpdateRole()
  const remove = useDeleteRole()
  const onError = useErrorToast()
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<Role | null>(null)
  const list = roles.data ?? []

  const add = (value: string) => {
    if (value.trim()) create.mutate(value.trim(), { onSuccess: () => setName(''), onError })
  }
  const swap = (a: Role, b: Role) => {
    update.mutate({ id: a.id, sort_order: b.sort_order }, { onError })
    update.mutate({ id: b.id, sort_order: a.sort_order }, { onError })
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-ink-3">
        Roles are the areas of your life you want to keep in balance. Give each initiative one, then
        see in History which roles are getting your time and which are being squeezed out.
      </p>

      {list.length > 0 ? (
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {list.map((r, i) => (
            <li key={r.id} className="flex items-center gap-1 px-2 py-1.5">
              <DraftInput
                key={r.name}
                value={r.name}
                maxLength={60}
                aria-label={`Rename ${r.name}`}
                className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1.5 text-sm font-medium outline-none focus:bg-subtle"
                onCommit={(next) => next && update.mutate({ id: r.id, name: next }, { onError })}
              />
              <button
                type="button"
                aria-label={`Move ${r.name} up`}
                disabled={i === 0}
                onClick={() => list[i - 1] && swap(r, list[i - 1]!)}
                className="btn-ghost size-8 p-0"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Move ${r.name} down`}
                disabled={i === list.length - 1}
                onClick={() => list[i + 1] && swap(r, list[i + 1]!)}
                className="btn-ghost size-8 p-0"
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${r.name}`}
                onClick={() => setDeleting(r)}
                className="btn-ghost size-8 p-0 text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested roles">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              type="button"
              className="btn-outline px-2.5 py-1 text-xs"
              disabled={create.isPending}
              onClick={() => add(s)}
            >
              <Plus className="size-3.5" /> {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(name)
        }}
      >
        <input
          className="field flex-1"
          data-autofocus
          placeholder="New role, e.g. Father"
          aria-label="New role"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>
          <Plus className="size-4" /> Add
        </button>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'role'}?`}
        message="Its initiatives stay; they just won't have a role."
        confirmLabel="Delete"
        onConfirm={() => deleting && remove.mutate(deleting.id, { onError })}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
