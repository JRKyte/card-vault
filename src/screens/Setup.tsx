import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { Screen, Segmented } from '../components/ui'
import { fromStored, toStored, type CurrencyMode } from '../lib/money'
import { DEFAULT_PROFILE, keys } from '../lib/queries'
import { store, type Profile } from '../lib/store'
import { AvatarPicker } from './Settings'

/** First time in: a name, a picture and a currency. Shown until the profile has been saved once. */
export function Setup() {
  const qc = useQueryClient()
  const [profile, setProfile] = useState<Profile>({ ...DEFAULT_PROFILE, display_name: '' })
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const name = profile.display_name.trim()

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return
    setBusy(true)
    setError(false)
    const done = { ...profile, display_name: name }
    try {
      await store.saveProfile(done)
      qc.setQueryData(keys.profile, done)
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <Screen>
      <form onSubmit={finish} className="mx-auto flex w-full max-w-[560px] flex-col gap-3.5 pt-4">
        <div className="flex items-center gap-4">
          <Avatar profile={{ ...profile, display_name: name || '?' }} size={68} ring />
          <div>
            <p className="eyebrow">Welcome to Card Vault</p>
            <h1 className="title">Let's set you up</h1>
          </div>
        </div>

        <label className="surface flex flex-col gap-2.5 p-5">
          <span className="text-[15px] font-semibold">What's your name?</span>
          <input
            className="field"
            value={profile.display_name}
            onChange={(e) => set({ display_name: e.target.value })}
            placeholder="Your name"
            autoComplete="given-name"
            autoCapitalize="words"
            maxLength={30}
            required
          />
          <span className="text-[13px] text-mute">Friends see this when you swap cards.</span>
        </label>

        <AvatarPicker profile={{ ...profile, display_name: name || '?' }} set={set} fromCollection={false} />

        <section className="surface flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[15px] font-semibold">Show prices in</span>
            <span className="text-[12.5px] text-mute">You can change this later in Settings.</span>
          </div>
          <Segmented<CurrencyMode>
            label="Show prices in"
            value={fromStored(profile.currency_display)}
            onChange={(v) => set({ currency_display: toStored(v) })}
            options={[
              { value: 'gbp', label: 'GBP' },
              { value: 'usd', label: 'USD' },
              { value: 'eur', label: 'EUR' },
            ]}
          />
        </section>

        {error && (
          <p role="alert" className="text-[14px] font-semibold text-down">
            Couldn't save that. Check your connection and try again.
          </p>
        )}
        <button type="submit" className="cta mt-1 w-full" disabled={!name || busy}>
          {busy ? 'Saving…' : "Let's go"}
        </button>
      </form>
    </Screen>
  )
}
