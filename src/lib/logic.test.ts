import { describe, expect, it } from 'vitest'
import { bestUsd, ebaySoldGbp, priceFor, variantsFor } from './pricing'
import {
  applyExclusions,
  itemsValue,
  priciestMissing,
  progress,
  rarityBuckets,
  setValue,
  snapshotTotals,
  type CollectionItem,
} from './sets'
import { searchQueryFor, type Card, type TcgSet } from './tcg'

const sv7: TcgSet = { id: 'sv7', name: 'Stellar Crown', series: 'Scarlet & Violet', printedTotal: 142, total: 175, releaseDate: '2024/09/13', images: {} }

function card(over: Partial<Card> & { id: string }): Card {
  return {
    name: 'Test',
    supertype: 'Pokémon',
    number: over.id.split('-')[1] ?? '1',
    images: { small: '', large: '' },
    set: sv7,
    ...over,
  }
}

const terapagos = card({
  id: 'sv7-128',
  tcgplayer: { prices: { holofoil: { low: 0.49, mid: 1.15, high: 50, market: 1.2 } } },
  cardmarket: { prices: { averageSellPrice: 1.38, trendPrice: 1.23, reverseHoloTrend: 0 } },
})

const item = (card_id: string, over: Partial<CollectionItem> = {}): CollectionItem => ({
  id: card_id,
  card_id,
  variant: 'holofoil',
  condition: 'near_mint',
  quantity: 1,
  created_at: '2026-10-01',
  ...over,
})

describe('priceFor', () => {
  it('uses the variant market price and the cardmarket trend', () => {
    expect(priceFor(terapagos, 'holofoil', 'near_mint')).toEqual({ usd: 1.2, eur: 1.23 })
  })

  it('falls back to mid when market is missing', () => {
    const c = card({ id: 'x-1', tcgplayer: { prices: { normal: { mid: 2 } } } })
    expect(priceFor(c, 'normal', 'near_mint')).toEqual({ usd: 2, eur: null })
  })

  it("falls back to another variant's market", () => {
    expect(priceFor(terapagos, 'reverseHolofoil', 'near_mint')?.usd).toBe(1.2)
  })

  it('uses reverseHoloTrend for reverse holos, ignoring zeros', () => {
    const c = card({ id: 'x-2', cardmarket: { prices: { trendPrice: 1, reverseHoloTrend: 3 } } })
    expect(priceFor(c, 'reverseHolofoil', 'near_mint')?.eur).toBe(3)
    expect(priceFor(terapagos, 'reverseHolofoil', 'near_mint')?.eur).toBe(1.23)
  })

  it('falls back to averageSellPrice when there is no trend', () => {
    const c = card({ id: 'x-3', cardmarket: { prices: { trendPrice: 0, averageSellPrice: 4 } } })
    expect(priceFor(c, 'normal', 'near_mint')?.eur).toBe(4)
  })

  it('applies the condition multiplier to both currencies', () => {
    expect(priceFor(terapagos, 'holofoil', 'played')).toEqual({ usd: 0.84, eur: 0.86 })
    expect(priceFor(terapagos, 'holofoil', 'damaged')).toEqual({ usd: 0.6, eur: 0.62 })
  })

  it('returns null when there is no data at all', () => {
    expect(priceFor(card({ id: 'me5-1', tcgplayer: {} }), 'normal', 'near_mint')).toBeNull()
  })
})

describe('variants and pricing helpers', () => {
  it('offers only priced variants, or common ones when none are priced', () => {
    expect(variantsFor(terapagos)).toEqual(['holofoil'])
    expect(variantsFor(card({ id: 'me5-1' }))).toEqual(['normal', 'holofoil', 'reverseHolofoil'])
  })

  it('finds the best USD price across variants', () => {
    const c = card({ id: 'x-4', tcgplayer: { prices: { normal: { market: 1 }, reverseHolofoil: { market: 5 } } } })
    expect(bestUsd(c)).toBe(5)
  })

  it('has no eBay source yet', () => {
    expect(ebaySoldGbp(terapagos)).toBeNull()
  })
})

describe('set progress and value', () => {
  const ids = ['sv7-1', 'sv7-2', 'sv7-3']

  it('intersects owned cards with the set', () => {
    expect(progress(ids, new Set(['sv7-1', 'sv3-9']))).toEqual({ owned: 1, total: 3, pct: 33, mastered: false })
  })

  it('marks a complete set as mastered', () => {
    expect(progress(ids, new Set(ids))).toMatchObject({ pct: 100, mastered: true })
  })

  it('never calls an empty set mastered', () => {
    expect(progress([], new Set())).toMatchObject({ pct: 0, mastered: false })
  })

  it('values owned cards in the set, counting quantity', () => {
    const cards = new Map([[terapagos.id, terapagos]])
    const items = [item('sv7-128', { quantity: 2 }), item('sv3-1')]
    expect(setValue(['sv7-128'], items, cards)).toEqual({ usd: 2.4, eur: 2.46, priced: true })
  })

  it('reports unpriced when nothing has a price', () => {
    const c = card({ id: 'me5-1' })
    expect(itemsValue([item('me5-1')], new Map([[c.id, c]]))).toEqual({ usd: 0, eur: 0, priced: false })
  })

  it('finds the priciest missing card', () => {
    const cheap = card({ id: 'sv7-1', tcgplayer: { prices: { normal: { market: 0.1 } } } })
    const pricey = card({ id: 'sv7-2', tcgplayer: { prices: { holofoil: { market: 30 } } } })
    expect(priciestMissing([cheap, pricey, terapagos], new Set(['sv7-2']))?.card.id).toBe('sv7-128')
    expect(priciestMissing([cheap, pricey], new Set())?.usd).toBe(30)
  })
})

describe('smart set exclusions', () => {
  const promoSet: TcgSet = { ...sv7, id: 'svp', name: 'Scarlet & Violet Black Star Promos', series: 'Scarlet & Violet' }
  const old: TcgSet = { ...sv7, id: 'base1', name: 'Base', series: 'Base', releaseDate: '1999/01/09', printedTotal: 102 }
  const cards = [
    card({ id: 'sv7-25', name: 'Pikachu' }),
    card({ id: 'svp-1', name: 'Pikachu', set: promoSet }),
    card({ id: 'base1-58', name: 'Pikachu', set: old }),
    card({ id: 'sv7-160', name: 'Pikachu' }),
    card({ id: 'sv7-130', name: 'Pikachu Trainer', supertype: 'Trainer' }),
  ]
  const ids = (cs: Card[]) => cs.map((c) => c.id)

  it('keeps everything with no exclusions', () => {
    expect(applyExclusions(cards, {})).toHaveLength(5)
  })

  it('drops promos, old sets, secret rares and trainers', () => {
    expect(ids(applyExclusions(cards, { promos: true }))).not.toContain('svp-1')
    expect(ids(applyExclusions(cards, { beforeYear: 2020 }))).not.toContain('base1-58')
    expect(ids(applyExclusions(cards, { secretRares: true }))).not.toContain('sv7-160')
    expect(ids(applyExclusions(cards, { trainers: true }))).not.toContain('sv7-130')
    expect(ids(applyExclusions(cards, { promos: true, beforeYear: 2020, secretRares: true, trainers: true }))).toEqual(['sv7-25'])
  })

  it('does not treat lettered numbers as secret rares', () => {
    expect(applyExclusions([card({ id: 'sv7-TG01', number: 'TG01' })], { secretRares: true })).toHaveLength(1)
  })
})

describe('snapshot totals', () => {
  it('sums value and copies', () => {
    const cards = new Map([[terapagos.id, terapagos]])
    expect(snapshotTotals([item('sv7-128', { quantity: 3 }), item('me5-1')], cards)).toEqual({
      total_usd: 3.6,
      total_eur: 3.69,
      card_count: 4,
    })
  })
})

describe('search query', () => {
  it('builds name and number queries', () => {
    expect(searchQueryFor('pika')).toBe('name:pika*')
    expect(searchQueryFor('charizard ex')).toBe('name:"charizard ex*"')
    expect(searchQueryFor('128/142')).toBe('number:128 set.printedTotal:142')
    expect(searchQueryFor('128')).toBe('number:128')
    expect(searchQueryFor('7')).toBe('number:7')
    expect(searchQueryFor('p')).toBeNull()
  })
})

describe('rarity buckets', () => {
  it('groups copies by rarity, promos by set', () => {
    const promo: TcgSet = { ...sv7, id: 'svp', name: 'SV Black Star Promos' }
    const cards = new Map<string, Card>([
      ['a', card({ id: 'a', rarity: 'Common' })],
      ['b', card({ id: 'b', rarity: 'Uncommon' })],
      ['c', card({ id: 'c', rarity: 'Illustration Rare' })],
      ['d', card({ id: 'd', rarity: 'Rare', set: promo })],
      ['e', card({ id: 'e' })],
    ])
    expect(rarityBuckets([item('a', { quantity: 2 }), item('b'), item('c'), item('d'), item('e')], cards)).toEqual({ Commons: 3, Uncommons: 1, Rares: 1, Promos: 1 })
  })
})
