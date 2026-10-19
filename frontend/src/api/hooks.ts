import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  api,
  unwrap,
  type Day,
  type DayUpdate,
  type InitiativeCreate,
  type InitiativeUpdate,
  type LogEntryCreate,
  type LogEntryUpdate,
  type PlannedItemCreate,
  type PlannedItemUpdate,
  type Preferences,
  type RoleUpdate,
  type RoutineCreate,
  type RoutineUpdate,
  type SessionInfo,
} from './client'

export const keys = {
  session: ['session'] as const,
  roles: ['roles'] as const,
  routines: ['routines'] as const,
  initiatives: (includeArchived = false) => ['initiatives', { includeArchived }] as const,
  day: (date: string) => ['day', date] as const,
  metrics: (start: string, end: string) => ['metrics', start, end] as const,
  preferences: ['preferences'] as const,
  channels: ['notifications', 'channels'] as const,
  webpush: ['notifications', 'webpush'] as const,
  notificationLog: ['notifications', 'log'] as const,
  agents: ['agents'] as const,
  mcp: ['agents', 'mcp'] as const,
}

export function useInitiatives(includeArchived = false) {
  return useQuery({
    queryKey: keys.initiatives(includeArchived),
    queryFn: () =>
      unwrap(
        api.GET('/api/initiatives', { params: { query: { include_archived: includeArchived } } }),
      ),
  })
}

// --- Roles and routines ---------------------------------------------------------------------

export function useRoles() {
  return useQuery({ queryKey: keys.roles, queryFn: () => unwrap(api.GET('/api/roles')) })
}

function useRoleMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.roles })
      // Deleting a role clears it from its initiatives; metrics group by role.
      void qc.invalidateQueries({ queryKey: ['initiatives'] })
      void qc.invalidateQueries({ queryKey: ['metrics'] })
    },
  })
}

export function useCreateRole() {
  return useRoleMutation((name: string) => unwrap(api.POST('/api/roles', { body: { name } })))
}

export function useUpdateRole() {
  return useRoleMutation(({ id, ...body }: RoleUpdate & { id: number }) =>
    unwrap(api.PATCH('/api/roles/{role_id}', { params: { path: { role_id: id } }, body })),
  )
}

export function useDeleteRole() {
  return useRoleMutation((id: number) =>
    unwrap(api.DELETE('/api/roles/{role_id}', { params: { path: { role_id: id } } })),
  )
}

export function useRoutines() {
  return useQuery({ queryKey: keys.routines, queryFn: () => unwrap(api.GET('/api/routines')) })
}

function useRoutineMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.routines })
      // Days list the routines due on them.
      void qc.invalidateQueries({ queryKey: ['day'] })
      void qc.invalidateQueries({ queryKey: ['metrics'] })
    },
  })
}

export function useCreateRoutine() {
  return useRoutineMutation((body: RoutineCreate) => unwrap(api.POST('/api/routines', { body })))
}

export function useUpdateRoutine() {
  return useRoutineMutation(({ id, ...body }: RoutineUpdate & { id: number }) =>
    unwrap(api.PATCH('/api/routines/{routine_id}', { params: { path: { routine_id: id } }, body })),
  )
}

export function useDeleteRoutine() {
  return useRoutineMutation((id: number) =>
    unwrap(api.DELETE('/api/routines/{routine_id}', { params: { path: { routine_id: id } } })),
  )
}

export function useDay(date: string) {
  return useQuery({
    queryKey: keys.day(date),
    queryFn: () => unwrap(api.GET('/api/days/{day}', { params: { path: { day: date } } })),
  })
}

export function useMetrics(start: string, end: string) {
  return useQuery({
    queryKey: keys.metrics(start, end),
    queryFn: () => unwrap(api.GET('/api/metrics', { params: { query: { start, end } } })),
  })
}

function useInitiativeMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['initiatives'] })
      void qc.invalidateQueries({ queryKey: ['metrics'] })
      // Days show initiative titles, and deleting one cascades to its items and logs.
      void qc.invalidateQueries({ queryKey: ['day'] })
    },
  })
}

export function useCreateInitiative() {
  return useInitiativeMutation((body: InitiativeCreate) =>
    unwrap(api.POST('/api/initiatives', { body })),
  )
}

export function useUpdateInitiative() {
  return useInitiativeMutation(({ id, ...body }: InitiativeUpdate & { id: number }) =>
    unwrap(
      api.PATCH('/api/initiatives/{initiative_id}', {
        params: { path: { initiative_id: id } },
        body,
      }),
    ),
  )
}

export function useDeleteInitiative() {
  return useInitiativeMutation((id: number) =>
    unwrap(
      api.DELETE('/api/initiatives/{initiative_id}', { params: { path: { initiative_id: id } } }),
    ),
  )
}

/** Every day-scoped endpoint returns the updated Day; write it straight into the cache. */
function useDayMutation<V>(fn: (vars: V) => Promise<Day>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (day) => {
      qc.setQueryData(keys.day(day.date), day)
      void qc.invalidateQueries({ queryKey: ['metrics'] })
    },
  })
}

export function useUpdateDay(date: string) {
  return useDayMutation((body: DayUpdate) =>
    unwrap(api.PUT('/api/days/{day}', { params: { path: { day: date } }, body })),
  )
}

export function useAddItem(date: string) {
  return useDayMutation((body: PlannedItemCreate) =>
    unwrap(api.POST('/api/days/{day}/items', { params: { path: { day: date } }, body })),
  )
}

export function useUpdateItem() {
  return useDayMutation(({ id, ...body }: PlannedItemUpdate & { id: number }) =>
    unwrap(api.PATCH('/api/items/{item_id}', { params: { path: { item_id: id } }, body })),
  )
}

export function useDeleteItem() {
  return useDayMutation((id: number) =>
    unwrap(api.DELETE('/api/items/{item_id}', { params: { path: { item_id: id } } })),
  )
}

export function useReorderItems(date: string) {
  return useDayMutation((ids: number[]) =>
    unwrap(
      api.POST('/api/days/{day}/items/reorder', { params: { path: { day: date } }, body: { ids } }),
    ),
  )
}

export function useCarryForward(date: string) {
  return useDayMutation(({ toDate, itemIds }: { toDate: string; itemIds?: number[] }) =>
    unwrap(
      api.POST('/api/days/{day}/carry-forward', {
        params: { path: { day: date } },
        body: { to_date: toDate, item_ids: itemIds ?? null },
      }),
    ),
  )
}

/** Plan the routines due on `date` (or just `routineIds`). */
export function usePlanRoutines(date: string) {
  return useDayMutation((routineIds?: number[]) =>
    unwrap(
      api.POST('/api/days/{day}/routines', {
        params: { path: { day: date } },
        body: { routine_ids: routineIds ?? null },
      }),
    ),
  )
}

export function useAddLog(date: string) {
  return useDayMutation((body: LogEntryCreate) =>
    unwrap(api.POST('/api/days/{day}/logs', { params: { path: { day: date } }, body })),
  )
}

export function useUpdateLog() {
  return useDayMutation(({ id, ...body }: LogEntryUpdate & { id: number }) =>
    unwrap(api.PATCH('/api/logs/{log_id}', { params: { path: { log_id: id } }, body })),
  )
}

export function useDeleteLog() {
  return useDayMutation((id: number) =>
    unwrap(api.DELETE('/api/logs/{log_id}', { params: { path: { log_id: id } } })),
  )
}

// --- Preferences ---------------------------------------------------------------------------

export function usePreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: () => unwrap(api.GET('/api/preferences')),
    staleTime: 60_000,
  })
}

export type PreferencesChange = (current: Preferences) => Preferences

/**
 * Saves a change to the preferences document. Saves run one at a time, and each change is
 * applied to the latest document when its turn comes, so quick successive edits (the timezone
 * sync and a theme toggle, say) never overwrite one another. Shown immediately; refetched if
 * the save fails.
 */
export function useSavePreferences() {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: 'preferences' },
    mutationFn: async (change: PreferencesChange) => {
      await qc.cancelQueries({ queryKey: keys.preferences })
      const current = qc.getQueryData<Preferences>(keys.preferences)
      if (!current) throw new Error('Preferences are still loading')
      const next = change(current)
      qc.setQueryData(keys.preferences, next)
      return unwrap(api.PUT('/api/preferences', { body: next }))
    },
    onError: () => void qc.invalidateQueries({ queryKey: keys.preferences }),
    onSuccess: (saved) => {
      qc.setQueryData(keys.preferences, saved)
      void qc.invalidateQueries({ queryKey: keys.channels })
    },
  })
}

// --- Notifications -------------------------------------------------------------------------

export function useChannels() {
  return useQuery({
    queryKey: keys.channels,
    queryFn: () => unwrap(api.GET('/api/notifications/channels')),
  })
}

export function useWebPushConfig() {
  return useQuery({
    queryKey: keys.webpush,
    queryFn: () => unwrap(api.GET('/api/notifications/webpush')),
  })
}

export function useNotificationLog() {
  return useQuery({
    queryKey: keys.notificationLog,
    queryFn: () => unwrap(api.GET('/api/notifications/log', { params: { query: { limit: 10 } } })),
  })
}

export function useSendTestNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/notifications/test')),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

/** Refresh channel readiness after the browser subscribes or unsubscribes. */
export function useInvalidateNotifications() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: ['notifications'] })
}

// --- AI agents -----------------------------------------------------------------------------

export function useAgents() {
  return useQuery({ queryKey: keys.agents, queryFn: () => unwrap(api.GET('/api/agents')) })
}

export function useMcpInfo() {
  return useQuery({
    queryKey: keys.mcp,
    queryFn: () => unwrap(api.GET('/api/agents/mcp')),
    staleTime: Infinity,
  })
}

export function useDisconnectAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clientId: string) =>
      unwrap(api.DELETE('/api/agents/{client_id}', { params: { path: { client_id: clientId } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.agents }),
  })
}

// --- Sign-in -------------------------------------------------------------------------------

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => unwrap(api.GET('/api/session')),
    staleTime: Infinity,
  })
}

export function useSignIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (password: string) => unwrap(api.POST('/api/session', { body: { password } })),
    onSuccess: (session) => {
      qc.setQueryData(keys.session, session)
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/session')),
    onSuccess: () => {
      qc.setQueryData<SessionInfo>(keys.session, { password_required: true, signed_in: false })
      // Drop the owner's data from memory; it refetches after the next sign-in.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })
}
