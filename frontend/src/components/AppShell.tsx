import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  ListChecks,
  Moon,
  Settings,
  Sunrise,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { useSession, useSignOut } from '../api/hooks'
import { addDays, relativeDayLabel, today } from '../lib/dates'
import { requestFocusLog } from '../lib/events'
import { useHotkeys } from '../lib/hotkeys'
import { dayHref, useSelectedDate } from '../lib/useSelectedDate'
import { CommandPalette } from './CommandPalette'
import { Kbd } from './Kbd'
import { PreferencesSync, useCycleTheme } from './PreferencesSync'
import { ShortcutHelp } from './ShortcutHelp'

interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
  keys: string
  dayScoped: boolean
  /** Shown in the mobile tab bar (Settings lives in the mobile header instead). */
  tab?: boolean
}

const NAV: NavItem[] = [
  { to: '/plan', label: 'Plan', short: 'Plan', icon: Sunrise, keys: 'g p', dayScoped: true },
  { to: '/today', label: 'Track', short: 'Track', icon: ListChecks, keys: 'g t', dayScoped: true },
  { to: '/review', label: 'Review', short: 'Review', icon: Moon, keys: 'g r', dayScoped: true },
  {
    to: '/history',
    label: 'History',
    short: 'History',
    icon: BarChart3,
    keys: 'g h',
    dayScoped: false,
  },
  {
    to: '/initiatives',
    label: 'Initiatives',
    short: 'Initiatives',
    icon: Grid2x2,
    keys: 'g i',
    dayScoped: false,
  },
  {
    to: '/settings',
    label: 'Settings',
    short: 'Settings',
    icon: Settings,
    keys: 'g s',
    dayScoped: false,
    tab: false,
  },
]
const SETTINGS = NAV.length - 1
export const SIGN_OUT_KEYS = 'shift+q'

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [date, setDate] = useSelectedDate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const isDayPage = NAV.some((n) => n.dayScoped && location.pathname.startsWith(n.to))
  const hrefFor = (n: NavItem) => (n.dayScoped ? dayHref(n.to, date) : n.to)
  const cycleTheme = useCycleTheme()
  const session = useSession()
  const signOut = useSignOut()

  useHotkeys([
    ...NAV.map((n) => ({
      keys: n.keys,
      description: `Go to ${n.label}`,
      group: 'Navigation',
      handler: () => navigate(hrefFor(n)),
    })),
    {
      keys: '[',
      description: 'Previous day',
      group: 'Navigation',
      enabled: isDayPage,
      handler: () => setDate(addDays(date, -1)),
    },
    {
      keys: ']',
      description: 'Next day',
      group: 'Navigation',
      enabled: isDayPage,
      handler: () => setDate(addDays(date, 1)),
    },
    {
      keys: '.',
      description: 'Jump to today',
      group: 'Navigation',
      enabled: isDayPage,
      handler: () => setDate(today()),
    },
    {
      keys: 'l',
      description: 'Log work',
      group: 'General',
      handler: () => {
        if (!location.pathname.startsWith('/today')) navigate(dayHref('/today', date))
        requestFocusLog()
      },
    },
    {
      keys: 'shift+t',
      description: 'Switch theme (system / light / dark)',
      group: 'General',
      handler: cycleTheme,
    },
    {
      keys: SIGN_OUT_KEYS,
      description: 'Sign out',
      group: 'General',
      enabled: !!session.data?.password_required,
      handler: () => signOut.mutate(),
    },
    {
      keys: '?',
      description: 'Show shortcuts',
      group: 'General',
      handler: () => setHelpOpen(true),
    },
    {
      keys: 'mod+k',
      description: 'Command palette',
      group: 'General',
      allowInInput: true,
      handler: () => setPaletteOpen((o) => !o),
    },
  ])

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line/80 px-3 py-5 md:flex">
        <Brand />
        {isDayPage && <DateNav date={date} setDate={setDate} className="mt-6 px-1" />}
        <nav className="mt-6 space-y-0.5" aria-label="Main">
          {NAV.map((n, i) => (
            <div key={n.to}>
              {(i === 3 || i === SETTINGS) && <div className="mx-2 my-3 border-t border-line/80" />}
              <NavLink
                to={hrefFor(n)}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-raised text-ink shadow-sm ring-1 ring-line'
                      : 'text-ink-2 hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                <Kbd keys={n.keys} className="opacity-0 transition group-hover:opacity-100" />
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-1 px-1 text-xs text-ink-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="btn-ghost w-full justify-between px-2 text-xs"
          >
            Commands <Kbd keys="mod+k" />
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="btn-ghost w-full justify-between px-2 text-xs"
          >
            Shortcuts <Kbd keys="?" />
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line/80 bg-canvas/85 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur md:hidden">
        <Brand compact />
        <div className="flex items-center gap-1">
          {isDayPage && <DateNav date={date} setDate={setDate} />}
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `btn-ghost size-9 p-0 ${isActive ? 'bg-subtle text-accent' : ''}`
            }
          >
            <Settings className="size-[18px]" />
          </NavLink>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pt-4 pb-28 sm:px-6 md:px-10 md:pt-8 md:pb-12">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line/80 bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.filter((n) => n.tab !== false).map((n) => (
          <NavLink
            key={n.to}
            to={hrefFor(n)}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${
                isActive ? 'text-accent' : 'text-ink-3'
              }`
            }
          >
            <n.icon className="size-5" />
            {n.short}
          </NavLink>
        ))}
      </nav>

      <PreferencesSync />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2 px-1.5">
      <span className="grid size-6 grid-cols-2 gap-[2px] rounded-md p-[3px] ring-1 ring-line">
        <span className="rounded-[2px] bg-rose-500" />
        <span className="rounded-[2px] bg-teal-600" />
        <span className="rounded-[2px] bg-amber-500" />
        <span className="rounded-[2px] bg-blue-500" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Tobox</span>
      {!compact && <span className="sr-only">home</span>}
    </NavLink>
  )
}

function DateNav({
  date,
  setDate,
  className = '',
}: {
  date: string
  setDate: (d: string) => void
  className?: string
}) {
  const isToday = date === today()
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        aria-label="Previous day"
        title="Previous day ([)"
        onClick={() => setDate(addDays(date, -1))}
        className="btn-ghost size-8 p-0"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setDate(today())}
        title="Jump to today (.)"
        className={`min-w-[7.5rem] flex-1 rounded-lg px-2 py-1 text-center text-sm font-semibold ${
          isToday ? '' : 'text-accent hover:bg-accent-soft'
        }`}
      >
        {relativeDayLabel(date)}
      </button>
      <button
        type="button"
        aria-label="Next day"
        title="Next day (])"
        onClick={() => setDate(addDays(date, 1))}
        className="btn-ghost size-8 p-0"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
