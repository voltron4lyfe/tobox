import { LogIn } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

import { useSession, useSignIn } from '../api/hooks'
import { Brand } from './AppShell'
import { ErrorBlock, LoadingBlock } from './PageHeader'

/** Renders the app only for the owner: a sign-in screen when TOBOX_OWNER_PASSWORD is set. */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()
  if (session.isPending) {
    return (
      <div className="mx-auto max-w-sm px-4 pt-24">
        <LoadingBlock />
      </div>
    )
  }
  if (session.error) {
    return (
      <div className="mx-auto max-w-sm px-4 pt-24">
        <ErrorBlock error={session.error} />
      </div>
    )
  }
  if (session.data.password_required && !session.data.signed_in) return <SignIn />
  return children
}

function SignIn() {
  const signIn = useSignIn()
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password) signIn.mutate(password, { onError: () => setPassword('') })
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <Brand />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-ink-3">Enter the owner password set on the server.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="owner-password" className="eyebrow block">
            Owner password
          </label>
          <input
            id="owner-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="field w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={signIn.isError}
            aria-describedby={signIn.isError ? 'sign-in-error' : undefined}
          />
          {signIn.error && (
            <p id="sign-in-error" role="alert" className="text-sm text-danger-ink">
              {signIn.error.message}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={signIn.isPending}>
          <LogIn className="size-4" /> Sign in
        </button>
      </form>
    </main>
  )
}
