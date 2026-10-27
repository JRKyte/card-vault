import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { loadCards, loadSetCards, loadSets, resolveSmartSet } from './cards'
import type { Condition } from './pricing'
import { ownedIdSet, type CollectionItem } from './sets'
import { store, type CustomSet, type CustomSetCard, type NewCustomSet, type Profile } from './store'
import { searchEverything } from './search'
import type { Card, TcgSet, Variant } from './tcg'
import { seriesLogos } from './tcgdex'

export const keys = {
  user: ['user'] as const,
  items: ['items'] as const,
  tracked: ['tracked'] as const,
  customSets: ['customSets'] as const,
  customSetCards: ['customSetCards'] as const,
  sets: ['sets'] as const,
  setCards: (id: string) => ['setCards', id] as const,
  cards: (ids: string[]) => ['cards', ids] as const,
  card: (id: string) => ['card', id] as const,
  profile: ['profile'] as const,
  snapshots: ['snapshots'] as const,
  search: (q: string) => ['search', q] as const,
  friends: ['friends'] as const,
  friendCards: (id: string) => ['friendCards', id] as const,
}

export const useUser = () => useQuery({ queryKey: keys.user, queryFn: () => store.getUser(), staleTime: Infinity })

export const useItems = () => useQuery({ queryKey: keys.items, queryFn: () => store.listItems() })
export const useTracked = () => useQuery({ queryKey: keys.tracked, queryFn: () => store.listTracked() })
export const useCustomSets = () => useQuery({ queryKey: keys.customSets, queryFn: () => store.listCustomSets() })
export const useCustomSetCards = () => useQuery({ queryKey: keys.customSetCards, queryFn: () => store.listCustomSetCards() })
export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => store.getProfile() })
export const useSnapshots = () => useQuery({ queryKey: keys.snapshots, queryFn: () => store.listSnapshots() })

export const useSeriesLogos = () => useQuery({ queryKey: ['seriesLogos'], queryFn: seriesLogos, staleTime: Infinity })

export const useSets = () =>
  useQuery({ queryKey: keys.sets, queryFn: () => loadSets(), staleTime: 60 * 60 * 1000 })

export function useSetById(id: string | undefined): TcgSet | undefined {
  const sets = useSets()
  return useMemo(() => sets.data?.find((s) => s.id === id), [sets.data, id])
}

export const useSetCards = (set: TcgSet | undefined) =>
  useQuery({
    queryKey: keys.setCards(set?.id ?? ''),
    queryFn: () => loadSetCards(set!),
    enabled: !!set,
    staleTime: 10 * 60 * 1000,
  })

/** Card objects for a list of ids, fetched together. */
export function useCards(ids: string[]) {
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids])
  return useQuery({
    queryKey: keys.cards(sorted),
    queryFn: () => loadCards(sorted),
    enabled: sorted.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  })
}

/** The collection plus a Map of the card objects for everything owned. */
export function useCollection() {
  const items = useItems()
  const ids = useMemo(() => (items.data ?? []).map((i) => i.card_id), [items.data])
  const cards = useCards(ids)
  const owned = useMemo(() => ownedIdSet(items.data ?? []), [items.data])
  return {
    items: items.data ?? [],
    cards: cards.data ?? new Map<string, Card>(),
    owned,
    isLoading: items.isLoading || (ids.length > 0 && cards.isLoading),
    error: items.error ?? cards.error,
    cardsLoaded: !!cards.data || ids.length === 0,
  }
}

export const useCard = (id: string | undefined) =>
  useQuery({
    queryKey: keys.card(id ?? ''),
    queryFn: async () => {
      const map = await loadCards([id!])
      const card = map.get(id!)
      if (!card) throw new Error('Card not found')
      return card
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })

/** The Add screen's search, across pokemontcg.io and the TCGdex-only sets. `term` is what was typed. */
export const useSearch = (term: string | null) =>
  useQuery({
    queryKey: keys.search(term ?? ''),
    queryFn: async () => searchEverything(term!, await loadSets()),
    enabled: !!term,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  })

/** Membership card ids for every custom set. */
export function useCustomMembership() {
  const rows = useCustomSetCards()
  return useMemo(() => {
    const map = new Map<string, string[]>()
    const resolvedAt = new Map<string, string>()
    for (const r of rows.data ?? []) {
      const list = map.get(r.custom_set_id) ?? []
      list.push(r.card_id)
      map.set(r.custom_set_id, list)
      const prev = resolvedAt.get(r.custom_set_id)
      if (!prev || r.resolved_at < prev) resolvedAt.set(r.custom_set_id, r.resolved_at)
    }
    return { members: map, resolvedAt, isLoading: rows.isLoading }
  }, [rows.data, rows.isLoading])
}

// --- Mutations (all optimistic) ---------------------------------------------

export function useAddItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { card: Card; variant: Variant; condition: Condition; quantity: number }) =>
      store.addItem(v.card.id, v.variant, v.condition, v.quantity),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.items })
      const prev = qc.getQueryData<CollectionItem[]>(keys.items)
      qc.setQueryData<CollectionItem[]>(keys.items, (items = []) => {
        const hit = items.find((i) => i.card_id === v.card.id && i.variant === v.variant && i.condition === v.condition)
        if (hit) return items.map((i) => (i === hit ? { ...i, quantity: i.quantity + v.quantity } : i))
        const optimistic: CollectionItem = {
          id: `temp-${Date.now()}`,
          card_id: v.card.id,
          variant: v.variant,
          condition: v.condition,
          quantity: v.quantity,
          created_at: new Date().toISOString(),
        }
        return [optimistic, ...items]
      })
      // Seed the card cache so the new card has data straight away.
      qc.setQueriesData<Map<string, Card>>({ queryKey: ['cards'] }, (m) => (m ? new Map(m).set(v.card.id, v.card) : m))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.items, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.items }),
  })
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<Pick<CollectionItem, 'variant' | 'condition' | 'quantity'>> }) => store.updateItem(v.id, v.patch),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.items })
      const prev = qc.getQueryData<CollectionItem[]>(keys.items)
      qc.setQueryData<CollectionItem[]>(keys.items, (items = []) => items.map((i) => (i.id === v.id ? { ...i, ...v.patch } : i)))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.items, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.items }),
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => store.deleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.items })
      const prev = qc.getQueryData<CollectionItem[]>(keys.items)
      qc.setQueryData<CollectionItem[]>(keys.items, (items = []) => items.filter((i) => i.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.items, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.items }),
  })
}

export function useTrack() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { setId: string; on: boolean }) => (v.on ? store.track(v.setId) : store.untrack(v.setId)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.tracked })
      const prev = qc.getQueryData<{ set_id: string; created_at: string }[]>(keys.tracked)
      qc.setQueryData(keys.tracked, (rows: { set_id: string; created_at: string }[] = []) =>
        v.on ? [...rows.filter((r) => r.set_id !== v.setId), { set_id: v.setId, created_at: new Date().toISOString() }] : rows.filter((r) => r.set_id !== v.setId),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.tracked, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tracked }),
  })
}

export function useCreateCustomSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { set: NewCustomSet; cardIds: string[] }) => {
      const created = await store.createCustomSet(v.set)
      if (v.set.kind === 'picked') await store.addCustomSetCards(created.id, v.cardIds)
      else await store.replaceCustomSetCards(created.id, v.cardIds)
      return created
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.customSets })
      qc.invalidateQueries({ queryKey: keys.customSetCards })
    },
  })
}

export function useUpdateCustomSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<NewCustomSet>; resolve?: CustomSet }) => {
      await store.updateCustomSet(v.id, v.patch)
      if (v.resolve) await resolveSmartSet({ ...v.resolve, ...v.patch }, null, { force: true })
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.customSets })
      const prev = qc.getQueryData<CustomSet[]>(keys.customSets)
      qc.setQueryData<CustomSet[]>(keys.customSets, (sets = []) => sets.map((s) => (s.id === v.id ? { ...s, ...v.patch } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.customSets, ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.customSets })
      qc.invalidateQueries({ queryKey: keys.customSetCards })
    },
  })
}

export function useDeleteCustomSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => store.deleteCustomSet(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.customSets })
      qc.invalidateQueries({ queryKey: keys.customSetCards })
    },
  })
}

export function useCustomSetMembership() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { setId: string; cardId: string; on: boolean }) =>
      v.on ? store.addCustomSetCards(v.setId, [v.cardId]) : store.removeCustomSetCard(v.setId, v.cardId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.customSetCards })
      const prev = qc.getQueryData<CustomSetCard[]>(keys.customSetCards)
      qc.setQueryData<CustomSetCard[]>(keys.customSetCards, (rows = []) =>
        v.on
          ? [...rows, { custom_set_id: v.setId, card_id: v.cardId, resolved_at: new Date().toISOString() }]
          : rows.filter((r) => !(r.custom_set_id === v.setId && r.card_id === v.cardId)),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.customSetCards, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.customSetCards }),
  })
}

export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Profile) => store.saveProfile(p),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: keys.profile })
      const prev = qc.getQueryData<Profile | null>(keys.profile)
      qc.setQueryData(keys.profile, p)
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.profile, ctx?.prev ?? null),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.profile }),
  })
}

export const useFriends = () => useQuery({ queryKey: keys.friends, queryFn: () => store.listFriends(), enabled: store.friendsAvailable })

export const useFriendCards = (friendId: string | undefined) =>
  useQuery({ queryKey: keys.friendCards(friendId ?? ''), queryFn: () => store.friendCards(friendId!), enabled: !!friendId && store.friendsAvailable })

/** Respond to, or remove, a friendship; refreshes the list. */
export function useFriendActions() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: keys.friends })
  return {
    respond: useMutation({ mutationFn: (v: { id: string; accept: boolean }) => store.respondFriend(v.id, v.accept), onSettled: done }),
    remove: useMutation({ mutationFn: (id: string) => store.removeFriend(id), onSettled: done }),
    request: useMutation({ mutationFn: (email: string) => store.requestFriend(email), onSettled: done }),
  }
}

export const DEFAULT_PROFILE: Profile = { display_name: 'Collector', avatar_mode: 'initials', avatar_card_id: null, currency_display: 'both' }
