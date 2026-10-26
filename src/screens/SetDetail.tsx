import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardTile } from '../components/cards'
import { IconEdit, IconPlus, IconRefresh, IconX } from '../components/icons'
import { SetLogo } from '../components/SetBits'
import { BackPill, ErrorMessage, Message, ProgressBar, Ring, Screen, Skeleton, TopRow } from '../components/ui'
import { setColor } from '../data/set-colors'
import { resolveSmartSet } from '../lib/cards'
import { washFor } from '../lib/color'
import { mainMoney, useCurrencyMode } from '../lib/money'
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
        <TopRow left={<BackPill label="Sets" fallback="/" />} />
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
      logo={<SetLogo set={{ kind: 'official', color, code: set.ptcgoCode ?? set.id.toUpperCase(), symbol: set.images.symbol, name: set.name }} size={72} />}
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
          <button type="button" className="mx-auto mt-10 block text-[15px] font-semibold text-ink-2 underline underline-offset-4" onClick={() => track.mutate({ setId: set.id, on: false })}>
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
        <TopRow left={<BackPill label="Sets" fallback="/" />} />
        <Message title="Set not found" body="It may have been deleted on another device." />
      </Screen>
    )
  }

  const count = memberIds.length
  const editActions = (
    <div className="flex flex-wrap gap-2">
      <Link to={`/custom/${set.id}/edit`} className="glass pill text-[15px]">
        <IconEdit size={18} /> Edit set
      </Link>
      {set.kind === 'picked' && (
        <>
          <Link to={`/add?to=${set.id}`} className="glass pill text-[15px]">
            <IconPlus size={18} /> Add cards
          </Link>
          {count > 0 && (
            <button type="button" className={`pill text-[15px] ${removing ? 'bg-ink text-white' : 'glass'}`} onClick={() => setRemoving((r) => !r)}>
              {removing ? 'Done' : 'Remove cards'}
            </button>
          )}
        </>
      )}
      {set.kind === 'smart' && (
        <button type="button" className="glass pill text-[15px]" onClick={() => refresh(true)} disabled={refreshing}>
          <IconRefresh size={18} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Updating…' : 'Update'}
        </button>
      )}
    </div>
  )

  return (
    <SetBody
      title={set.name}
      color={set.color}
      logo={<SetLogo set={{ kind: set.kind, color: set.color, code: '', iconCardId: set.icon_card_id, name: set.name }} size={72} />}
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
              <button type="button" className="btn-dark mt-2" onClick={() => navigate(`/add?to=${set.id}`)}>
                Choose cards
              </button>
            }
          />
        ) : (
          <Message title="No cards match" body="Try changing the search or what's left out." action={<Link to={`/custom/${set.id}/edit`} className="btn-dark mt-2">Edit set</Link>} />
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
    <Screen wash={washFor(color)}>
      <TopRow left={<BackPill label="Sets" fallback="/" />} right={<span className="glass pill truncate text-[15px] text-ink-2">{badge}</span>} />

      <section className="glass flex flex-col gap-5 p-5 min-[600px]:flex-row min-[600px]:items-center min-[600px]:gap-8 wide:p-7">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-4">
            {logo}
            <h1 className="min-w-0 text-[32px] leading-tight font-extrabold wide:text-[40px]">{title}</h1>
          </div>
          {tracked ? (
            <>
              <p className="mt-4 text-[17px] font-semibold text-ink-2">
                {gotCount} of {total} cards
                {value.priced && <> · worth {mainMoney(mode, value.usd, value.eur)}</>}
                {total - gotCount > 0 && <> · {total - gotCount} to go</>}
              </p>
              <ProgressBar pct={pct} color={color} className="mt-3" />
            </>
          ) : (
            <>
              <p className="mt-4 text-[17px] font-semibold text-ink-2">
                {total} cards{gotCount > 0 && ` · you already have ${gotCount}`}
              </p>
              <button type="button" className="btn-dark mt-4 w-full wide:w-auto" onClick={onTrack}>
                Start collecting this set
              </button>
            </>
          )}
          {actions && <div className="mt-4">{actions}</div>}
        </div>
        {tracked && (
          <div className="self-center">
            <Ring pct={pct} color={color} />
          </div>
        )}
      </section>

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter cards" className="glass inline-flex gap-1 rounded-full p-1">
          {(
            [
              ['all', `All ${ids.length || total}`],
              ['got', `Got ${gotCount}`],
              ['missing', `Missing ${missingCount}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={filter === v}
              onClick={() => setFilter(v)}
              className={`min-h-11 rounded-full px-5 text-[16px] font-semibold ${filter === v ? 'bg-ink text-white' : 'text-ink-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {priciest && (
          <div className="truncate text-[15px] font-semibold text-ink-2">
            Priciest missing: <span className="text-ink">{priciest.card.name}</span> · {displayPrice(mode, priciest.usd, priciest.eur)}
          </div>
        )}
      </div>

      {loading ? (
        <Grid>
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="aspect-[63/88]" />
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
              />
              {removable && (
                <button
                  type="button"
                  onClick={() => removable(card)}
                  aria-label={`Remove ${card.name} from this set`}
                  className="absolute -top-2 -right-2 grid h-10 w-10 place-items-center rounded-full bg-ink text-white shadow-lg"
                >
                  <IconX size={18} />
                </button>
              )}
            </div>
          ))}
        </Grid>
      )}
      {footer}
    </Screen>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-4 min-[600px]:grid-cols-4 min-[700px]:grid-cols-5 wide:grid-cols-7 wide:gap-x-4">{children}</div>
}

function Loading() {
  return (
    <Screen>
      <Skeleton className="mb-6 h-11 w-32 rounded-full" />
      <Skeleton className="h-[200px]" />
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
