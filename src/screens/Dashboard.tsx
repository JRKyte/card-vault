import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { IconPlus, IconSearch, IconSparkle, IconStar, IconWand } from '../components/icons'
import { SetLogo, SetRow } from '../components/SetBits'
import { ErrorMessage, Message, Modal, Screen, Segmented, Skeleton } from '../components/ui'
import { setColor } from '../data/set-colors'
import { useCurrencyMode, mainMoney } from '../lib/money'
import { fmtEur, fmtUsd } from '../lib/pricing'
import { DEFAULT_PROFILE, useCollection, useProfile, useSets, useSnapshots } from '../lib/queries'
import { itemsValue } from '../lib/sets'
import { useSetSummaries, type SetSummary } from '../lib/summaries'
import { daysUntil, nextUpcoming } from '../lib/upcoming'

export function Dashboard() {
  const [view, setView] = useState<'mine' | 'all'>(() => (sessionStorage.getItem('sets-view') as 'mine' | 'all') ?? 'mine')
  const [chooser, setChooser] = useState(false)
  const summaries = useSetSummaries()

  const changeView = (v: 'mine' | 'all') => {
    setView(v)
    try {
      sessionStorage.setItem('sets-view', v)
    } catch {
      // Not important.
    }
  }

  const rows: SetSummary[] = view === 'mine' ? summaries.mine : [...summaries.custom, ...summaries.official]

  return (
    <Screen>
      <Header />
      <Stats mine={summaries.mine} />
      <ComingNext />

      <div className="mt-9 mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[28px] font-extrabold">Sets</h2>
        <Segmented
          label="Which sets"
          value={view}
          onChange={changeView}
          options={[
            { value: 'mine', label: 'My sets' },
            { value: 'all', label: 'All sets' },
          ]}
        />
      </div>

      {summaries.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : summaries.setsError && !summaries.official.length && (view === 'all' || summaries.trackedPending > 0) ? (
        <ErrorMessage error={summaries.setsError} retry={() => summaries.refetchSets()} />
      ) : view === 'mine' && rows.length === 0 && !summaries.trackedPending ? (
        <Message
          icon={<IconStar />}
          title="Pick a set to collect"
          body="Choose a set and we'll show you which cards you've got and which you still need."
          action={
            <button type="button" className="btn-dark mt-2" onClick={() => setChooser(true)}>
              Choose a set
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((s) => (
            <SetRow key={s.key} set={s} />
          ))}
          {summaries.setsLoading &&
            Array.from({ length: view === 'mine' ? summaries.trackedPending : 4 }, (_, i) => <Skeleton key={`pending-${i}`} className="h-[92px]" />)}
          <button
            type="button"
            onClick={() => setChooser(true)}
            className="flex min-h-[92px] items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-ink/20 text-[18px] font-bold text-ink-2 transition-colors active:bg-white/40"
          >
            <IconPlus /> New set
          </button>
        </div>
      )}

      {chooser && <NewSetChooser onClose={() => setChooser(false)} />}
    </Screen>
  )
}

function Header() {
  const profile = useProfile().data ?? DEFAULT_PROFILE
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <header className="mb-7 flex items-start justify-between gap-4">
      <div>
        <div className="text-[16px] font-semibold text-ink-2">{date}</div>
        <h1 className="text-[44px] leading-[1.05] font-extrabold tracking-tight wide:text-[52px]">My cards</h1>
      </div>
      <Link to="/settings" className="glass flex items-center gap-3 rounded-full p-1.5 pr-5" aria-label="Settings">
        <Avatar profile={profile} size={48} />
        <div className="hidden min-[420px]:block">
          <div className="max-w-[160px] truncate text-[16px] font-bold">{profile.display_name}</div>
          <div className="text-[13px] font-semibold text-ink-2">Settings</div>
        </div>
      </Link>
    </header>
  )
}

function Stats({ mine }: { mine: SetSummary[] }) {
  const { items, cards, isLoading } = useCollection()
  const snapshots = useSnapshots()
  const mode = useCurrencyMode()

  const stats = useMemo(() => {
    const count = items.reduce((n, i) => n + i.quantity, 0)
    const weekAgo = Date.now() - 7 * 864e5
    const thisWeek = items.filter((i) => new Date(i.created_at).getTime() > weekAgo).reduce((n, i) => n + i.quantity, 0)
    const value = itemsValue(items, cards)
    // Change against the newest snapshot that is at least a week old (or the oldest we have).
    const snaps = snapshots.data ?? []
    const cutoff = new Date(weekAgo).toLocaleDateString('en-CA')
    const base = [...snaps].reverse().find((s) => s.taken_on <= cutoff) ?? snaps[0]
    const delta = base ? { usd: value.usd - Number(base.total_usd), eur: value.eur - Number(base.total_eur) } : null
    const mastered = mine.filter((s) => s.progress.mastered).length
    const closest = mine.filter((s) => !s.progress.mastered).sort((a, b) => b.progress.pct - a.progress.pct)[0]
    return { count, thisWeek, value, delta, mastered, closest }
  }, [items, cards, snapshots.data, mine])

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[122px]" />
        ))}
      </div>
    )
  }

  if (stats.count === 0) {
    return (
      <Link to="/add" className="glass flex items-center gap-5 p-6">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-ink text-white">
          <IconPlus size={30} />
        </div>
        <div>
          <div className="text-[24px] font-extrabold">Add your first card</div>
          <div className="text-[16px] text-ink-2">Search by name or the number at the bottom of the card.</div>
        </div>
      </Link>
    )
  }

  const deltaMain = stats.delta ? (mode === 'eur' ? stats.delta.eur : stats.delta.usd) : null
  const up = (deltaMain ?? 0) >= 0
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile label="Cards" value={stats.count.toLocaleString()} sub={stats.thisWeek ? `+${stats.thisWeek} this week` : 'None new this week'} />
      <Tile
        label="Value"
        value={stats.value.priced ? mainMoney(mode, stats.value.usd, stats.value.eur) : '—'}
        sub={
          stats.delta && Math.abs(deltaMain ?? 0) >= 0.01 ? (
            <span className={up ? 'text-up' : 'text-down'}>
              {up ? '▲' : '▼'} {mode === 'eur' ? fmtEur(Math.abs(stats.delta.eur)) : fmtUsd(Math.abs(stats.delta.usd))}
              {mode === 'both' && <span className="text-ink-2"> · {fmtEur(stats.value.eur)}</span>}
            </span>
          ) : mode === 'both' ? (
            fmtEur(stats.value.priced ? stats.value.eur : null)
          ) : (
            'This week'
          )
        }
      />
      <Tile
        label="Mastered"
        value={`${stats.mastered} / ${mine.length}`}
        sub={stats.closest ? `Closest: ${stats.closest.name} at ${stats.closest.progress.pct}%` : mine.length ? 'All done!' : 'No sets yet'}
      />
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="glass min-w-0 p-4 wide:p-5">
      <div className="text-[14px] font-semibold text-ink-2">{label}</div>
      <div className="mt-1 truncate text-[26px] leading-tight font-extrabold wide:text-[32px]">{value}</div>
      <div className="mt-1 line-clamp-2 text-[13px] font-semibold text-ink-2 wide:text-[14px]">{sub}</div>
    </div>
  )
}

function ComingNext() {
  const sets = useSets()
  const next = nextUpcoming(sets.data)
  if (!next) return null
  const days = daysUntil(next.releaseDate)
  return (
    <div className="glass-dark mt-4 flex items-center justify-between gap-4 p-5 wide:p-6">
      <div className="min-w-0">
        <div className="eyebrow text-white/60">Coming next</div>
        <div className="mt-1 truncate text-[24px] font-extrabold">{next.name}</div>
        <div className="mt-0.5 text-[15px] text-white/70">
          Releases {next.releaseDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
          {next.cardCount ? ` · ${next.cardCount} cards` : ''}
        </div>
      </div>
      <div className="shrink-0 rounded-[18px] bg-white/10 px-5 py-3 text-center">
        <div className="text-[34px] leading-none font-extrabold">{days}</div>
        <div className="mt-1 text-[13px] font-semibold text-white/70">{days === 1 ? 'day to go' : days === 0 ? 'out today' : 'days to go'}</div>
      </div>
    </div>
  )
}

function NewSetChooser({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'choose' | 'official'>('choose')
  const [term, setTerm] = useState('')
  const navigate = useNavigate()
  const sets = useSets()
  const summaries = useSetSummaries()

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase()
    return (sets.data ?? []).filter((s) => !t || s.name.toLowerCase().includes(t) || s.series.toLowerCase().includes(t) || s.id.toLowerCase().includes(t))
  }, [sets.data, term])

  return (
    <Modal onClose={onClose} title="New set">
      {step === 'choose' ? (
        <div className="flex flex-col gap-3 p-5">
          <h2 className="mb-2 text-[26px] font-extrabold">New set</h2>
          <button type="button" className="glass-flat flex items-center gap-4 p-4 text-left" onClick={() => setStep('official')}>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-ink text-white">
              <IconSparkle />
            </div>
            <div>
              <div className="text-[19px] font-bold">Track an official set</div>
              <div className="text-[15px] text-ink-2">Pick from every set that's been released.</div>
            </div>
          </button>
          <button
            type="button"
            className="glass-flat flex items-center gap-4 p-4 text-left"
            onClick={() => {
              onClose()
              navigate('/custom/new')
            }}
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-ink text-white">
              <IconWand />
            </div>
            <div>
              <div className="text-[19px] font-bold">Make a custom set</div>
              <div className="text-[15px] text-ink-2">Every Pikachu, your favourites, anything you like.</div>
            </div>
          </button>
        </div>
      ) : (
        <>
          <div className="p-5 pb-3">
            <h2 className="mb-3 text-[26px] font-extrabold">Track an official set</h2>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-2" />
              <input className="field !min-h-14 pl-12 !text-[18px]" placeholder="Search sets" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {sets.isLoading && <Skeleton className="h-40" />}
            {sets.error && !sets.data && <ErrorMessage error={sets.error} retry={() => sets.refetch()} />}
            <div className="flex flex-col gap-1">
              {filtered.map((s) => {
                const tracked = summaries.trackedIds.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onClose()
                      navigate(`/set/${s.id}`)
                    }}
                    className="flex items-center gap-3 rounded-2xl p-2 text-left active:bg-ink/5"
                  >
                    <SetLogo set={{ kind: 'official', color: setColor(s.id), code: s.ptcgoCode ?? s.id.toUpperCase(), symbol: s.images.symbol, name: s.name }} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-bold">{s.name}</div>
                      <div className="text-[14px] text-ink-2">
                        {s.series} · {s.releaseDate.slice(0, 4)} · {s.total} cards
                      </div>
                    </div>
                    {tracked && <span className="text-[13px] font-bold text-up">Collecting</span>}
                  </button>
                )
              })}
              {!sets.isLoading && filtered.length === 0 && sets.data && <p className="p-4 text-center text-ink-2">No sets match "{term}".</p>}
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
