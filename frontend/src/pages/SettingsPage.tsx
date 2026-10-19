import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Bot,
  Check,
  Copy,
  Laptop,
  MessageSquare,
  Moon,
  Palette,
  Send,
  Sun,
  Unplug,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { Agent, Delivery, NotificationPrefs, Preferences, ReminderKind } from '../api/client'
import {
  useAgents,
  useChannels,
  useDisconnectAgent,
  useInvalidateNotifications,
  useMcpInfo,
  useNotificationLog,
  usePreferences,
  useSavePreferences,
  useSendTestNotification,
  useWebPushConfig,
} from '../api/hooks'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DraftInput } from '../components/DraftInput'
import { Kbd } from '../components/Kbd'
import { ErrorBlock, LoadingBlock, PageHeader } from '../components/PageHeader'
import { useSetTheme } from '../components/PreferencesSync'
import { Switch } from '../components/Switch'
import { useErrorToast, useToast } from '../components/Toast'
import { useHotkeys } from '../lib/hotkeys'
import { pushState, subscribePush, unsubscribePush, type PushState } from '../lib/push'
import { THEMES } from '../lib/theme'

const THEME_ICONS: Record<string, LucideIcon> = { system: Laptop, light: Sun, dark: Moon }

const REMINDERS: { kind: ReminderKind; label: string; hint: string }[] = [
  {
    kind: 'plan_reminder',
    label: 'Plan your day',
    hint: 'If nothing is planned yet',
  },
  {
    kind: 'highlight_nudge',
    label: 'Highlight nudge',
    hint: 'If no time is logged on your Highlight yet',
  },
  {
    kind: 'review_reminder',
    label: 'Evening review',
    hint: 'If you logged work but haven’t reviewed',
  },
]

const KIND_LABELS: Record<string, string> = {
  ...Object.fromEntries(REMINDERS.map((r) => [r.kind, r.label])),
  test: 'Test',
}

/** Python's weekday numbering: 0 = Monday. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function SettingsPage() {
  const prefs = usePreferences()
  const save = useSavePreferences()
  const sendTest = useSendTestNotification()
  const onError = useErrorToast()
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)

  const runTest = () =>
    sendTest.mutate(undefined, { onSuccess: (r) => setDeliveries(r.deliveries), onError })

  useHotkeys([
    {
      keys: 'n',
      description: 'Send a test notification',
      group: 'Settings',
      enabled: !!prefs.data,
      handler: runTest,
    },
  ])

  if (prefs.isPending) return <LoadingBlock />
  if (prefs.error) return <ErrorBlock error={prefs.error} />
  const p = prefs.data
  const update = (next: Preferences) => save.mutate(next, { onError })
  const updateNotifications = (n: Partial<NotificationPrefs>) =>
    update({ ...p, notifications: { ...p.notifications, ...n } })

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Saved on the server, so every device you use Tobox on shares them."
      />
      <div className="space-y-6">
        <Appearance />

        <Section
          icon={Bell}
          title="Reminders"
          description="Sent only when there’s something to do."
        >
          <TimezoneRow
            value={p.timezone ?? ''}
            onCommit={(timezone) => update({ ...p, timezone: timezone || null })}
          />
          {REMINDERS.map((r) => {
            const pref = p.notifications[r.kind]
            return (
              <Row key={r.kind} label={r.label} hint={r.hint}>
                <input
                  type="time"
                  aria-label={`${r.label} time`}
                  className="field w-32"
                  disabled={!pref.enabled}
                  defaultValue={pref.time}
                  key={pref.time}
                  onBlur={(e) =>
                    e.target.value &&
                    e.target.value !== pref.time &&
                    updateNotifications({ [r.kind]: { ...pref, time: e.target.value } })
                  }
                />
                <Switch
                  label={r.label}
                  checked={pref.enabled}
                  onChange={(enabled) => updateNotifications({ [r.kind]: { ...pref, enabled } })}
                />
              </Row>
            )
          })}
          <Row label="On these days">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Reminder days">
              {WEEKDAYS.map((name, i) => {
                const on = p.notifications.days.includes(i)
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      updateNotifications({
                        days: on
                          ? p.notifications.days.filter((d) => d !== i)
                          : [...p.notifications.days, i].toSorted(),
                      })
                    }
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
          </Row>
        </Section>

        <Section
          icon={Send}
          title="Delivery"
          description="Where reminders go. Turn on as many as you like."
          action={
            <button
              type="button"
              className="btn-outline"
              onClick={runTest}
              disabled={sendTest.isPending}
            >
              <Send className="size-4" /> Send test <Kbd keys="n" />
            </button>
          }
        >
          <BrowserChannel prefs={p} update={update} />
          <Row icon={MessageSquare} label="Discord" hint={<ChannelStatus name="discord" />} wide>
            <DraftInput
              key={p.notifications.channels.discord.webhook_url}
              value={p.notifications.channels.discord.webhook_url}
              onCommit={(webhook_url) =>
                updateNotifications({
                  channels: {
                    ...p.notifications.channels,
                    discord: { ...p.notifications.channels.discord, webhook_url },
                  },
                })
              }
              type="url"
              inputMode="url"
              aria-label="Discord webhook URL"
              placeholder="https://discord.com/api/webhooks/…"
              className="field min-w-0 flex-1"
            />
            <Switch
              label="Discord notifications"
              checked={p.notifications.channels.discord.enabled}
              onChange={(enabled) =>
                updateNotifications({
                  channels: {
                    ...p.notifications.channels,
                    discord: { ...p.notifications.channels.discord, enabled },
                  },
                })
              }
            />
          </Row>
          {deliveries && (
            <TestResult deliveries={deliveries} onDismiss={() => setDeliveries(null)} />
          )}
          <RecentNotifications />
        </Section>

        <AgentsSection />
      </div>
    </>
  )
}

// --- Layout ----------------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold">{title}</h2>
            {description && <p className="text-sm text-ink-3">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  )
}

function Row({
  icon: Icon,
  label,
  hint,
  wide = false,
  children,
}: {
  icon?: LucideIcon
  label: string
  hint?: ReactNode
  /** Controls take the full width below the label on small screens (text fields). */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${wide ? '' : 'justify-between'}`}
    >
      <div className={`min-w-0 ${wide ? 'w-full sm:w-56' : 'flex-1'}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="size-4 text-ink-3" />}
          {label}
        </div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      <div className={`flex items-center gap-3 ${wide ? 'min-w-0 flex-1' : ''}`}>{children}</div>
    </div>
  )
}

// --- Appearance ------------------------------------------------------------------------------

function Appearance() {
  const { data } = usePreferences()
  const setTheme = useSetTheme()
  const current = data?.theme ?? 'system'
  return (
    <Section icon={Palette} title="Appearance">
      <Row label="Theme" hint="System follows your device’s light/dark setting.">
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex rounded-lg border border-line bg-subtle p-0.5"
        >
          {THEMES.map((t) => {
            const Icon = THEME_ICONS[t.value] ?? Laptop
            const active = current === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t.value)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-raised text-ink shadow-sm ring-1 ring-line'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <Icon className="size-4" /> {t.label}
              </button>
            )
          })}
        </div>
        <Kbd keys="shift+t" />
      </Row>
    </Section>
  )
}

// --- Reminders -------------------------------------------------------------------------------

const DEVICE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()

function TimezoneRow({ value, onCommit }: { value: string; onCommit: (zone: string) => void }) {
  return (
    <Row label="Time zone" hint="Reminder times are in this zone." wide>
      <DraftInput
        key={value}
        value={value}
        onCommit={onCommit}
        list="tobox-zones"
        aria-label="Time zone"
        placeholder={DEVICE_ZONE}
        className="field min-w-0 flex-1"
        spellCheck={false}
        autoComplete="off"
      />
      <datalist id="tobox-zones">
        {ZONES.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </datalist>
      {value !== DEVICE_ZONE && (
        <button type="button" className="btn-ghost shrink-0" onClick={() => onCommit(DEVICE_ZONE)}>
          Use this device’s
        </button>
      )}
    </Row>
  )
}

// --- Delivery --------------------------------------------------------------------------------

function ChannelStatus({ name }: { name: string }) {
  const { data } = useChannels()
  const channel = data?.find((c) => c.name === name)
  if (!channel) return null
  if (!channel.enabled) return <>Off</>
  return (
    <span className={channel.ready ? 'text-success' : 'text-warning'}>
      {channel.ready ? '● ' : '▲ '}
      {channel.detail}
    </span>
  )
}

function usePushState() {
  return useQuery({ queryKey: ['notifications', 'push-state'], queryFn: pushState })
}

function BrowserChannel({
  prefs: p,
  update,
}: {
  prefs: Preferences
  update: (p: Preferences) => void
}) {
  const webpush = useWebPushConfig()
  const state = usePushState()
  const qc = useQueryClient()
  const refresh = useInvalidateNotifications()
  const onError = useErrorToast()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const pref = p.notifications.channels.webpush
  const setEnabled = (enabled: boolean) =>
    update({
      ...p,
      notifications: {
        ...p.notifications,
        channels: { ...p.notifications.channels, webpush: { enabled } },
      },
    })

  const run = async (action: () => Promise<PushState>) => {
    setBusy(true)
    try {
      const next = await action()
      qc.setQueryData(['notifications', 'push-state'], next)
      if (next === 'subscribed' && !pref.enabled) setEnabled(true)
      if (next === 'denied')
        toast('Notifications are blocked for this site in your browser', 'error')
      refresh()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  const device: Record<PushState, ReactNode> = {
    unsupported: (
      <span className="text-xs text-ink-3">Not supported here (needs HTTPS or localhost)</span>
    ),
    denied: <span className="text-xs text-danger">Blocked in browser settings</span>,
    subscribed: (
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={() => run(unsubscribePush)}
      >
        Stop on this device
      </button>
    ),
    off: (
      <button
        type="button"
        className="btn-outline"
        disabled={busy || !webpush.data}
        onClick={() => webpush.data && run(() => subscribePush(webpush.data.public_key))}
      >
        Enable on this device
      </button>
    ),
  }

  return (
    <Row icon={Bell} label="Browser" hint={<ChannelStatus name="webpush" />}>
      {state.data && device[state.data]}
      <Switch label="Browser notifications" checked={pref.enabled} onChange={setEnabled} />
    </Row>
  )
}

function TestResult({ deliveries, onDismiss }: { deliveries: Delivery[]; onDismiss: () => void }) {
  return (
    <div
      className="flex items-start justify-between gap-3 bg-subtle px-4 py-3 text-sm"
      role="status"
    >
      {deliveries.length === 0 ? (
        <p className="text-ink-2">No delivery method is on. Turn one on above, then try again.</p>
      ) : (
        <ul className="space-y-1">
          {deliveries.map((d) => (
            <li key={d.channel} className="flex items-center gap-2">
              <DeliveryIcon ok={d.ok} />
              <span className="font-medium capitalize">{d.channel}</span>
              <span className="text-ink-3">{d.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="btn-ghost size-7 p-0"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function DeliveryIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="size-4 shrink-0 text-success" aria-label="Delivered" />
  ) : (
    <X className="size-4 shrink-0 text-danger" aria-label="Failed" />
  )
}

function RecentNotifications() {
  const { data } = useNotificationLog()
  if (!data?.length) return null
  return (
    <div className="px-4 py-3">
      <h3 className="eyebrow mb-2">Recently sent</h3>
      <ul className="space-y-1.5 text-sm">
        {data.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-x-2">
            <DeliveryIcon ok={n.ok} />
            <span className="font-medium">{KIND_LABELS[n.kind] ?? n.kind}</span>
            <span className="text-ink-3">
              {n.channel === '-' ? n.detail : `${n.channel} · ${n.detail}`}
            </span>
            <time className="tabular ml-auto text-xs text-ink-4" dateTime={n.created_at}>
              {formatWhen(n.created_at)}
            </time>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// --- AI agents -------------------------------------------------------------------------------

function AgentsSection() {
  const mcp = useMcpInfo()
  const agents = useAgents()
  const disconnect = useDisconnectAgent()
  const onError = useErrorToast()
  const toast = useToast()
  const [confirming, setConfirming] = useState<Agent | null>(null)

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied')
    } catch {
      toast('Copy failed. Select the URL and copy it manually.', 'error')
    }
  }

  return (
    <Section
      icon={Bot}
      title="AI agents"
      description="Let an assistant (Claude, ChatGPT, Cursor…) read and update your plan over MCP, e.g. to put together your end-of-day review from your other tools."
    >
      <div className="space-y-2 px-4 py-3">
        <div className="text-sm font-medium">MCP server URL</div>
        {mcp.data && (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-subtle px-3 py-2 font-mono text-[13px]">
              {mcp.data.url}
            </code>
            <button
              type="button"
              className="btn-outline shrink-0"
              onClick={() => copy(mcp.data.url)}
            >
              <Copy className="size-4" /> Copy
            </button>
          </div>
        )}
        <p className="text-xs text-ink-3">
          Add it as a remote MCP server (custom connector) in your agent. It signs in with OAuth:
          your browser opens a Tobox page where you approve read or read &amp; write access.
          {mcp.data?.password_required &&
            ' Approving asks for the owner password (TOBOX_OWNER_PASSWORD).'}
        </p>
      </div>

      {agents.data?.length ? (
        <ul>
          {agents.data.map((a) => (
            <li key={a.client_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="text-xs text-ink-3">
                  {a.scopes.includes('tobox:write') ? 'Read & write' : 'Read only'} · connected{' '}
                  {formatWhen(a.connected_at)}
                  {a.last_used_at && ` · last used ${formatWhen(a.last_used_at)}`}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost text-danger"
                onClick={() => setConfirming(a)}
              >
                <Unplug className="size-4" /> Disconnect
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-ink-3">No agents connected.</p>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={`Disconnect ${confirming?.name ?? 'agent'}?`}
        message="Its access is revoked immediately. It can reconnect only if you approve it again."
        confirmLabel="Disconnect"
        onConfirm={() =>
          confirming &&
          disconnect.mutate(confirming.client_id, {
            onSuccess: () => toast(`Disconnected ${confirming.name}`),
            onError,
          })
        }
        onClose={() => setConfirming(null)}
      />
    </Section>
  )
}
