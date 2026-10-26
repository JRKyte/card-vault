import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardTile } from '../components/cards'
import { MasteredCelebration } from '../components/Celebrate'
import { IconCheck, IconEdit, IconPlus, IconRefresh, IconX } from '../components/icons'
import { QuickAddSheet } from '../components/QuickAdd'
import { SetIcon } from '../components/SetBits'
import { BackPill, ErrorMessage, Message, ProgressBar, Screen, Segmented, Skeleton, StatusPill, tint, TopRow } from '../components/ui'
import { customColor, setColor } from '../data/set-colors'
import { resolveSmartSet } from '../lib/cards'
import { alpha } from '../lib/color'
import { useCurrencyMode } from '../lib/money'
import { displayPrice } from '../lib/pricing'
import {
  keys,
  useCards,
  useCollection,
  useCustomMembership,
  useCustomSetMembership,
  useCustomSets,
  useSetById,
  useSetCards,
  useSets,
  useTrack,
  useTracked,
} from '../lib/queries'
import { priciestMissing, progress, setValue, sortCards, type CollectionItem } from '../lib/sets'
import type { CustomSet } from '../lib/store'
import type { SetSummary } from '../lib/summaries'
import { parseReleaseDate, type Card } from '../lib/tcg'

type Filter = 'all' | 'got' | 'missing'

export function SetDetail({ kind }: { kind: 'official' | 'custom' }) {
  const { id = '' } = useParams()
  return kind === 'official' ? <OfficialSet id={id} /> : <CustomSetView id={id} />
}

function OfficialSet({ id }: { id: string }) {
  const sets = useSets()
  const set = useSetById(id)
  const cards = useSetCards(set)
  const tracked = useTracked()
  const track = useTrack()
  const { items, cards: ownedCards } = useCollection()
  const knownOwned = new Set(items.filter((i) => ownedCards.get(i.card_id)?.set.id === id).map((i) => i.card_id)).size
  const isTracked = (tracked.data ?? []).some((t) => t.set_id === id)

  if (sets.isLoading) return <Loading />
  if (!set) {
    return (
      <Screen>
        <TopRow left={<BackPill label="Sets" to="/sets" />} />
        {sets.error ? <ErrorMessage error={sets.error} retry={() => sets.refetch()} /> : <Message title="Set not found" body="This set isn't in the card list." />}
      </Screen>
    )
  }

  const color = setColor(set.id)
  const released = parseReleaseDate(set.releaseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <SetBody
      title={set.name}
      color={color}
      logo={<SetIcon set={{ kind: 'official', color, code: set.ptcgoCode ?? set.id.toUpperCase(), name: set.name }} size={64} />}
      badge={`${set.ptcgoCode ?? set.id.toUpperCase()} · ${released}`}
      cards={cards.data}
      loading={cards.isLoading}
      error={cards.error}
      retry={() => cards.refetch()}
      totalHint={set.total}
      ownedHint={knownOwned}
      tracked={isTracked}
      onTrack={() => track.mutate({ setId: set.id, on: true })}
      footer={
        isTracked && (
          <button type="button" className="mx-auto mt-6 block text-[13px] font-semibold text-mute underline underline-offset-4" onClick={() => track.mutate({ setId: set.id, on: false })}>
            Stop collecting this set
          </button>
        )
      }
      backTo={{ name: set.name, href: `/set/${set.id}` }}
    />
  )
}

function CustomSetView({ id }: { id: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  const set = customSets.data?.find((s) => s.id === id)
  const memberIds = useMemo(() => membership.members.get(id) ?? [], [membership.members, id])
  const cards = useCards(memberIds)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<unknown>(null)
  const [removing, setRemoving] = useState(false)
  const toggleMember = useCustomSetMembership()
  const { owned } = useCollection()

  async function refresh(force: boolean) {
    if (!set || set.kind !== 'smart') return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const ids = await resolveSmartSet(set, membership.resolvedAt.get(set.id) ?? null, { force })
      if (ids) await qc.invalidateQueries({ queryKey: keys.customSetCards })
    } catch (e) {
      setRefreshError(e)
    } finally {
      setRefreshing(false)
    }
  }

  // Smart sets re-resolve when their membership is over a day old.
  const checked = useRef<string | null>(null)
  useEffect(() => {
    if (!set || membership.isLoading || checked.current === set.id) return
    checked.current = set.id
    void refresh(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, membership.isLoading])

  usePullToRefresh(() => refresh(true), set?.kind === 'smart')

  if (customSets.isLoading || membership.isLoading) return <Loading />
  if (!set) {
    return (
      <Screen>
        <TopRow left={<BackPill label="Sets" to="/sets" />} />
        <Message title="Set not found" body="It may have been deleted on another device." />
      </Screen>
    )
  }

  const count = memberIds.length
  const editActions = (
    <div className="flex flex-wrap gap-2">
      <Link to={`/custom/${set.id}/edit`} className="chip-btn">
        <IconEdit size={16} /> Edit set
      </Link>
      {set.kind === 'picked' && (
        <>
          <Link to={`/add?to=${set.id}`} className="chip-btn">
            <IconPlus size={16} /> Add cards
          </Link>
          {count > 0 && (
            <button type="button" aria-pressed={removing} className="opt chip-btn" onClick={() => setRemoving((r) => !r)}>
              {removing ? 'Done' : 'Remove cards'}
            </button>
          )}
        </>
      )}
      {set.kind === 'smart' && (
        <button type="button" className="chip-btn" onClick={() => refresh(true)} disabled={refreshing}>
          <IconRefresh size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Updating…' : 'Update'}
        </button>
      )}
    </div>
  )

  return (
    <SetBody
      title={set.name}
      color={customColor(set.color)}
      logo={<SetIcon set={{ kind: set.kind, color: customColor(set.color), code: '', iconCardId: set.icon_card_id, name: set.name }} size={64} />}
      badge={`${set.kind === 'smart' ? 'Smart set' : 'Picked'} · ${count} cards`}
      cards={count === 0 ? [] : cards.data ? memberIds.map((cid) => cards.data!.get(cid)).filter((c): c is Card => !!c) : undefined}
      loading={(count > 0 && cards.isLoading) || (refreshing && count === 0)}
      error={cards.error ?? (count === 0 ? refreshError : null)}
      retry={() => (count ? cards.refetch() : refresh(true))}
      totalHint={count}
      ownedHint={progress(memberIds, owned).owned}
      tracked
      actions={editActions}
      empty={
        set.kind === 'picked' ? (
          <Message
            title="No cards yet"
            body="Add the cards you want in this set. Adding them here doesn't mark them as owned."
            action={
              <button type="button" className="btn mt-2" onClick={() => navigate(`/add?to=${set.id}`)}>
                Choose cards
              </button>
            }
          />
        ) : (
          <Message title="No cards match" body="Try changing the search or what's left out." action={<Link to={`/custom/${set.id}/edit`} className="btn mt-2">Edit set</Link>} />
        )
      }
      removable={removing ? (card) => toggleMember.mutate({ setId: set.id, cardId: card.id, on: false }) : undefined}
      backTo={{ name: set.name, href: `/custom/${set.id}` }}
      customSet={set}
    />
  )
}

function SetBody({
  title,
  color,
  logo,
  badge,
  cards,
  loading,
  error,
  retry,
  totalHint,
  ownedHint,
  tracked,
  onTrack,
  actions,
  footer,
  empty,
  removable,
  backTo,
}: {
  title: string
  color: string
  logo: React.ReactNode
  badge: string
  cards: Card[] | undefined
  loading: boolean
  error: unknown
  retry: () => void
  totalHint: number
  ownedHint: number
  tracked: boolean
  onTrack?: () => void
  actions?: React.ReactNode
  footer?: React.ReactNode
  empty?: React.ReactNode
  removable?: (card: Card) => void
  backTo: { name: string; href: string }
  customSet?: CustomSet
}) {
  const navigate = useNavigate()
  const { items, cards: ownedCards, owned } = useCollection()
  const mode = useCurrencyMode()
  const [filter, setFilter] = useState<Filter>('all')
  const [quickCard, setQuickCard] = useState<Card | null>(null)
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null)
  const [mastered, setMastered] = useState<SetSummary | null>(null)

  // "Added …" confirmation after a quick add, gone after a couple of seconds.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const sorted = useMemo(() => (cards ? sortCards(cards) : undefined), [cards])
  const ids = useMemo(() => (sorted ?? []).map((c) => c.id), [sorted])
  const itemsByCard = useMemo(() => {
    const m = new Map<string, CollectionItem[]>()
    for (const i of items) m.set(i.card_id, [...(m.get(i.card_id) ?? []), i])
    return m
  }, [items])

  const prog = progress(ids.length ? ids : [], owned)
  const total = ids.length || totalHint
  const pct = ids.length ? prog.pct : total ? Math.floor((ownedHint / total) * 100) : 0
  const value = useMemo(() => {
    const merged = new Map(ownedCards)
    for (const c of sorted ?? []) merged.set(c.id, c)
    return setValue(ids, items, merged)
  }, [ids, items, ownedCards, sorted])
  const priciest = useMemo(() => (sorted ? priciestMissing(sorted, owned) : null), [sorted, owned])

  const shown = (sorted ?? []).filter((c) => (filter === 'all' ? true : filter === 'got' ? owned.has(c.id) : !owned.has(c.id)))
  const gotCount = ids.length ? prog.owned : ownedHint
  const missingCount = ids.length ? ids.length - gotCount : 0

  return (
    <Screen>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px]" style={{ background: `radial-gradient(60% 50% at 50% 0%, ${alpha(color, 0.22)}, transparent 70%)` }} />
      <TopRow left={<BackPill label="Sets" to="/sets" />} right={<StatusPill dot={color}>{badge}</StatusPill>} />

      <section
        className="relative flex flex-col gap-4 overflow-hidden rounded-[26px] p-5 wide:p-6"
        style={{ background: `linear-gradient(135deg, ${alpha(color, 0.18)}, rgba(14,10,26,.9) 65%)`, boxShadow: `0 0 0 1px ${alpha(color, 0.4)}, 0 10px 50px ${alpha(color, 0.18)}` }}
      >
        <div className="flex items-center gap-4">
          {logo}
          <h1 className="line-clamp-2 min-w-0 flex-1 text-[clamp(22px,6.4vw,36px)] leading-[1.05] font-extrabold tracking-[-.035em] break-words">{title}</h1>
          {tracked && (
            <div className="flex-none text-right">
              <div className="text-[clamp(26px,7vw,34px)] leading-none font-extrabold tracking-[-.04em]" style={{ color: tint(color), textShadow: `0 0 18px ${alpha(color, 0.5)}` }}>
                {pct}%
              </div>
              <div className="eyebrow mt-1 !text-[9.5px]">mastered</div>
            </div>
          )}
        </div>
        {tracked ? (
          <div className="flex flex-col gap-2.5">
            <p className="mono text-[12px] font-medium text-mute">
              {gotCount} of {total} cards
              {value.priced && <> · worth {displayPrice(mode, value.usd || null, value.eur || null)}</>}
              {total - gotCount > 0 && <> · {total - gotCount} to go</>}
            </p>
            <ProgressBar pct={pct} color={color} height={8} />
          </div>
        ) : (
          <>
            <p className="mono text-[12px] font-medium text-mute">
              {total} cards{gotCount > 0 && ` · you already have ${gotCount}`}
            </p>
            <button type="button" className="cta w-full wide:w-auto wide:self-start" onClick={onTrack}>
              Start collecting this set
            </button>
          </>
        )}
        {actions}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Filter cards"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${ids.length || total}` },
            { value: 'got', label: `Got ${gotCount}` },
            { value: 'missing', label: `Missing ${missingCount}` },
          ]}
        />
        {priciest && (
          <div className="min-w-0 truncate text-[13px] font-medium text-mute">
            Priciest missing: <span className="font-semibold text-ink">{priciest.card.name}</span> · <span className="mono">{displayPrice(mode, priciest.usd, priciest.eur)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <Grid>
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="aspect-[63/88] !rounded-xl" />
          ))}
        </Grid>
      ) : error && !sorted?.length ? (
        <ErrorMessage error={error} retry={retry} />
      ) : sorted && sorted.length === 0 ? (
        (empty ?? <Message title="No cards yet" body="The card list for this set isn't available yet." />)
      ) : shown.length === 0 ? (
        <Message title={filter === 'got' ? 'None yet' : 'Set complete!'} body={filter === 'got' ? 'Cards you add from this set show up here.' : 'You have every card in this set.'} />
      ) : (
        <Grid>
          {shown.map((card) => (
            <div key={card.id} className="relative">
              <CardTile
                card={card}
                items={itemsByCard.get(card.id) ?? []}
                onClick={() => {
                  if (removable) return
                  navigate(owned.has(card.id) ? `/card/${card.id}` : `/add/${card.id}`, { state: { from: backTo } })
                }}
                onQuickAdd={removable ? undefined : () => setQuickCard(card)}
              />
              {removable && (
                <button
                  type="button"
                  onClick={() => removable(card)}
                  aria-label={`Remove ${card.name} from this set`}
                  className="absolute -top-2 -right-2 grid h-9 w-9 place-items-center rounded-full bg-down text-white"
                  style={{ boxShadow: '0 0 14px rgba(248,113,113,.6)' }}
                >
                  <IconX size={16} />
                </button>
              )}
            </div>
          ))}
        </Grid>
      )}
      {footer}

      {quickCard && (
        <QuickAddSheet
          card={quickCard}
          onClose={() => setQuickCard(null)}
          onAdded={(card, completed) => {
            setToast({ key: Date.now(), text: `Added ${card.name}` })
            if (completed) setMastered(completed)
          }}
        />
      )}
      {toast && (
        <div
          key={toast.key}
          role="status"
          className="animate-fade-up fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgba(52,211,153,.35)] bg-[#12201c] px-4 py-3 text-[14px] font-semibold text-up"
          style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 0 24px rgba(52,211,153,.3), 0 12px 30px rgba(0,0,0,.4)' }}
        >
          <IconCheck size={18} /> {toast.text}
        </div>
      )}
      {mastered && <MasteredCelebration setName={mastered.name} colors={[mastered.color, '#a78bfa', '#f472b6', '#fef3c7']} onDone={() => setMastered(null)} />}
    </Screen>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-4 min-[600px]:grid-cols-4 min-[700px]:grid-cols-5 wide:grid-cols-7 wide:gap-x-4">{children}</div>
}

function Loading() {
  return (
    <Screen>
      <Skeleton className="h-10 w-28 !rounded-full" />
      <Skeleton className="h-[200px] !rounded-[26px]" />
    </Screen>
  )
}

/** Pull down from the top of the page to force a refresh. */
function usePullToRefresh(onRefresh: () => void, enabled: boolean) {
  const cb = useRef(onRefresh)
  cb.current = onRefresh
  useEffect(() => {
    if (!enabled) return
    let startY: number | null = null
    const start = (e: TouchEvent) => {
      startY = window.scrollY <= 0 ? e.touches[0].clientY : null
    }
    const end = (e: TouchEvent) => {
      if (startY !== null && e.changedTouches[0].clientY - startY > 110) cb.current()
      startY = null
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchend', end)
    }
  }, [enabled])
}
