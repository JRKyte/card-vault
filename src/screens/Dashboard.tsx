import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { IconChevronRight, IconPlus, IconStar } from '../components/icons'
import { RecentSetTile } from '../components/SetBits'
import { Message, Screen, Skeleton } from '../components/ui'
import { today } from '../lib/cards'
import { useCurrencyMode } from '../lib/money'
import { displayPrice, fmtIn, inCurrency } from '../lib/pricing'
import { DEFAULT_PROFILE, useCollection, useProfile, useSets, useSnapshots } from '../lib/queries'
import { itemsValue, rarityBuckets, type RarityBucket } from '../lib/sets'
import { useSetSummaries, type SetSummary } from '../lib/summaries'
import { daysUntil, nextUpcoming } from '../lib/upcoming'

const RARITY_COLORS: Record<RarityBucket, string> = { Commons: '#94a3b8', Uncommons: '#34d399', Rares: '#facc15', Promos: '#f472b6' }
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA')

export function Dashboard() {
  const profile = useProfile().data ?? DEFAULT_PROFILE
  const summaries = useSetSummaries()
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <Screen>
      <header className="flex items-end justify-between gap-4 pt-2">
        <div className="flex flex-col gap-1">
          <span className="mono text-[11px] font-semibold tracking-[.14em] text-mute uppercase">{date}</span>
          <h1 className="title">Card Vault</h1>
        </div>
        <Link to="/settings" aria-label="Settings" className="flex-none rounded-full">
          <Avatar profile={profile} size={52} ring />
        </Link>
      </header>

      <Stats mine={summaries.mine} />
      <ComingNext />
      <RecentSets recent={summaries.recent} loading={summaries.isLoading} pending={summaries.setsLoading ? summaries.trackedPending : 0} />
    </Screen>
  )
}

function Stats({ mine }: { mine: SetSummary[] }) {
  const { items, cards, isLoading } = useCollection()
  const snapshots = useSnapshots()
  const mode = useCurrencyMode()

  const s = useMemo(() => {
    const count = items.reduce((n, i) => n + i.quantity, 0)
    const weekAgoMs = Date.now() - 7 * 864e5
    const thisWeek = items.filter((i) => new Date(i.created_at).getTime() > weekAgoMs).reduce((n, i) => n + i.quantity, 0)
    const value = itemsValue(items, cards)
    const now = inCurrency(mode, value.priced ? value.usd : null, value.priced ? value.eur : null)
    const snaps = snapshots.data ?? []
    // Change since the newest snapshot at least a week old (or the oldest we have).
    const base = [...snaps].reverse().find((x) => x.taken_on <= daysAgo(7)) ?? snaps[0]
    const then = base ? inCurrency(mode, Number(base.total_usd), Number(base.total_eur)) : null
    const delta = now !== null && then !== null ? now - then : null
    // Sparkline: the last 14 snapshots plus today's live value.
    const points = [...snaps.filter((x) => x.taken_on !== today()).slice(-13).map((x) => inCurrency(mode, Number(x.total_usd), Number(x.total_eur))), now].filter(
      (n): n is number => n !== null,
    )
    const rar = rarityBuckets(items, cards)
    const mastered = mine.filter((x) => x.progress.mastered).length
    const next = mine.filter((x) => !x.progress.mastered).sort((a, b) => b.progress.pct - a.progress.pct)[0]
    return { count, thisWeek, value, delta, points, rar, mastered, next }
  }, [items, cards, snapshots.data, mine, mode])

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-[188px] flex-[1_1_320px] !rounded-[26px]" />
        <Skeleton className="h-[188px] flex-[1_1_320px] !rounded-[20px]" />
      </div>
    )
  }

  const rarTotal = Object.values(s.rar).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-wrap gap-3">
      {/* Total cards hero */}
      <div
        className="relative flex flex-[1_1_320px] flex-col gap-4 overflow-hidden rounded-[26px] p-5 text-white"
        style={{
          background: 'linear-gradient(135deg,#2b1458 0%,#160c2b 60%,#0e0a1a 100%)',
          boxShadow: '0 0 0 1px rgba(167,139,250,.4), 0 10px 50px rgba(139,92,246,.35)',
        }}
      >
        <div className="pointer-events-none absolute -top-[70px] -right-[50px] h-60 w-60 rounded-full" style={{ background: 'radial-gradient(circle, rgba(167,139,250,.45), transparent 65%)' }} />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="mono text-[10.5px] font-semibold tracking-[.16em] text-accent-2">TOTAL CARDS</span>
            <span className="text-[56px] leading-[.95] font-extrabold tracking-[-.05em]" style={{ textShadow: '0 0 28px rgba(196,181,253,.6)' }}>
              {s.count.toLocaleString()}
            </span>
          </div>
          {s.thisWeek > 0 && <span className="rounded-full bg-[rgba(52,211,153,.14)] px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap text-up">+{s.thisWeek} this week</span>}
        </div>
        {rarTotal > 0 ? (
          <>
            <div className="relative flex h-2.5 gap-[3px]">
              {(Object.keys(s.rar) as RarityBucket[])
                .filter((k) => s.rar[k] > 0)
                .map((k) => (
                  <div key={k} className="rounded-full" style={{ flex: `${s.rar[k]} 1 0`, background: RARITY_COLORS[k], boxShadow: `0 0 12px ${RARITY_COLORS[k]}` }} />
                ))}
            </div>
            <div className="relative flex flex-wrap gap-x-3.5 gap-y-1.5">
              {(Object.keys(s.rar) as RarityBucket[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-[#cbc4dd]">
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: RARITY_COLORS[k], boxShadow: `0 0 8px ${RARITY_COLORS[k]}` }} />
                  {k} {Math.round((s.rar[k] / rarTotal) * 100)}%
                </span>
              ))}
            </div>
          </>
        ) : (
          <Link to="/add" className="relative flex items-center gap-2 self-start rounded-full bg-white/10 px-4 py-2.5 text-[13px] font-semibold">
            <IconPlus size={16} /> Add your first card
          </Link>
        )}
      </div>

      {/* Value + master sets */}
      <div className="grid flex-[1_1_320px] grid-cols-2 gap-2.5">
        <Link to="/value" className="tile flex min-w-0 flex-col gap-2 p-3.5">
          <div className="pointer-events-none absolute -right-[30px] -bottom-10 h-[120px] w-[120px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(52,211,153,.22), transparent 70%)' }} />
          <span className="relative text-[12px] font-medium text-mute">Collection value</span>
          <span className="relative truncate text-[26px] leading-none font-bold tracking-[-.03em]">
            {s.value.priced ? displayPrice(mode, s.value.usd || null, s.value.eur || null) : '—'}
          </span>
          {s.delta !== null && Math.abs(s.delta) >= 0.01 ? (
            <span className={`relative text-[11.5px] font-semibold ${s.delta >= 0 ? 'text-up' : 'text-down'}`}>
              {s.delta >= 0 ? '▲' : '▼'} {fmtIn(mode, Math.abs(s.delta))} this week
            </span>
          ) : (
            <span className="relative text-[11.5px] text-mute">{mode === 'gbp' ? 'Approx, from EUR' : 'This week'}</span>
          )}
          <Sparkline points={s.points} color={s.delta !== null && s.delta < 0 ? '#f87171' : '#34d399'} />
        </Link>
        <Link to="/sets" className="tile flex min-w-0 flex-col gap-2 p-3.5">
          <div className="pointer-events-none absolute -right-[30px] -bottom-10 h-[120px] w-[120px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(167,139,250,.22), transparent 70%)' }} />
          <span className="relative text-[12px] font-medium text-mute">Master sets</span>
          <span className="relative text-[26px] leading-none font-bold tracking-[-.03em]">
            {s.mastered}
            <span className="font-medium text-mute"> / {mine.length}</span>
          </span>
          <span className="relative truncate text-[11.5px] text-mute">{s.next ? `Next: ${s.next.name}` : mine.length ? 'All mastered!' : 'No sets yet'}</span>
          <div className="relative flex h-[26px] items-end gap-1">
            {mine.slice(0, 12).map((x) => (
              <span
                key={x.key}
                className="h-2 flex-1 rounded"
                style={x.progress.mastered ? { background: '#a78bfa', boxShadow: '0 0 12px #a78bfa' } : { background: 'var(--track)' }}
              />
            ))}
          </div>
        </Link>
      </div>
    </div>
  )
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div className="h-[26px]" />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const coords = points.map((p, i) => `${(i / (points.length - 1)) * 100},${24 - ((p - min) / span) * 20}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="relative h-[26px] w-full overflow-visible" aria-hidden>
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  )
}

function ComingNext() {
  const sets = useSets()
  const next = nextUpcoming(sets.data)
  if (!next) return null
  const days = daysUntil(next.releaseDate)
  return (
    <div className="flex items-center gap-3 rounded-[18px] py-2.5 pr-2.5 pl-4" style={{ background: 'var(--surface)', border: '1px solid rgba(167,139,250,.28)', boxShadow: '0 0 24px rgba(139,92,246,.12)' }}>
      <span className="h-2 w-2 flex-none rounded-full bg-accent" style={{ boxShadow: '0 0 10px #a78bfa' }} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="mono text-[9.5px] font-semibold tracking-[.14em] text-mute">COMING NEXT</span>
        <span className="truncate text-[13.5px] font-semibold">
          {next.name}{' '}
          <span className="font-medium text-mute">
            · {next.releaseDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            {next.cardCount ? ` · ${next.cardCount} cards` : ''}
          </span>
        </span>
      </div>
      <span className="mono flex-none rounded-xl bg-[rgba(139,92,246,.18)] px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-[#e9e3ff]">
        {days === 0 ? 'Today' : `${days}d`}
      </span>
    </div>
  )
}

function RecentSets({ recent, loading, pending }: { recent: SetSummary[]; loading: boolean; pending: number }) {
  return (
    <section className="mt-1 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold tracking-[-.03em]">Recent sets</h2>
        <Link to="/sets" className="flex items-center gap-1 rounded-full py-2 pr-1.5 pl-3 text-[13px] font-semibold text-accent hover:bg-[var(--chip)]">
          See all <IconChevronRight size={16} strokeWidth={2.4} />
        </Link>
      </div>
      {loading ? (
        <div className="grid auto-cols-[minmax(156px,1fr)] grid-flow-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[150px] !rounded-[22px]" />
          ))}
        </div>
      ) : recent.length === 0 && !pending ? (
        <Message
          icon={<IconStar />}
          title="Pick a set to collect"
          body="Choose a set and see which cards you've got and which you still need."
          action={
            <Link to="/sets?new=1" className="btn mt-2">
              Choose a set
            </Link>
          }
        />
      ) : (
        <div className="no-scrollbar -mx-1 grid auto-cols-[minmax(156px,1fr)] grid-flow-col gap-2.5 overflow-x-auto px-1 pt-1 pb-2">
          {recent.slice(0, 8).map((s) => (
            <RecentSetTile key={s.key} set={s} />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <Skeleton key={`p${i}`} className="h-[150px] !rounded-[22px]" />
          ))}
        </div>
      )}
    </section>
  )
}
