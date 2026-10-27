import { describe, expect, it } from 'vitest'
import { swapOptions } from './swaps'

describe('swap options', () => {
  it('pairs their spares I lack with my spares they lack', () => {
    const mine = [
      { card_id: 'a', quantity: 2 }, // spare, they don't have it → I can give
      { card_id: 'b', quantity: 3 }, // spare, but they have it → no
      { card_id: 'c', quantity: 1 }, // not spare
    ]
    const theirs = [
      { card_id: 'b', quantity: 1 },
      { card_id: 'x', quantity: 2 }, // spare, I don't have it → they can give
      { card_id: 'y', quantity: 4 }, // spare, I don't have it → they can give
      { card_id: 'c', quantity: 2 }, // spare, but I have it → no
    ]
    expect(swapOptions(mine, theirs)).toEqual({
      theyCanGive: [
        { card_id: 'x', quantity: 1 },
        { card_id: 'y', quantity: 3 },
      ],
      youCanGive: [{ card_id: 'a', quantity: 1 }],
      swaps: 1,
    })
  })

  it('counts every version of a card together', () => {
    const mine = [
      { card_id: 'a', quantity: 1 },
      { card_id: 'a', quantity: 1 },
    ]
    expect(swapOptions(mine, [{ card_id: 'z', quantity: 2 }]).youCanGive).toEqual([{ card_id: 'a', quantity: 1 }])
  })

  it('has no swaps when one side has nothing to offer', () => {
    expect(swapOptions([{ card_id: 'a', quantity: 2 }], [{ card_id: 'b', quantity: 1 }])).toMatchObject({ swaps: 0, theyCanGive: [] })
  })
})
