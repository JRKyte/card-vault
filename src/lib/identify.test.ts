import { describe, expect, it } from 'vitest'
import { identify, numberFits, SURE_MARGIN } from './identify'
import type { Card, TcgSet } from './tcg'

const scr: TcgSet = { id: 'sv7', name: 'Stellar Crown', series: 'Scarlet & Violet', printedTotal: 142, total: 175, releaseDate: '2024/09/13', ptcgoCode: 'SCR', images: {} }
const mep: TcgSet = { id: 'tcgdex:mep', name: 'MEP Black Star Promos', series: 'Mega Evolution', total: 120, releaseDate: '2025/09/26', ptcgoCode: 'MEP', images: {} }
const card = (id: string, number: string, set: TcgSet): Card => ({ id, name: id, supertype: 'Pokémon', number, set, images: { small: '', large: '' } })

const a = card('sv7-128', '128', scr)
const b = card('sv7-129', '129', scr)
const c = card('tcgdex:mep-029', '29', mep)
const cards = new Map([a, b, c].map((x) => [x.id, x]))

describe('numberFits', () => {
  it('matches number and printed total', () => {
    expect(numberFits(a, { number: '128', total: '142', setCode: null })).toBe(true)
    expect(numberFits(a, { number: '128', total: '143', setCode: null })).toBe(false)
  })
  it('ignores leading zeros and checks the set code', () => {
    expect(numberFits(c, { number: '029', total: null, setCode: 'MEP' })).toBe(true)
    expect(numberFits(c, { number: '29', total: null, setCode: 'SVP' })).toBe(false)
  })
})

describe('identify', () => {
  it('is sure when the best picture is well ahead', () => {
    const r = identify([{ id: 'sv7-128', score: 0.8 }, { id: 'sv7-129', score: 0.8 - SURE_MARGIN - 0.01 }], cards)
    expect(r).toEqual({ cards: [a, b], sure: true })
  })

  it('offers the closest pictures when they are close together', () => {
    const r = identify([{ id: 'sv7-128', score: 0.6 }, { id: 'sv7-129', score: 0.59 }, { id: 'tcgdex:mep-029', score: 0.58 }], cards)
    expect(r.sure).toBe(false)
    expect(r.cards.map((x) => x.id)).toEqual(['sv7-128', 'sv7-129', 'tcgdex:mep-029'])
  })

  it('lets a number reading pick between close pictures', () => {
    const r = identify([{ id: 'sv7-128', score: 0.6 }, { id: 'sv7-129', score: 0.59 }], cards, [{ number: '129', total: '142', setCode: null }])
    expect(r).toEqual({ cards: [b, a], sure: true })
  })

  it('ignores a number reading that fits none of the pictures', () => {
    const r = identify([{ id: 'sv7-128', score: 0.6 }, { id: 'sv7-129', score: 0.59 }], cards, [{ number: '5', total: '102', setCode: null }])
    expect(r.sure).toBe(false)
  })

  it('skips matches whose card details could not be loaded', () => {
    const r = identify([{ id: 'gone-1', score: 0.9 }, { id: 'sv7-128', score: 0.5 }], cards)
    expect(r.cards).toEqual([a])
    expect(r.sure).toBe(false)
  })
})
