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
} from './client'

export const keys = {
  initiatives: (includeArchived = false) => ['initiatives', { includeArchived }] as const,
  day: (date: string) => ['day', date] as const,
  metrics: (start: string, end: string) => ['metrics', start, end] as const,
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
  return useDayMutation((toDate: string) =>
    unwrap(
      api.POST('/api/days/{day}/carry-forward', {
        params: { path: { day: date } },
        body: { to_date: toDate },
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
