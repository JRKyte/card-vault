import { describe, expect, it } from 'vitest'
import { cardCandidates, parseCardText, scanQuery, steadyNumber } from './scan'

describe('reading the number line', () => {
  it('reads set code, number and total from a modern card', () => {
    expect(parseCardText('Illus. 5ban Graphics H SCR EN 128/142 ★★')).toEqual({ number: '128', total: '142', setCode: 'SCR' })
    expect(parseCardText('G PBL EN 004/084')).toEqual({ number: '4', total: '84', setCode: 'PBL' })
  })

  it('reads older cards with no set code', () => {
    expect(parseCardText('4/102 ★')).toEqual({ number: '4', total: '102', setCode: null })
  })

  it('fixes letters read in place of digits', () => {
    expect(parseCardText('SCR EN 12B/l42')).toEqual({ number: '128', total: '142', setCode: 'SCR' })
    expect(parseCardText('O25 / 165')).toEqual({ number: '25', total: '165', setCode: null })
  })

  it('reads gallery numbers', () => {
    expect(parseCardText('LOR EN TG05/TG30')).toEqual({ number: 'TG05', total: null, setCode: 'LOR' })
    expect(parseCardText('GG 12 / GG 70')).toEqual({ number: 'GG12', total: null, setCode: null })
  })

  it('gives up when there is no number', () => {
    expect(parseCardText('Pikachu HP 70')).toBeNull()
    expect(parseCardText('')).toBeNull()
  })
})

describe('scan query', () => {
  const codes: Record<string, string> = { SCR: 'sv7', LOR: 'swsh11' }
  const lookup = (c: string) => codes[c] ?? null

  it('uses the set when the code is known', () => {
    expect(scanQuery({ number: '128', total: '142', setCode: 'SCR' }, lookup)).toBe('set.id:sv7 number:128')
  })

  it('includes gallery sub-sets', () => {
    expect(scanQuery({ number: 'TG05', total: null, setCode: 'LOR' }, lookup)).toBe('set.id:swsh11* number:TG05')
  })

  it('falls back to the printed total', () => {
    expect(scanQuery({ number: '4', total: '102', setCode: null }, lookup)).toBe('number:4 set.printedTotal:102')
    expect(scanQuery({ number: '4', total: '102', setCode: 'XXX' }, lookup)).toBe('number:4 set.printedTotal:102')
    expect(scanQuery({ number: 'TG05', total: null, setCode: null }, lookup)).toBe('number:TG05')
  })
})

describe('misread slashes', () => {
  const totals = new Set([102, 142, 165, 64, 30])

  it('recovers the number when the slash reads as a digit or goes missing', () => {
    expect(cardCandidates('yey 1287142 ~ So', totals)).toEqual([{ number: '128', total: '142', setCode: null }])
    expect(cardCandidates('ulF1287,142 ogy', totals)).toEqual([{ number: '128', total: '142', setCode: null }])
    expect(cardCandidates('GAMERREAK 1999 W 4102', totals)).toEqual([{ number: '4', total: '102', setCode: null }])
  })

  it('prefers a clean read whose total is a real set size', () => {
    expect(cardCandidates('SCR EN 128/142', totals)).toEqual([{ number: '128', total: '142', setCode: 'SCR' }])
  })

  it('ignores splits that do not land on a real set size', () => {
    expect(cardCandidates('LV76 #6', totals)).toEqual([])
  })
})

describe('copyright years', () => {
  it('ignores the copyright line and ranks a misread slash first', () => {
    expect(cardCandidates('LV76 6 1995969899 GAMEFREAK 1999 W 41102', new Set([99, 102]))).toEqual([
      { number: '4', total: '102', setCode: null },
      { number: '41', total: '102', setCode: null },
    ])
  })
})

describe('promo numbers', () => {
  const codes = new Set(['MEP', 'SVP', 'SCR'])

  it('reads a set code and bare number', () => {
    expect(cardCandidates('Illus. Taiga Kasai J MEP EN 101 ★', new Set([142]), codes)).toEqual([{ number: '101', total: null, setCode: 'MEP' }])
    expect(cardCandidates('I MEP EN O29', new Set(), codes)).toEqual([{ number: '29', total: null, setCode: 'MEP' }])
  })

  it('ignores codes that are not real sets', () => {
    expect(cardCandidates('HP 90 THE 101', new Set(), codes)).toEqual([])
  })
})

describe('steady number', () => {
  it('finds the number every read agrees on, preferring longer ones', () => {
    expect(steadyNumber(['I M T E 30 I U4 9 101 B 1 BC 026', '5 I H T 3 30 I RE 9 101 1 BC 26', 'Taigo 3 O04 9 101 # 4'])).toBe('101')
  })

  it('needs at least two reads to agree', () => {
    expect(steadyNumber(['MEP 101', 'nothing here'])).toBeNull()
  })
})

describe('promo numbers need a real digit', () => {
  it('does not read a lone letter as a number', () => {
    expect(cardCandidates('EX W M E 11/S 3 P 0 MEP G 75 SR', new Set(), new Set(['MEP']))).toEqual([])
  })
})
