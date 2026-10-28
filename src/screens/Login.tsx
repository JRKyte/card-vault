import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { IconEye, IconEyeOff } from '../components/icons'
import { Screen } from '../components/ui'
import { keys } from '../lib/queries'
import { authRedirect, store } from '../lib/store'

export function Login() {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signingUp, setSigningUp] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Arrived from the link in a sign-up email, but signed out (it was opened in another browser).
  const [linkNote, setLinkNote] = useState(authRedirect)

  const short = signingUp && password.length > 0 && password.length < MIN_PASSWORD

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (short) return
    setLinkNote(null)
    setBusy(true)
    setError(null)
    try {
      if (signingUp) {
        const { confirm } = await store.signUp(email.trim(), password)
        if (confirm) {
          setSentTo(email.trim())
          return
        }
      } else {
        await store.signIn(email.trim(), password)
      }
      await qc.invalidateQueries({ queryKey: keys.user })
    } catch (err) {
      setError(signingUp ? signUpError(err) : signInError(err))
    } finally {
      setBusy(false)
    }
  }

  function switchMode() {
    setSigningUp((v) => !v)
    setError(null)
  }

  return (
    <Screen className="flex min-h-dvh items-center justify-center !pb-10">
      <div className="surface animate-fade-up w-full max-w-[440px] p-7" style={{ boxShadow: '0 0 0 1px rgba(167,139,250,.25), 0 20px 80px rgba(139,92,246,.25)' }}>
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mb-6 h-16 w-16 rounded-[16px]" style={{ boxShadow: '0 0 30px rgba(139,92,246,.45)' }} />
        <h1 className="title">Card Vault</h1>
        <p className="mt-2 mb-7 text-[15px] text-mute">Your cards, your sets.</p>

        {store.mode === 'local' ? (
          <>
            <p className="mb-5 rounded-2xl bg-[var(--chip)] p-4 text-[13px] text-mute">
              Supabase isn't set up yet, so cards are saved on this device only. Add the keys from the README to sync between devices.
            </p>
            <button type="button" className="cta w-full" onClick={() => submit({ preventDefault() {} } as React.FormEvent)} disabled={busy}>
              Start on this device
            </button>
          </>
        ) : sentTo ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-[22px] font-bold tracking-[-.03em]">Check your email</h2>
            <p className="text-[15px] text-mute">
              We sent a link to <span className="font-semibold text-ink">{sentTo}</span>. Open it to confirm your account, then come back here and sign in.
            </p>
            <button
              type="button"
              className="cta w-full"
              onClick={() => {
                setSentTo(null)
                setSigningUp(false)
                setPassword('')
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {linkNote && (
              <p role="status" className={`rounded-2xl p-4 text-[14px] font-semibold ${'error' in linkNote ? 'bg-[rgba(248,113,113,.12)] text-down' : 'bg-[rgba(52,211,153,.12)] text-up'}`}>
                {'error' in linkNote
                  ? `That link didn't work: ${linkNote.error.replace(/\.$/, '')}. Try signing in, or create the account again.`
                  : 'Your account is confirmed. Sign in to get started.'}
              </p>
            )}
            {signingUp && <h2 className="-mt-2 text-[22px] font-bold tracking-[-.03em]">Create an account</h2>}
            <label className="flex flex-col gap-2">
              <span className="eyebrow">Email</span>
              <input className="field" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-2">
              <span className="eyebrow">Password</span>
              <div className="relative">
                <input className="field pr-16" type={show ? 'text' : 'password'} autoComplete={signingUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button
                  type="button"
                  className="absolute top-1/2 right-1 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-mute"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              {signingUp && <span className={`text-[13px] ${short ? 'font-semibold text-down' : 'text-mute'}`}>At least {MIN_PASSWORD} characters</span>}
            </label>
            {error && (
              <p role="alert" className="text-[15px] font-semibold text-down">
                {error}
              </p>
            )}
            <button type="submit" className="cta mt-2 w-full" disabled={busy || !email || !password || short}>
              {signingUp ? (busy ? 'Creating your account…' : 'Create account') : busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center text-[14px] text-mute">
              {signingUp ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" className="min-h-11 font-semibold text-accent-2 underline underline-offset-4" onClick={switchMode}>
                {signingUp ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </form>
        )}
      </div>
    </Screen>
  )
}

const MIN_PASSWORD = 8

function signInError(err: unknown) {
  const msg = err instanceof Error ? err.message : ''
  if (/not confirmed/i.test(msg)) return 'Confirm your email first: open the link we sent you, then sign in.'
  if (/invalid/i.test(msg)) return "That email or password didn't work."
  return 'Could not sign in. Check your connection and try again.'
}

function signUpError(err: unknown) {
  const msg = err instanceof Error ? err.message : ''
  if (/already registered|already exists/i.test(msg)) return 'There is already an account with that email. Try signing in instead.'
  if (/signups? not allowed|disabled/i.test(msg)) return "New accounts can't be made right now."
  if (/password/i.test(msg)) return msg
  if (/email/i.test(msg)) return "That email address doesn't look right."
  if (/rate limit/i.test(msg)) return 'Too many tries. Wait a few minutes and try again.'
  return 'Could not create the account. Check your connection and try again.'
}
