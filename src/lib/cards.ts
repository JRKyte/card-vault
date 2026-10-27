// Card and set loading: shared Supabase cache first, pokemontcg.io when missing or older than 24h.
// If the API is down we fall back to whatever is cached, however old.

import { applyExclusions } from './sets'
import { store, type Cached, type CustomSet, type PriceHistoryRow } from './store'
import { allCards, allSets, cardsByIds, setCards, VARIANTS, type Card, type TcgSet } from './tcg'
import { withTcgdexPrices } from './tcgdex'
import { extraSets, isTcgdexId, tcgdexCards, tcgdexSetCards } from './tcgdexCards'

export const FRESH_MS = 24 * 60 * 60 * 1000

/**
 * Bump when cached card data gains something new, so older cache rows refresh straight away
 * instead of waiting out the day. 2 = TCGdex EUR prices and variants.
 */
export const CARD_CACHE_VERSION = 2

const isFresh = (fetched_at: string) => Date.now() - new Date(fetched_at).getTime() < FRESH_MS

/** A cached card is usable without refetching if it's under a day old and from this cache version. */
export const isFreshCard = (c: Cached<Card>) => isFresh(c.fetched_at) && c.data.cacheVersion === CARD_CACHE_VERSION
export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

/** Save fresh cards to the shared cache and record today's prices for the movers list. */
async function remember(cards: Card[]) {
  if (!cards.length) return
  await store.putCards(cards.map((c) => ({ ...c, cacheVersion: CARD_CACHE_VERSION })))
  const taken_on = today()
  const rows: PriceHistoryRow[] = cards
    .filter((c) => c.tcgplayer?.prices || c.cardmarket?.prices)
    .map((c) => {
      const usd: PriceHistoryRow['usd'] = {}
      for (const v of VARIANTS) {
        const p = c.tcgplayer?.prices?.[v]
        const n = p?.market || p?.mid
        if (n) usd[v] = n
      }
      const cm = c.cardmarket?.prices
      return {
        card_id: c.id,
        taken_on,
        usd,
        eur: cm ? { trend: cm.trendPrice || null, reverseHoloTrend: cm.reverseHoloTrend || null, average: cm.averageSellPrice || null } : null,
      }
    })
  await store.putPriceHistory(rows).catch(() => {
    // History is a nice-to-have; never fail a card load over it.
  })
}

/** Cards by id, refreshing anything stale. */
export async function loadCards(ids: string[], opts: { force?: boolean } = {}): Promise<Map<string, Card>> {
  const unique = [...new Set(ids)]
  const map = new Map<string, Card>()
  if (!unique.length) return map
  const cached = await store.getCachedCards(unique).catch(() => [] as Cached<Card>[])
  for (const c of cached) map.set(c.data.id, c.data)
  const fresh = new Set(cached.filter(isFreshCard).map((c) => c.data.id))
  const need = opts.force ? unique : unique.filter((id) => !fresh.has(id))
  if (need.length) {
    try {
      // Cards from sets only TCGdex has load from TCGdex; the rest from pokemontcg.io.
      const [fromPtcg, fromTcgdex] = await Promise.all([
        (async () => {
          const ids = need.filter((id) => !isTcgdexId(id))
          return ids.length ? withTcgdexPrices(await cardsByIds(ids)) : []
        })(),
        tcgdexCards(need.filter(isTcgdexId)),
      ])
      const fetched = [...fromPtcg, ...fromTcgdex]
      for (const c of fetched) map.set(c.id, c)
      await remember(fetched).catch(() => undefined)
    } catch (e) {
      if (map.size === 0) throw e
    }
  }
  return map
}

/** Every card in an official set, refreshed as a batch (one or two requests). */
export async function loadSetCards(set: Pick<TcgSet, 'id' | 'total'>, opts: { force?: boolean } = {}): Promise<Card[]> {
  const cached = await store.getCachedSetCards(set.id).catch(() => [] as Cached<Card>[])
  const complete = cached.length >= set.total && cached.every(isFreshCard)
  if (complete && !opts.force) return cached.map((c) => c.data)
  try {
    const cards = isTcgdexId(set.id) ? await tcgdexSetCards(set.id) : await withTcgdexPrices(await setCards(set.id))
    await remember(cards).catch(() => undefined)
    return cards
  } catch (e) {
    if (cached.length) return cached.map((c) => c.data)
    throw e
  }
}

/**
 * All official sets, newest first: pokemontcg.io's, plus the physical sets only TCGdex has
 * (e.g. MEP promos). A cached list from before TCGdex sets were added counts as stale.
 */
export async function loadSets(opts: { force?: boolean } = {}): Promise<TcgSet[]> {
  const cached = await store.getCachedSets().catch(() => [] as Cached<TcgSet>[])
  const sortNewest = (sets: TcgSet[]) => [...sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
  const usable = cached.length && cached.every((c) => isFresh(c.fetched_at)) && cached.some((c) => isTcgdexId(c.data.id))
  if (usable && !opts.force) return sortNewest(cached.map((c) => c.data))
  try {
    const ptcg = await allSets()
    // TCGdex being down shouldn't hide pokemontcg.io's sets.
    const extra = await extraSets(ptcg).catch(() => [] as TcgSet[])
    const sets = [...ptcg, ...extra]
    await store.putSets(sets).catch(() => undefined)
    return sortNewest(sets)
  } catch (e) {
    if (cached.length) return sortNewest(cached.map((c) => c.data))
    throw e
  }
}

/** Run a smart set's query and apply its exclusions. Used for previews and re-resolution. */
export async function runSmartQuery(query: string, exclusions: CustomSet['exclusions']): Promise<Card[]> {
  const cards = await allCards(query, '-set.releaseDate,number')
  return applyExclusions(cards, exclusions)
}

/** Re-resolve a smart set if its membership is stale (or forced), saving the new card ids. */
export async function resolveSmartSet(set: CustomSet, resolvedAt: string | null, opts: { force?: boolean } = {}): Promise<string[] | null> {
  if (set.kind !== 'smart' || !set.query) return null
  if (!opts.force && resolvedAt && isFresh(resolvedAt)) return null
  const cards = await withTcgdexPrices(await runSmartQuery(set.query, set.exclusions))
  await remember(cards).catch(() => undefined)
  const ids = cards.map((c) => c.id)
  await store.replaceCustomSetCards(set.id, ids)
  return ids
}

/** The q string a smart set stores for "Cards named <term>". */
export function smartQueryFor(term: string): string | null {
  const clean = term.trim().replace(/["\\:()*]/g, ' ').trim()
  if (clean.length < 2) return null
  return clean.includes(' ') ? `name:"${clean}*"` : `name:${clean}*`
}

/** Turn a stored smart query back into the search term for editing. */
export function termFromQuery(q: string | null): string {
  if (!q) return ''
  return q.replace(/^name:/, '').replace(/^"|"$/g, '').replace(/\*$/, '')
}
