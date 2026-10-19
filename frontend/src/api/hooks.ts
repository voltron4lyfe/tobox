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
} from './client'

export const keys = {
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

/** Saves the whole document. Applied to the cache immediately and rolled back on failure. */
export function useSavePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Preferences) => unwrap(api.PUT('/api/preferences', { body })),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: keys.preferences })
      const previous = qc.getQueryData<Preferences>(keys.preferences)
      qc.setQueryData(keys.preferences, next)
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.preferences, ctx.previous)
    },
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
