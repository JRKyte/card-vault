// Card search across both sources: pokemontcg.io for most sets, TCGdex for the sets it lacks.

import { scanQuery, type CardText } from './scan'
import { sortCards } from './sets'
import { searchCards, searchQueryFor, type Card, type TcgSet } from './tcg'
import { isTcgdexId, tcgdexCardByNumber, tcgdexSearchByName } from './tcgdexCards'

/** "MEP 101", "mep101", "101 MEP", "MEP-101" → set code and number. */
export function parseCodeNumber(term: string): { code: string; number: string } | null {
  const t = term.trim()
  const m = t.match(/^([A-Za-z]{2,5})\s*[-#]?\s*(?:EN\s*)?0*(\d{1,3})$/) ?? t.match(/^#?0*(\d{1,3})\s+([A-Za-z]{2,5})$/)
  if (!m) return null
  const [code, number] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]]
  // A bare word like "pikachu" can't match: the code is at most 5 characters and needs a number.
  return { code: code.toUpperCase(), number }
}

/** pokemontcg.io's code for a set doesn't always match what's printed on the card. */
const PRINTED_ALIASES: Record<string, string> = { 'PR-SV': 'SVP' }

/** The codes a set is known by: its ptcgoCode and, where different, what the cards print. */
export function setCodes(set: Pick<TcgSet, 'ptcgoCode'>): string[] {
  const code = set.ptcgoCode?.toUpperCase()
  if (!code) return []
  return PRINTED_ALIASES[code] ? [code, PRINTED_ALIASES[code]] : [code]
}

/** Sets by their printed code. Sub-sets share codes, so the shortest id wins. */
export function setsByCode(sets: TcgSet[]): Map<string, TcgSet> {
  const map = new Map<string, TcgSet>()
  for (const s of sets) {
    for (const code of setCodes(s)) if (!map.has(code) || s.id.length < map.get(code)!.id.length) map.set(code, s)
  }
  return map
}

async function byCodeAndNumber(set: TcgSet, number: string): Promise<Card[]> {
  if (isTcgdexId(set.id)) {
    const card = await tcgdexCardByNumber(set.id, number)
    return card ? [card] : []
  }
  return (await searchCards(`set.id:${set.id} number:${number}`, { pageSize: 10 })).data
}

/** The Add screen's search. */
export async function searchEverything(term: string, sets: TcgSet[]): Promise<{ data: Card[]; totalCount: number }> {
  const coded = parseCodeNumber(term)
  const set = coded && setsByCode(sets).get(coded.code)
  if (coded && set) {
    const data = await byCodeAndNumber(set, coded.number)
    return { data, totalCount: data.length }
  }

  const q = searchQueryFor(term)
  if (!q) return { data: [], totalCount: 0 }
  const extraIds = sets.filter((s) => isTcgdexId(s.id)).map((s) => s.id)
  const byName = q.startsWith('name:')
  const [ptcg, extra] = await Promise.all([
    searchCards(q, { pageSize: 60 }),
    // Name searches also look in the TCGdex-only sets; a TCGdex hiccup just means fewer results.
    byName && extraIds.length ? tcgdexSearchByName(term.trim(), extraIds).catch(() => [] as Card[]) : Promise.resolve([] as Card[]),
  ])
  return { data: sortCards([...extra, ...ptcg.data]), totalCount: ptcg.totalCount + extra.length }
}

/** Cards for a scanned reading: by set code when known (either source), else by number/total. */
export async function findByNumber(read: CardText, sets: TcgSet[]): Promise<Card[]> {
  const byCode = setsByCode(sets)
  const set = read.setCode ? byCode.get(read.setCode) : undefined
  if (set && isTcgdexId(set.id)) return byCodeAndNumber(set, read.number)
  const query = scanQuery(read, (code) => byCode.get(code.toUpperCase())?.id ?? null)
  return (await searchCards(query, { pageSize: 30 })).data
}
