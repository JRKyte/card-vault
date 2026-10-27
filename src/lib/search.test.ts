import { describe, expect, it } from 'vitest'
import { parseCodeNumber, setCodes, setsByCode } from './search'
import type { TcgSet } from './tcg'

describe('set code + number searches', () => {
  it('reads the common ways of typing a promo number', () => {
    expect(parseCodeNumber('MEP 101')).toEqual({ code: 'MEP', number: '101' })
    expect(parseCodeNumber('mep101')).toEqual({ code: 'MEP', number: '101' })
    expect(parseCodeNumber('MEP-029')).toEqual({ code: 'MEP', number: '29' })
    expect(parseCodeNumber('101 mep')).toEqual({ code: 'MEP', number: '101' })
    expect(parseCodeNumber('MEP EN 101')).toEqual({ code: 'MEP', number: '101' })
  })

  it('leaves names and slash numbers to the normal search', () => {
    expect(parseCodeNumber('pikachu')).toBeNull()
    expect(parseCodeNumber('charizard ex')).toBeNull()
    expect(parseCodeNumber('128/142')).toBeNull()
  })

  it('maps codes to sets, preferring the main set over sub-sets', () => {
    const set = (id: string, ptcgoCode: string) => ({ id, ptcgoCode, name: id, series: '', total: 1, releaseDate: '', images: {} }) as TcgSet
    const map = setsByCode([set('swsh11tg', 'LOR'), set('swsh11', 'LOR'), set('tcgdex:mep', 'MEP')])
    expect(map.get('LOR')?.id).toBe('swsh11')
    expect(map.get('MEP')?.id).toBe('tcgdex:mep')
  })
})

describe('printed set codes', () => {
  it('knows SV promos print SVP', () => {
    expect(setCodes({ ptcgoCode: 'PR-SV' })).toEqual(['PR-SV', 'SVP'])
    expect(setCodes({ ptcgoCode: 'mep' })).toEqual(['MEP'])
    expect(setCodes({})).toEqual([])
  })
})
