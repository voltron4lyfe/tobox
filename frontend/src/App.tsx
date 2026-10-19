import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'

import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { HotkeyProvider } from './lib/hotkeys'
import { HistoryPage } from './pages/HistoryPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { InitiativesPage } from './pages/InitiativesPage'
import { PlanPage } from './pages/PlanPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
})

export const routes = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'today', element: <TodayPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'initiatives', element: <InitiativesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HotkeyProvider>
          <RouterProvider router={router} />
        </HotkeyProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
