import { describe, expect, it } from 'vitest'
import type { CollectionItem } from './sets'
import type { Card } from './tcg'
import { addPending, chosenCard, resolveScan, undoSteps, type TrayItem } from './tray'

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
  const snap = (tray: TrayItem[], cards: Card[]) => {
    const rid = id()
    return resolveScan(addPending(tray, rid, 'data:'), rid, cards)
  }

  it('shows a snap straight away, waiting to be recognised', () => {
    const tray = addPending([], 'p', 'data:photo')
    expect(tray[0]).toMatchObject({ id: 'p', pending: true, chosen: null, photo: 'data:photo' })
  })

  it('turns a sure snap into a picked row with its first version', () => {
    const tray = snap([], [card('a')])
    expect(tray).toHaveLength(1)
    expect(tray[0]).toMatchObject({ chosen: 'a', variant: 'holofoil', condition: 'near_mint', quantity: 1, pending: false })
    expect(chosenCard(tray[0])?.id).toBe('a')
  })

  it('bumps the quantity when the same card is snapped again', () => {
    const tray = snap(snap([], [card('a')]), [card('a')])
    expect(tray).toHaveLength(1)
    expect(tray[0].quantity).toBe(2)
  })

  it('keeps snaps in the order they were taken, even if recognised out of order', () => {
    let tray = addPending(addPending([], 'p1', ''), 'p2', '')
    tray = resolveScan(tray, 'p2', [card('b')])
    tray = resolveScan(tray, 'p1', [card('a')])
    expect(tray.map((t) => t.chosen)).toEqual(['a', 'b'])
  })

  it('makes an unsure snap a row to pick from, keeping the photo', () => {
    const tray = snap([], [card('a'), card('b')])
    expect(tray[0]).toMatchObject({ chosen: null, photo: 'data:' })
    expect(tray[0].options.map((c) => c.id)).toEqual(['a', 'b'])
    expect(chosenCard(tray[0])).toBeNull()
  })

  it('marks a snap that found nothing as failed', () => {
    expect(snap([], [])[0]).toMatchObject({ failed: true, pending: false })
  })

  it('ignores a result for a snap that was removed', () => {
    expect(resolveScan([], 'gone', [card('a')])).toEqual([])
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
