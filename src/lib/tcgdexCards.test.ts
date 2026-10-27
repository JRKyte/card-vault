import { describe, expect, it } from 'vitest'
import { priceFor, variantsFor } from './pricing'
import { toCard, toTcgSet, type TdCard } from './tcgdexCards'

const mepSet = toTcgSet({
  id: 'mep',
  name: 'MEP Black Star Promos',
  releaseDate: '2025-09-26',
  abbreviation: { official: 'MEP' },
  serie: { id: 'me', name: 'Mega Evolution' },
  cardCount: { official: 0, total: 112 },
})

const nidorina: TdCard = {
  id: 'mep-101',
  localId: '101',
  name: 'Nidorina',
  category: 'Pokemon',
  hp: 90,
  types: ['Darkness'],
  stage: 'Stage1',
  rarity: 'Promo',
  variants: { holo: true },
  set: { id: 'mep' },
  pricing: { cardmarket: { updated: '2026-10-26T17:48:08Z', avg: 6.43, trend: 4.49 }, tcgplayer: null },
}

describe('TCGdex-only sets and cards', () => {
  it('shapes a set to join its pokemontcg.io series', () => {
    expect(mepSet).toMatchObject({ id: 'tcgdex:mep', series: 'Mega Evolution', total: 112, printedTotal: undefined, releaseDate: '2025/09/26', ptcgoCode: 'MEP' })
    expect(toTcgSet({ id: '2024sv', name: "McDonald's Collection 2024", serie: { id: 'mc', name: "McDonald's Collection" } }).series).toBe('Other')
  })

  it('shapes a card with prices, versions and a Scrydex image', () => {
    const card = toCard(nidorina, mepSet)
    expect(card).toMatchObject({
      id: 'tcgdex:mep-101',
      name: 'Nidorina',
      supertype: 'Pokémon',
      subtypes: ['Stage 1'],
      hp: '90',
      number: '101',
      images: { small: 'https://images.scrydex.com/pokemon/mep-101/small', large: 'https://images.scrydex.com/pokemon/mep-101/large' },
    })
    expect(variantsFor(card)).toEqual(['holofoil'])
    expect(priceFor(card, 'holofoil', 'near_mint')).toEqual({ usd: null, eur: 4.49 })
  })

  it('drops leading zeros from the number, as Scrydex does', () => {
    expect(toCard({ ...nidorina, id: 'mep-029', localId: '029' }, mepSet).images.large).toBe('https://images.scrydex.com/pokemon/mep-29/large')
  })

  it('uses TCGdex images when it has them, and none when nobody does', () => {
    expect(toCard({ ...nidorina, set: { id: 'wp' }, image: 'https://assets.tcgdex.net/en/misc/wp/1' }, mepSet).images.small).toBe('https://assets.tcgdex.net/en/misc/wp/1/low.webp')
    expect(toCard({ ...nidorina, set: { id: 'mfb' } }, mepSet).images.small).toBe('')
  })
})
