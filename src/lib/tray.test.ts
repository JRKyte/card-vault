import { describe, expect, it } from 'vitest'
import type { CollectionItem } from './sets'
import type { Card } from './tcg'
import { addScan, chosenCard, undoSteps } from './tray'

const card = (id: string): Card => ({
  id,
  name: id,
  supertype: 'Pokémon',
  number: '1',
  images: { small: '', large: '' },
  set: { id: 'sv7', name: 'Stellar Crown', series: '', total: 175, releaseDate: '2024/09/13', images: {} },
  tcgplayer: { prices: { holofoil: { market: 1 } } },
})

let n = 0
const id = () => `t${++n}`

describe('scan tray', () => {
  it('adds a sure scan as a picked row with its first version', () => {
    const tray = addScan([], [card('a')], id)
    expect(tray).toHaveLength(1)
    expect(tray[0]).toMatchObject({ chosen: 'a', variant: 'holofoil', condition: 'near_mint', quantity: 1 })
    expect(chosenCard(tray[0])?.id).toBe('a')
  })

  it('bumps the quantity when the same card is scanned again', () => {
    const tray = addScan(addScan([], [card('a')], id), [card('a')], id)
    expect(tray).toHaveLength(1)
    expect(tray[0].quantity).toBe(2)
  })

  it('adds an unsure scan as a row to pick from', () => {
    const tray = addScan([], [card('a'), card('b')], id)
    expect(tray[0]).toMatchObject({ chosen: null })
    expect(tray[0].options.map((c) => c.id)).toEqual(['a', 'b'])
    expect(chosenCard(tray[0])).toBeNull()
  })

  it('ignores scans that found nothing', () => {
    expect(addScan([], [], id)).toEqual([])
  })
})

describe('undoing a batch', () => {
  const row = (rid: string, quantity: number) => ({ id: rid, card_id: rid, variant: 'normal', condition: 'near_mint', quantity, created_at: '' }) as CollectionItem

  it('reverses newest first, restoring merged rows step by step', () => {
    // Two adds into the same row (already had 1): 1 → 2 → 4; and a brand-new row.
    const steps = undoSteps([
      { row: row('x', 2), quantity: 1 },
      { row: row('y', 1), quantity: 1 },
      { row: row('x', 4), quantity: 2 },
    ])
    expect(steps).toEqual([
      { id: 'x', left: 2 },
      { id: 'y', left: 0 },
      { id: 'x', left: 1 },
    ])
  })
})
