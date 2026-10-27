// One shape for official and custom sets, so the dashboard and card screens can treat them alike.

import { useMemo } from 'react'
import { customColor, setColor } from '../data/set-colors'
import { useCollection, useCustomMembership, useCustomSets, useSets, useTracked } from './queries'
import { itemsValue, progress, type CollectionItem, type Money, type Progress } from './sets'
import type { CustomSet } from './store'
import type { Card, TcgSet } from './tcg'

export interface SetSummary {
  key: string
  kind: 'official' | 'smart' | 'picked'
  id: string
  name: string
  color: string
  code: string
  symbol?: string
  iconCardId?: string | null
  releaseDate?: string
  /** Official sets only: the series it belongs to, e.g. "Scarlet & Violet". */
  series?: string
  tracked: boolean
  progress: Progress
  value: Money
  href: string
  /** When a card in this set was last added (ISO), for "Recent sets". */
  lastAdded: string | null
}

const latest = (items: CollectionItem[]) => items.reduce<string | null>((max, i) => (!max || i.created_at > max ? i.created_at : max), null)

export function officialSummary(set: TcgSet, items: CollectionItem[], cards: ReadonlyMap<string, Card>, tracked: boolean): SetSummary {
  // An official set's cards are exactly the cards whose set.id matches, so we can count from
  // the owned cards alone without loading the whole set list.
  const inSet = items.filter((i) => cards.get(i.card_id)?.set.id === set.id)
  const ownedIds = new Set(inSet.map((i) => i.card_id))
  const total = Math.max(set.total, ownedIds.size)
  const owned = ownedIds.size
  const pct = total ? Math.floor((owned / total) * 100) : 0
  return {
    key: `official:${set.id}`,
    kind: 'official',
    id: set.id,
    name: set.name,
    color: setColor(set.id),
    code: set.ptcgoCode ?? set.id.toUpperCase(),
    symbol: set.images.symbol,
    releaseDate: set.releaseDate,
    series: set.series,
    tracked,
    progress: { owned, total, pct, mastered: total > 0 && owned === total },
    value: itemsValue(inSet, cards),
    href: `/set/${set.id}`,
    lastAdded: latest(inSet),
  }
}

export function customSummary(set: CustomSet, members: string[], items: CollectionItem[], cards: ReadonlyMap<string, Card>, owned: ReadonlySet<string>): SetSummary {
  const ids = new Set(members)
  const inSet = items.filter((i) => ids.has(i.card_id))
  return {
    key: `custom:${set.id}`,
    kind: set.kind,
    id: set.id,
    name: set.name,
    color: customColor(set.color),
    code: set.kind === 'smart' ? 'SMART' : 'PICKED',
    iconCardId: set.icon_card_id,
    tracked: true,
    progress: progress(members, owned),
    value: itemsValue(inSet, cards),
    href: `/custom/${set.id}`,
    lastAdded: latest(inSet),
  }
}

/** Every set the dashboard knows about, plus loading state. */
export function useSetSummaries() {
  const sets = useSets()
  const tracked = useTracked()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  const collection = useCollection()

  return useMemo(() => {
    const trackedIds = new Set((tracked.data ?? []).map((t) => t.set_id))
    const official = (sets.data ?? []).map((s) => officialSummary(s, collection.items, collection.cards, trackedIds.has(s.id)))
    const custom = (customSets.data ?? []).map((s) => customSummary(s, membership.members.get(s.id) ?? [], collection.items, collection.cards, collection.owned))
    const mine = [...official.filter((s) => s.tracked), ...custom].sort((a, b) => b.progress.pct - a.progress.pct || b.progress.owned - a.progress.owned)
    // My sets with the most recently added cards first; untouched sets after, newest first.
    const recent = [...mine].sort((a, b) => (b.lastAdded ?? '').localeCompare(a.lastAdded ?? '') || (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    return {
      official,
      custom,
      mine,
      recent,
      membership,
      trackedIds,
      isLoading: tracked.isLoading || customSets.isLoading || membership.isLoading,
      setsLoading: sets.isLoading,
      setsError: sets.error,
      refetchSets: sets.refetch,
      // Tracked sets missing from the API list (e.g. API down and nothing cached yet).
      trackedPending: (tracked.data ?? []).filter((t) => !(sets.data ?? []).some((s) => s.id === t.set_id)).length,
    }
  }, [sets.data, sets.isLoading, sets.error, sets.refetch, tracked.data, tracked.isLoading, customSets.data, customSets.isLoading, membership, collection.items, collection.cards, collection.owned])
}

/** Summaries of every set a card counts towards: its official set plus any custom sets that include it. */
export function setsForCard(
  card: Card,
  sets: TcgSet[] | undefined,
  customSets: CustomSet[] | undefined,
  members: Map<string, string[]>,
  items: CollectionItem[],
  cards: ReadonlyMap<string, Card>,
  owned: ReadonlySet<string>,
): SetSummary[] {
  const out: SetSummary[] = []
  const official = sets?.find((s) => s.id === card.set.id) ?? card.set
  const withCard = new Map(cards).set(card.id, card)
  out.push(officialSummary(official, items, withCard, false))
  for (const cs of customSets ?? []) {
    const m = members.get(cs.id) ?? []
    if (m.includes(card.id)) out.push(customSummary(cs, m, items, withCard, owned))
  }
  return out
}

export interface SeriesGroup {
  name: string
  slug: string
  sets: SetSummary[]
  tracked: number
  latest: string
}

/** Official sets grouped by series, newest series first; sets within a series newest first. */
export function groupBySeries(official: SetSummary[]): SeriesGroup[] {
  const groups = new Map<string, SetSummary[]>()
  for (const s of official) {
    const name = s.series || 'Other'
    groups.set(name, [...(groups.get(name) ?? []), s])
  }
  return [...groups.entries()]
    .map(([name, sets]) => {
      const sorted = [...sets].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
      return { name, slug: encodeURIComponent(name), sets: sorted, tracked: sets.filter((s) => s.tracked).length, latest: sorted[0]?.releaseDate ?? '' }
    })
    .sort((a, b) => b.latest.localeCompare(a.latest))
}
