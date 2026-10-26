import { describe, expect, it } from 'vitest'
import { bestEur, displayPrice, priceFor, variantsFor } from './pricing'
import { priciestMissing } from './sets'
import type { Card, TcgSet } from './tcg'
import { guessTcgdexId, mapSetId, toCardmarket, toVariants } from './tcgdex'

const tcgdexSets = [
  { id: 'sv07', name: 'Stellar Crown' },
  { id: 'sv03.5', name: '151' },
  { id: 'me05', name: 'Pitch Black' },
  { id: 'swsh12.5', name: 'Crown Zenith' },
  { id: 'base1', name: 'Base Set' },
  { id: '30th', name: '30th Celebration' },
  { id: '30th-c', name: '30th Classic Collection' },
  { id: 'fut2020', name: 'Pokémon Futsal 2020' },
]

describe('TCGdex set mapping', () => {
  it('guesses ids from pokemontcg.io ids', () => {
    expect(guessTcgdexId('sv7')).toBe('sv07')
    expect(guessTcgdexId('sv3pt5')).toBe('sv03.5')
    expect(guessTcgdexId('me5')).toBe('me05')
    expect(guessTcgdexId('sv10')).toBe('sv10')
    expect(guessTcgdexId('swsh12pt5')).toBe('swsh12.5')
    expect(guessTcgdexId('base1')).toBe('base1')
  })

  it('maps by id, then by name, then by override', () => {
    expect(mapSetId({ id: 'sv7', name: 'Stellar Crown' }, tcgdexSets)).toBe('sv07')
    expect(mapSetId({ id: 'me55', name: '30th Celebration' }, tcgdexSets)).toBe('30th')
    expect(mapSetId({ id: 'me55c', name: '30th Celebration: Classic Collection' }, tcgdexSets)).toBe('30th-c')
    expect(mapSetId({ id: 'fut20', name: 'Pokémon Futsal Collection' }, tcgdexSets)).toBe('fut2020')
    expect(mapSetId({ id: 'xyz', name: 'Unknown' }, tcgdexSets)).toBeNull()
  })
})

describe('TCGdex Cardmarket prices', () => {
  it('maps plain figures to the main printing and -holo to reverse', () => {
    expect(toCardmarket({ updated: '2026-10-25T17:48:09Z', avg: 0.02, trend: 0.02, 'avg-holo': 0.06, 'trend-holo': 0.06 })).toEqual({
      updatedAt: '2026/10/25',
      prices: { trendPrice: 0.02, averageSellPrice: 0.02, reverseHoloTrend: 0.06 },
      source: 'tcgdex',
    })
  })

  it('treats empty blocks as no data', () => {
    expect(toCardmarket(null)).toBeNull()
    expect(toCardmarket({ avg: null, trend: 0, 'trend-holo': 0 })).toBeNull()
  })
})

const pitchBlack: TcgSet = { id: 'me5', name: 'Pitch Black', series: 'Mega Evolution', printedTotal: 84, total: 120, releaseDate: '2026/07/17', images: {} }
const euroOnly = (id: string, trend: number): Card => ({
  id,
  name: id,
  supertype: 'Pokémon',
  number: id.split('-')[1],
  images: { small: '', large: '' },
  set: pitchBlack,
  cardmarket: { prices: { trendPrice: trend } },
})

describe('TCGdex variants', () => {
  it('maps flags to variant keys', () => {
    expect(toVariants({ normal: true, holo: false, reverse: true, firstEdition: false })).toEqual(['normal', 'reverseHolofoil'])
    expect(toVariants({ holo: true, firstEdition: true })).toEqual(['holofoil', '1stEditionHolofoil'])
    expect(toVariants({})).toBeUndefined()
  })

  it('are offered when TCGplayer lists none', () => {
    const c = { ...euroOnly('me5-1', 0.02), tcgdexVariants: ['normal', 'reverseHolofoil'] as Card['tcgdexVariants'] }
    expect(variantsFor(c)).toEqual(['normal', 'reverseHolofoil'])
  })
})

describe('cards with only EUR prices', () => {
  const a = euroOnly('me5-1', 0.45)
  const b = euroOnly('me5-2', 3.2)

  it('price in EUR only', () => {
    expect(priceFor(a, 'holofoil', 'near_mint')).toEqual({ usd: null, eur: 0.45 })
    expect(bestEur(b)).toBe(3.2)
  })

  it('display falls back to EUR when there is no USD', () => {
    expect(displayPrice('both', null, 3.2)).toBe('€3.20')
    expect(displayPrice('usd', 1.5, 3.2)).toBe('$1.50')
    expect(displayPrice('eur', 1.5, null)).toBe('—')
  })

  it('still finds the priciest missing card', () => {
    expect(priciestMissing([a, b], new Set())).toEqual({ card: b, usd: null, eur: 3.2 })
  })
})
