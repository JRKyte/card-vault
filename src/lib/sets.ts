import { bestEur, bestUsd, inCurrency, priceFor, variantsFor, type Condition, type CurrencyMode } from './pricing'
import { parseReleaseDate, type Card, type Variant } from './tcg'

export interface CollectionItem {
  id: string
  card_id: string
  variant: Variant
  condition: Condition
  quantity: number
  created_at: string
}

export interface Exclusions {
  promos?: boolean
  beforeYear?: number | null
  secretRares?: boolean
  trainers?: boolean
}

export interface Progress {
  owned: number
  total: number
  pct: number // 0..100, floored so 99.6% never reads as mastered
  mastered: boolean
}

export const ownedIdSet = (items: CollectionItem[]) => new Set(items.map((i) => i.card_id))

export function progress(setCardIds: readonly string[], owned: ReadonlySet<string>): Progress {
  const ids = new Set(setCardIds)
  let got = 0
  for (const id of ids) if (owned.has(id)) got++
  const total = ids.size
  const pct = total === 0 ? 0 : Math.floor((got / total) * 100)
  return { owned: got, total, pct, mastered: total > 0 && got === total }
}

export interface Money {
  usd: number
  eur: number
  /** True when at least one owned card had a price. Lets the UI show "—" instead of $0.00. */
  priced: boolean
}

/** Value of the given collection rows, counting every copy. Unpriced cards add nothing. */
export function itemsValue(items: CollectionItem[], cards: ReadonlyMap<string, Card>): Money {
  let usd = 0
  let eur = 0
  let priced = false
  for (const item of items) {
    const card = cards.get(item.card_id)
    if (!card) continue
    const p = priceFor(card, item.variant, item.condition)
    if (!p) continue
    priced = true
    usd += (p.usd ?? 0) * item.quantity
    eur += (p.eur ?? 0) * item.quantity
  }
  return { usd: round(usd), eur: round(eur), priced }
}

/** A set's value: owned rows whose card is in the set. */
export function setValue(setCardIds: readonly string[], items: CollectionItem[], cards: ReadonlyMap<string, Card>): Money {
  const ids = new Set(setCardIds)
  return itemsValue(
    items.filter((i) => ids.has(i.card_id)),
    cards,
  )
}

export function missingCards(setCards: Card[], owned: ReadonlySet<string>): Card[] {
  return setCards.filter((c) => !owned.has(c.id))
}

/** The missing card worth most. Ranks by USD, or EUR for cards TCGplayer doesn't price. */
export function priciestMissing(setCards: Card[], owned: ReadonlySet<string>): { card: Card; usd: number | null; eur: number | null } | null {
  let best: { card: Card; usd: number | null; eur: number | null; rank: number } | null = null
  for (const card of missingCards(setCards, owned)) {
    const usd = bestUsd(card)
    const eur = bestEur(card)
    const rank = usd ?? eur
    if (rank !== null && (!best || rank > best.rank)) best = { card, usd, eur, rank }
  }
  return best && { card: best.card, usd: best.usd, eur: best.eur }
}

export const isPromoSet = (card: Card) => /promo/i.test(card.set.series) || /promo/i.test(card.set.name)

export function isSecretRare(card: Card): boolean {
  const printed = card.set.printedTotal
  const n = Number.parseInt(card.number, 10)
  return printed !== undefined && /^\d+$/.test(card.number) && n > printed
}

/** Smart-set filtering, applied client-side after the API query. */
export function applyExclusions(cards: Card[], ex: Exclusions | null | undefined): Card[] {
  if (!ex) return cards
  return cards.filter((card) => {
    if (ex.promos && isPromoSet(card)) return false
    if (ex.beforeYear && parseReleaseDate(card.set.releaseDate).getFullYear() < ex.beforeYear) return false
    if (ex.secretRares && isSecretRare(card)) return false
    if (ex.trainers && card.supertype === 'Trainer') return false
    return true
  })
}

/** Cards in a grid order: set release (newest first), then card number. */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.set.id !== b.set.id) return b.set.releaseDate.localeCompare(a.set.releaseDate) || a.set.id.localeCompare(b.set.id)
    return compareNumbers(a.number, b.number)
  })
}

export function compareNumbers(a: string, b: string): number {
  const na = Number.parseInt(a.replace(/^\D+/, ''), 10)
  const nb = Number.parseInt(b.replace(/^\D+/, ''), 10)
  const pa = a.match(/^\D*/)?.[0] ?? ''
  const pb = b.match(/^\D*/)?.[0] ?? ''
  if (pa !== pb) return pa.localeCompare(pb)
  if (na !== nb && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b)
}

/** Totals for a daily value snapshot. */
export function snapshotTotals(items: CollectionItem[], cards: ReadonlyMap<string, Card>) {
  const value = itemsValue(items, cards)
  return {
    total_usd: value.usd,
    total_eur: value.eur,
    card_count: items.reduce((n, i) => n + i.quantity, 0),
  }
}

const round = (n: number) => Math.round(n * 100) / 100

export type RarityBucket = 'Commons' | 'Uncommons' | 'Rares' | 'Promos'

/** Copies owned in each rarity group, for the Home screen's split bar. */
export function rarityBuckets(items: CollectionItem[], cards: ReadonlyMap<string, Card>): Record<RarityBucket, number> {
  const out: Record<RarityBucket, number> = { Commons: 0, Uncommons: 0, Rares: 0, Promos: 0 }
  for (const i of items) {
    const card = cards.get(i.card_id)
    if (!card) continue
    const r = (card.rarity ?? '').toLowerCase()
    // Basic Energy and some trainers have no rarity; count them with commons.
    const bucket: RarityBucket = r === 'promo' || isPromoSet(card) ? 'Promos' : r === 'uncommon' ? 'Uncommons' : r === 'common' || !r ? 'Commons' : 'Rares'
    out[bucket] += i.quantity
  }
  return out
}

/**
 * What the missing cards would cost: the cheapest version of each, near mint, in the chosen
 * currency. Cards with no price at all are counted separately rather than treated as free.
 */
export function costToComplete(setCards: Card[], owned: ReadonlySet<string>, mode: CurrencyMode): { total: number; unpriced: number } {
  let total = 0
  let unpriced = 0
  for (const card of missingCards(setCards, owned)) {
    const prices = variantsFor(card)
      .map((v) => {
        const p = priceFor(card, v, 'near_mint')
        return inCurrency(mode, p?.usd, p?.eur)
      })
      .filter((n): n is number => n !== null)
    if (prices.length) total += Math.min(...prices)
    else unpriced++
  }
  return { total: round(total), unpriced }
}
