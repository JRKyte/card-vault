import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Avatar, CardCircle, InitialsCircle } from '../components/Avatar'
import { IconCheck, IconDownload, IconEdit, IconEye, IconEyeOff, IconRefresh, IconUpload } from '../components/icons'
import { BackPill, Modal, Screen, Segmented, TopRow } from '../components/ui'
import { fromStored, toStored, type CurrencyMode } from '../lib/money'
import { AVATAR_OPTIONS } from '../data/avatar-options'
import { loadCards } from '../lib/cards'
import { DEFAULT_PROFILE, keys, useCards, useCollection, useCustomMembership, useCustomSets, useProfile, useSaveProfile, useTracked, useUser } from '../lib/queries'
import { store, type Profile } from '../lib/store'
import { searchCards, type Card } from '../lib/tcg'


export function Settings() {
  const profile = useProfile().data ?? DEFAULT_PROFILE
  const save = useSaveProfile()
  const set = (patch: Partial<Profile>) => save.mutate({ ...profile, ...patch })

  return (
    <Screen>
      <TopRow left={<BackPill label="Back" to="/" />} />
      <h1 className="title">Settings</h1>
      <div className="flex flex-wrap items-start gap-3.5">
        <div className="flex max-w-[560px] flex-[1_1_380px] flex-col gap-3.5">
          {/* Keyed on the name so the field refreshes once the profile loads. */}
          <Account key={profile.display_name} profile={profile} set={set} />
          <AvatarPicker profile={profile} set={set} />
        </div>
        <Preferences profile={profile} set={set} />
      </div>
      <footer className="mono mt-4 text-center text-[11px] text-mute">
        Card Vault {__APP_VERSION__} · Card data from pokemontcg.io and TCGdex
      </footer>
    </Screen>
  )
}

function Account({ profile, set }: { profile: Profile; set: (p: Partial<Profile>) => void }) {
  const user = useUser()
  const qc = useQueryClient()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile.display_name)
  const commit = () => {
    const n = name.trim()
    if (n && n !== profile.display_name) set({ display_name: n })
    else setName(profile.display_name)
  }
  return (
    <section className="surface relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-10 -left-[30px] h-[180px] w-[180px] rounded-full" style={{ background: 'radial-gradient(circle, var(--glow), transparent 65%)' }} />
      <div className="relative flex items-center gap-4">
        <Avatar profile={profile} size={68} ring />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            {/* The hidden copy of the name sizes the field, so the pencil sits right after it. */}
            <span className="-ml-2 inline-grid min-w-0 text-[20px] font-bold tracking-[-.02em]">
              <span aria-hidden className="invisible col-start-1 row-start-1 truncate px-2 py-1 whitespace-pre">
                {name || ' '}
              </span>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label="Your name"
                maxLength={30}
                size={1}
                className="col-start-1 row-start-1 w-full min-w-0 rounded-xl bg-transparent px-2 py-1 text-ellipsis outline-none focus:bg-[var(--chip)] focus:shadow-[0_0_0_1px_var(--color-accent)]"
              />
            </span>
            <button
              type="button"
              aria-label="Change name"
              className="grid h-9 w-9 flex-none place-items-center rounded-full text-mute transition-colors hover:bg-[var(--chip)] hover:text-ink"
              onClick={() => {
                nameRef.current?.focus()
                nameRef.current?.select()
              }}
            >
              <IconEdit size={16} />
            </button>
          </div>
          {store.mode === 'supabase' && <div className="truncate text-[13px] text-mute">{user.data?.email}</div>}
          {store.mode === 'local' && <div className="text-[13px] text-mute">Saved on this device only</div>}
        </div>
        <button
          type="button"
          className="chip-btn flex-none"
          onClick={async () => {
            if (!confirm('Sign out of Card Vault on this device?')) return
            await store.signOut()
            qc.clear()
            qc.invalidateQueries({ queryKey: keys.user })
          }}
        >
          Sign out
        </button>
      </div>
    </section>
  )
}

const MIN_PASSWORD = 8

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const problem =
    next && next.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : confirmNext && next !== confirmNext ? "The new passwords don't match." : null
  const ready = current && next.length >= MIN_PASSWORD && next === confirmNext

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await store.changePassword(current, next)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, autoComplete: string) => (
    <label className="flex flex-col gap-2">
      <span className="eyebrow">{label}</span>
      <input className="field" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )

  return (
    <Modal onClose={onClose} title="Change password">
      {done ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[rgba(52,211,153,.14)] text-up" style={{ boxShadow: '0 0 24px rgba(52,211,153,.3)' }}>
            <IconCheck />
          </div>
          <h2 className="text-[24px] font-extrabold">Password changed</h2>
          <p className="text-[14px] text-mute">Use the new password next time you sign in on another device.</p>
          <button type="button" className="btn mt-2" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[24px] font-extrabold">Change password</h2>
            <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-mute hover:bg-[var(--chip)]" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'}>
              {show ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          {field('Current password', current, setCurrent, 'current-password')}
          {field('New password', next, setNext, 'new-password')}
          {field('New password again', confirmNext, setConfirmNext, 'new-password')}
          {(error ?? problem) && (
            <p role="alert" className="text-[13px] font-semibold text-down">
              {error ?? problem}
            </p>
          )}
          <div className="mt-1 flex gap-3">
            <button type="button" className="chip-btn !min-h-12" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn flex-1" disabled={!ready || busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function AvatarPicker({ profile, set, fromCollection = true }: { profile: Profile; set: (p: Partial<Profile>) => void; fromCollection?: boolean }) {
  const [mine, setMine] = useState(false)
  // Resolve any option without a pinned card id: newest card with that exact name.
  const resolved = useQuery({
    queryKey: ['avatarOptions'],
    queryFn: async () => {
      const out: Record<string, string> = {}
      for (const o of AVATAR_OPTIONS) {
        if (o.cardId) out[o.name] = o.cardId
        else {
          const page = await searchCards(`!name:"${o.name}" supertype:Pokémon`, { pageSize: 5 })
          const hit = page.data.find((c) => c.images?.small)
          if (hit) out[o.name] = hit.id
        }
      }
      return out
    },
    staleTime: Infinity,
  })
  const ids = useMemo(() => Object.values(resolved.data ?? {}), [resolved.data])
  const cards = useCards(ids)

  return (
    <section className="surface flex flex-col gap-3.5 p-5">
      <h2 className="text-[15px] font-semibold">Pick your Pokémon</h2>
      <div className="flex flex-wrap gap-3.5">
        <Option active={profile.avatar_mode === 'initials'} label="Initials" onClick={() => set({ avatar_mode: 'initials', avatar_card_id: null })}>
          <InitialsCircle name={profile.display_name} size={64} />
        </Option>
        {AVATAR_OPTIONS.map((o) => {
          const id = resolved.data?.[o.name]
          const card = id ? cards.data?.get(id) : undefined
          return (
            <Option key={o.name} active={profile.avatar_mode === 'card' && profile.avatar_card_id === id} label={o.name} onClick={() => id && set({ avatar_mode: 'card', avatar_card_id: id })}>
              {card ? <FallbackCircle card={card} name={o.name} /> : <div className="skeleton h-16 w-16 !rounded-full" />}
            </Option>
          )
        })}
      </div>
      {fromCollection && (
        <button type="button" className="chip-btn self-start" onClick={() => setMine(true)}>
          Use one of my cards
        </button>
      )}
      {mine && (
        <MyCardPicker
          onClose={() => setMine(false)}
          onPick={(c) => {
            set({ avatar_mode: 'card', avatar_card_id: c.id })
            setMine(false)
          }}
        />
      )}
    </section>
  )
}

function FallbackCircle({ card, name }: { card: Card; name: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? <InitialsCircle name={name} size={64} /> : <CardCircle src={card.images.small} size={64} onError={() => setFailed(true)} />
}

function Option({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-full transition-all duration-200"
      style={{ boxShadow: active ? '0 0 0 2px var(--color-accent), 0 0 22px var(--glow)' : '0 0 0 1px var(--line)', opacity: active ? 1 : 0.6 }}
    >
      {children}
    </button>
  )
}

function MyCardPicker({ onClose, onPick }: { onClose: () => void; onPick: (c: Card) => void }) {
  const { items, cards } = useCollection()
  const list = useMemo(() => {
    const seen = new Set<string>()
    return items.map((i) => cards.get(i.card_id)).filter((c): c is Card => !!c && !seen.has(c.id) && !!seen.add(c.id))
  }, [items, cards])
  return (
    <Modal onClose={onClose} title="Use one of my cards">
      <div className="p-5 pb-2">
        <h2 className="text-[22px] font-extrabold tracking-tight">Use one of my cards</h2>
      </div>
      <div className="overflow-y-auto p-5 pt-2">
        {list.length === 0 ? (
          <p className="py-8 text-center text-mute">Add some cards first, then pick your favourite here.</p>
        ) : (
          <div className="grid grid-cols-4 gap-4 min-[600px]:grid-cols-5">
            {list.map((c) => (
              <button key={c.id} type="button" className="flex flex-col items-center gap-1.5" onClick={() => onPick(c)}>
                <CardCircle src={c.images.small} size={72} />
                <span className="w-full truncate text-center text-[12px] font-medium text-mute">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Preferences({ profile, set }: { profile: Profile; set: (p: Partial<Profile>) => void }) {
  const qc = useQueryClient()
  const { items, cards } = useCollection()
  const tracked = useTracked()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  const fileRef = useRef<HTMLInputElement>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem('pokemontcg-api-key') ?? ''
    } catch {
      return ''
    }
  })

  const priceDate = useMemo(() => {
    let newest = ''
    for (const c of cards.values()) {
      for (const d of [c.tcgplayer?.updatedAt, c.cardmarket?.updatedAt]) if (d && d > newest) newest = d
    }
    return newest ? new Date(newest.replace(/\//g, '-') + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  }, [cards])

  async function refresh() {
    setRefreshing(true)
    setNote(null)
    try {
      await loadCards(
        items.map((i) => i.card_id),
        { force: true },
      )
      await qc.invalidateQueries({ queryKey: ['cards'] })
      setNote('Prices updated.')
    } catch {
      setNote("Couldn't reach the card database. Try again later.")
    } finally {
      setRefreshing(false)
    }
  }

  function exportJson() {
    const data = {
      app: 'card-vault',
      version: 1,
      exported_at: new Date().toISOString(),
      items: items.map(({ card_id, variant, condition, quantity, created_at }) => ({ card_id, variant, condition, quantity, created_at })),
      tracked_sets: (tracked.data ?? []).map((t) => t.set_id),
      custom_sets: (customSets.data ?? []).map((s) => ({
        name: s.name,
        color: s.color,
        kind: s.kind,
        query: s.query,
        exclusions: s.exclusions,
        icon_card_id: s.icon_card_id,
        cards: membership.members.get(s.id) ?? [],
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `card-vault-${new Date().toLocaleDateString('en-CA')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function importJson(file: File) {
    setNote(null)
    try {
      const data = JSON.parse(await file.text())
      if (data?.app !== 'card-vault' || !Array.isArray(data.items)) throw new Error('Not a Card Vault export')
      if (!confirm(`Import ${data.items.length} cards${data.custom_sets?.length ? ` and ${data.custom_sets.length} custom sets` : ''}? Cards you already have will have their counts added together.`)) return
      for (const i of data.items) await store.addItem(i.card_id, i.variant, i.condition ?? 'near_mint', Math.max(1, Number(i.quantity) || 1))
      for (const s of data.tracked_sets ?? []) await store.track(s)
      const existing = new Set((customSets.data ?? []).map((s) => s.name))
      for (const s of data.custom_sets ?? []) {
        if (existing.has(s.name)) continue
        const created = await store.createCustomSet({ name: s.name, color: s.color, kind: s.kind, query: s.query, exclusions: s.exclusions, icon_card_id: s.icon_card_id })
        await store.addCustomSetCards(created.id, s.cards ?? [])
      }
      await qc.invalidateQueries()
      setNote('Import finished.')
    } catch (e) {
      setNote(e instanceof Error ? `Import failed: ${e.message}` : 'Import failed.')
    }
  }

  return (
    <section className="surface flex flex-[1.4_1_360px] flex-col divide-y divide-[var(--line)] px-5 py-1">
      {store.mode === 'supabase' && (
        <Row label="Password">
          <button type="button" className="chip-btn" onClick={() => setPasswordOpen(true)}>
            Change
          </button>
          {passwordOpen && <ChangePassword onClose={() => setPasswordOpen(false)} />}
        </Row>
      )}
      <Row label="Show prices in" sub={fromStored(profile.currency_display) === 'gbp' ? 'Pounds are approximate (EUR × 0.85)' : undefined}>
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
      </Row>
      <Row label="Export collection">
        <button type="button" className="chip-btn" onClick={exportJson}>
          <IconDownload size={15} /> Download JSON
        </button>
      </Row>
      <Row label="Import collection">
        <button type="button" className="chip-btn" onClick={() => fileRef.current?.click()}>
          <IconUpload size={15} /> Choose file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importJson(f)
            e.target.value = ''
          }}
        />
      </Row>
      <Row label="Prices last updated" sub={priceDate ?? 'No prices yet'}>
        <button type="button" className="chip-btn" onClick={refresh} disabled={refreshing || !items.length}>
          <IconRefresh size={15} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </Row>
      <Row label="Card data API key" sub="Optional. Saved on this device." stacked>
        <input
          type="password"
          value={key}
          placeholder="Not set"
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
          onBlur={() => {
            try {
              if (key.trim()) localStorage.setItem('pokemontcg-api-key', key.trim())
              else localStorage.removeItem('pokemontcg-api-key')
            } catch {
              // Storage blocked.
            }
          }}
          className="field mono !h-[46px] !text-[13px]"
          aria-label="pokemontcg.io API key"
        />
      </Row>
      {note && <p className="py-3 text-[13px] font-semibold text-accent-2">{note}</p>}
    </section>
  )
}

function Row({ label, sub, stacked, children }: { label: string; sub?: string; stacked?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 py-4 ${stacked ? 'flex-col' : 'flex-wrap items-center justify-between'}`}>
      <div className="flex flex-col gap-[3px]">
        <span className="text-[14.5px] font-semibold">{label}</span>
        {sub && <span className="text-[12.5px] text-mute">{sub}</span>}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  )
}
