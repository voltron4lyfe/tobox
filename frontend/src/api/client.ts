import createClient from 'openapi-fetch'

import type { components, paths } from './schema'

export type Schemas = components['schemas']
export type Initiative = Schemas['InitiativeOut']
export type InitiativeCreate = Schemas['InitiativeCreate']
export type InitiativeUpdate = Schemas['InitiativeUpdate']
export type InitiativeStatus = Initiative['status']
export type Day = Schemas['DayOut']
export type DaySummary = Schemas['DaySummary']
export type PlannedItem = Schemas['PlannedItemOut']
export type PlannedItemCreate = Schemas['PlannedItemCreate']
export type PlannedItemUpdate = Schemas['PlannedItemUpdate']
export type LogEntry = Schemas['LogEntryOut']
export type LogEntryCreate = Schemas['LogEntryCreate']
export type LogEntryUpdate = Schemas['LogEntryUpdate']
export type DayUpdate = Schemas['DayUpdate']
export type Metrics = Schemas['MetricsOut']
export type DayMetrics = Schemas['DayMetrics']
export type Verdict = DaySummary['verdict']
export type Preferences = Schemas['Preferences-Output']
export type PreferencesInput = Schemas['Preferences-Input']
export type Theme = Preferences['theme']
export type NotificationPrefs = Preferences['notifications']
export type ReminderKind = 'plan_reminder' | 'highlight_nudge' | 'review_reminder'
export type ChannelInfo = Schemas['ChannelInfo']
export type Delivery = Schemas['Delivery']
export type NotificationLogEntry = Schemas['NotificationLogOut']
export type Agent = Schemas['AgentOut']
export type McpInfo = Schemas['McpInfo']
export type SessionInfo = Schemas['SessionInfo']

// The header marks requests as Tobox's own; the server refuses /api writes without it (CSRF).
export const api = createClient<paths>({ baseUrl: '', headers: { 'X-Requested-With': 'tobox' } })

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Unwrap an openapi-fetch result, throwing ApiError with the server's detail message. */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise
  if (error !== undefined || !response.ok) {
    throw new ApiError(errorMessage(error) ?? response.statusText, response.status)
  }
  return data as T
}

function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'detail' in error) {
    const { detail } = error as { detail: unknown }
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d: { msg?: string }) => d.msg).join('; ')
    }
  }
  return undefined
}
