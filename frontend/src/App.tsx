import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'

import { ApiError } from './api/client'
import { keys } from './api/hooks'
import { AppShell } from './components/AppShell'
import { AuthGate } from './components/SignIn'
import { ToastProvider } from './components/Toast'
import { HotkeyProvider } from './lib/hotkeys'
import { HistoryPage } from './pages/HistoryPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { InitiativesPage } from './pages/InitiativesPage'
import { PlanPage } from './pages/PlanPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

/** A 401 means the session ended (expired, or signed out elsewhere): re-check it to show sign-in. */
const onApiError = (error: Error) => {
  if (error instanceof ApiError && error.status === 401) {
    void queryClient.invalidateQueries({ queryKey: keys.session })
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const routes = [
  {
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
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
