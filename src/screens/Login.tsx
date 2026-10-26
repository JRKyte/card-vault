import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { IconEye, IconEyeOff } from '../components/icons'
import { Screen } from '../components/ui'
import { keys } from '../lib/queries'
import { store } from '../lib/store'

export function Login() {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await store.signIn(email.trim(), password)
      await qc.invalidateQueries({ queryKey: keys.user })
    } catch (err) {
      setError(err instanceof Error && /invalid/i.test(err.message) ? "That email or password didn't work." : 'Could not sign in. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="flex min-h-dvh items-center justify-center !pb-10">
      <div className="glass animate-fade-up w-full max-w-[460px] p-8">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mb-6 h-16 w-16 rounded-[18px]" />
        <h1 className="text-[40px] leading-tight font-extrabold">Card Vault</h1>
        <p className="mt-1 mb-7 text-[17px] text-ink-2">Your cards, your sets.</p>

        {store.mode === 'local' ? (
          <>
            <p className="mb-5 rounded-2xl bg-ink/5 p-4 text-[15px] text-ink-2">
              Supabase isn't set up yet, so cards are saved on this device only. Add the keys from the README to sync between devices.
            </p>
            <button type="button" className="btn-dark w-full" onClick={() => submit({ preventDefault() {} } as React.FormEvent)} disabled={busy}>
              Start on this device
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold text-ink-2">Email</span>
              <input className="field" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold text-ink-2">Password</span>
              <div className="relative">
                <input className="field pr-16" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button
                  type="button"
                  className="absolute top-1/2 right-2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-ink-2"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </label>
            {error && (
              <p role="alert" className="text-[15px] font-semibold text-down">
                {error}
              </p>
            )}
            <button type="submit" className="btn-dark mt-2 w-full" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </Screen>
  )
}
