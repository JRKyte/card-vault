import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { CardImage } from '../components/cards'
import { IconPlus } from '../components/icons'
import { QuickAddSheet } from '../components/QuickAdd'
import { BackPill, ErrorMessage, Message, Screen, Skeleton, tint, TopRow } from '../components/ui'
import { setColor } from '../data/set-colors'
import { alpha } from '../lib/color'
import { useCards, useCustomMembership, useCustomSets, useFriendActions, useFriendCards, useFriends, useItems, useTracked } from '../lib/queries'
import { swapOptions, type CardCount } from '../lib/swaps'
import type { Card } from '../lib/tcg'
import { friendProfile } from './Swaps'

export function FriendSwaps() {
  const { friendId = '' } = useParams()
  const navigate = useNavigate()
  const friends = useFriends()
  const friend = friends.data?.find((f) => f.friend_id === friendId && f.status === 'accepted')
  const mine = useItems()
  const theirs = useFriendCards(friend ? friendId : undefined)
  const options = useMemo(() => (mine.data && theirs.data ? swapOptions(mine.data, theirs.data) : null), [mine.data, theirs.data])
  const ids = useMemo(() => (options ? [...options.theyCanGive, ...options.youCanGive].map((c) => c.card_id) : []), [options])
  const cards = useCards(ids)
  const helps = useHelpsMySets()
  const { remove } = useFriendActions()
  const [quickCard, setQuickCard] = useState<Card | null>(null)

  if (friends.isLoading) {
    return (
      <Screen>
        <Skeleton className="h-10 w-28 !rounded-full" />
        <Skeleton className="h-[200px] !rounded-[26px]" />
      </Screen>
    )
  }
  if (!friend) {
    return (
      <Screen>
        <TopRow left={<BackPill label="Swaps" to="/swaps" />} />
        <Message title="Not a friend yet" body="They may not have accepted yet, or the friendship was removed." />
      </Screen>
    )
  }

  const name = friend.display_name
  // Cards that would help a set you're collecting go first.
  const sortGive = (list: CardCount[]) => [...list].sort((a, b) => Number(!!helps(b.card_id, cards.data)) - Number(!!helps(a.card_id, cards.data)))

  return (
    <Screen>
      <TopRow left={<BackPill label="Swaps" to="/swaps" />} />
      <header className="flex items-center gap-4">
        <Avatar profile={friendProfile(friend)} size={64} ring />
        <div className="min-w-0">
          <span className="eyebrow">{options ? `${options.swaps} ${options.swaps === 1 ? 'swap' : 'swaps'} possible` : 'Checking cards…'}</span>
          <h1 className="title truncate">{name}</h1>
        </div>
      </header>

      {theirs.error ? (
        <ErrorMessage error={theirs.error} retry={() => theirs.refetch()} />
      ) : !options || (ids.length > 0 && cards.isLoading) ? (
        <Grid>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[63/88] !rounded-xl" />
          ))}
        </Grid>
      ) : (
        <>
          <Section title={`${name} can give you`} count={options.theyCanGive.length} empty={`${name} has no spares you're missing right now.`}>
            {sortGive(options.theyCanGive).map((c) => {
              const card = cards.data?.get(c.card_id)
              return card ? <SwapTile key={c.card_id} card={card} spare={c.quantity} helps={helps(c.card_id, cards.data)} onOpen={() => navigate(`/add/${card.id}`)} onAdd={() => setQuickCard(card)} /> : null
            })}
          </Section>
          <Section title={`You can give ${name}`} count={options.youCanGive.length} empty={`You have no spares ${name} is missing right now.`}>
            {options.youCanGive.map((c) => {
              const card = cards.data?.get(c.card_id)
              return card ? <SwapTile key={c.card_id} card={card} spare={c.quantity} onOpen={() => navigate(`/card/${card.id}`)} /> : null
            })}
          </Section>
          <p className="text-center text-[12.5px] text-mute">Spares are cards with 2 or more copies, counting every version. After a swap, add your new card with the + button.</p>
        </>
      )}

      <button
        type="button"
        className="mx-auto mt-2 block min-h-11 text-[13px] font-semibold text-down underline underline-offset-4"
        onClick={() => {
          if (!confirm(`Remove ${name} as a friend? You'll stop seeing each other's spares.`)) return
          remove.mutate(friend.friendship_id, { onSuccess: () => navigate('/swaps', { replace: true }) })
        }}
      >
        Remove friend
      </button>

      {quickCard && <QuickAddSheet card={quickCard} onClose={() => setQuickCard(null)} />}
    </Screen>
  )
}

/** For a card id: the name of a set I'm collecting that it would count towards, if any. */
function useHelpsMySets() {
  const tracked = useTracked()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  return useMemo(() => {
    const trackedIds = new Set((tracked.data ?? []).map((t) => t.set_id))
    return (cardId: string, cards: Map<string, Card> | undefined): string | null => {
      const card = cards?.get(cardId)
      if (card && trackedIds.has(card.set.id)) return card.set.name
      const custom = (customSets.data ?? []).find((s) => membership.members.get(s.id)?.includes(cardId))
      return custom?.name ?? null
    }
  }, [tracked.data, customSets.data, membership.members])
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="mt-1 flex items-baseline gap-2 text-[22px] font-bold tracking-[-.03em]">
        {title} <span className="mono text-[13px] font-medium text-mute">{count}</span>
      </h2>
      {count === 0 ? <p className="surface !rounded-[20px] px-5 py-4 text-[14px] text-mute">{empty}</p> : <Grid>{children}</Grid>}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-4 min-[600px]:grid-cols-4 min-[700px]:grid-cols-5 wide:grid-cols-6">{children}</div>
}

function SwapTile({ card, spare, helps, onOpen, onAdd }: { card: Card; spare: number; helps?: string | null; onOpen: () => void; onAdd?: () => void }) {
  const color = setColor(card.set.id)
  return (
    // self-start: a taller neighbour (with a "Helps" tag) mustn't stretch this tile and push the + down.
    <div className="relative flex flex-col gap-1.5 self-start">
      <button type="button" onClick={onOpen} className="flex flex-col gap-1.5 text-left transition-transform hover:-translate-y-0.5" aria-label={card.name}>
        <div className="relative">
          <CardImage card={card} rounded={12} style={helps ? { boxShadow: `0 0 0 1.5px ${color}, 0 0 20px ${alpha(color, 0.45)}` } : { boxShadow: '0 8px 24px rgba(0,0,0,.4)' }} />
          <span className="mono absolute top-1.5 right-1.5 rounded-full bg-[#0b0912]/85 px-2 py-0.5 text-[10.5px] font-semibold text-accent-2">{spare} spare</span>
        </div>
        <span className="truncate px-0.5 text-[12.5px] font-semibold">{card.name}</span>
      </button>
      {helps && (
        <span className="truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: alpha(color, 0.14), color: tint(color) }}>
          Helps {helps}
        </span>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${card.name} after swapping`}
          className="absolute right-2 bottom-[34px] grid h-8 w-8 place-items-center rounded-full text-white transition-transform active:scale-90"
          style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 0 0 1px rgba(196,181,253,.5), 0 0 16px rgba(139,92,246,.7)', bottom: helps ? 58 : 34 }}
        >
          <IconPlus size={16} strokeWidth={2.6} />
        </button>
      )}
    </div>
  )
}
