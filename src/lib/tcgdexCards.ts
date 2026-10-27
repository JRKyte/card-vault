// Cards and sets that pokemontcg.io doesn't have (e.g. the MEP Black Star Promos), loaded from
// TCGdex and reshaped into the same Card / TcgSet types the rest of the app uses.
//
// Their ids carry a "tcgdex:" prefix ("tcgdex:mep-101", set "tcgdex:mep") so the app knows where
// to load them from, and so they can never clash with a pokemontcg.io id.

import type { Card, TcgSet, Variant } from './tcg'
import { getJson, mapSetId, tcgdexSets, toCardmarket, toVariants, type TcgdexCardmarket, type TcgdexVariants } from './tcgdex'

export const TCGDEX_PREFIX = 'tcgdex:'
export const isTcgdexId = (id: string) => id.startsWith(TCGDEX_PREFIX)
const strip = (id: string) => id.slice(TCGDEX_PREFIX.length)

/** TCGdex has no images for some newer sets; Scrydex (which pokemontcg.io uses) does, unpadded. */
const SCRYDEX_SETS: Record<string, string> = { mep: 'mep', mee: 'mee', '2023sv': 'mcd23', '2024sv': 'mcd24' }

/** Match pokemontcg.io's series names so these sets join the right series on the Sets tab. */
const SERIES_NAMES: Record<string, string> = { Miscellaneous: 'Other', "McDonald's Collection": 'Other', 'Trainer kits': 'Trainer Kits' }

/** Not physical cards you'd collect: TCG Pocket (digital), jumbo cards, samples. */
const SKIP_SETS = new Set(['jumbo', 'sp'])
const isPocket = (id: string) => /^(A\d|B\d|P-[AB])/.test(id)

interface TdSet {
  id: string
  name: string
  releaseDate?: string
  abbreviation?: { official?: string }
  serie?: { id: string; name: string }
  cardCount?: { official?: number; total?: number }
  logo?: string
  symbol?: string
  cards?: { id: string; localId: string; name: string }[]
}

interface TdPrice {
  lowPrice?: number | null
  midPrice?: number | null
  highPrice?: number | null
  marketPrice?: number | null
}

export interface TdCard {
  id: string
  localId: string
  name: string
  category?: string
  image?: string
  hp?: number
  types?: string[]
  stage?: string
  suffix?: string
  trainerType?: string
  energyType?: string
  rarity?: string
  variants?: TcgdexVariants
  set: { id: string }
  pricing?: { cardmarket?: TcgdexCardmarket | null; tcgplayer?: Record<string, TdPrice | string> | null }
}

export function toTcgSet(s: TdSet): TcgSet {
  const series = s.serie?.name ?? 'Other'
  return {
    id: TCGDEX_PREFIX + s.id,
    name: s.name,
    series: SERIES_NAMES[series] ?? series,
    printedTotal: s.cardCount?.official || undefined,
    total: s.cardCount?.total ?? s.cards?.length ?? 0,
    releaseDate: (s.releaseDate ?? '').replace(/-/g, '/'),
    ptcgoCode: s.abbreviation?.official,
    images: { symbol: s.symbol ? `${s.symbol}.png` : undefined, logo: s.logo ? `${s.logo}.png` : undefined },
  }
}

const TCGPLAYER_VARIANTS: Record<string, Variant> = {
  normal: 'normal',
  holofoil: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  '1st-edition-holofoil': '1stEditionHolofoil',
  '1st-edition': '1stEditionNormal',
}

const stageLabel = (stage: string) => stage.replace(/^Stage(\d)$/, 'Stage $1')

/** A TCGdex card in the app's Card shape. */
export function toCard(d: TdCard, set: TcgSet): Card {
  const tdSetId = d.set.id
  const number = /^\d+$/.test(d.localId) ? String(Number(d.localId)) : d.localId
  const scrydex = SCRYDEX_SETS[tdSetId]
  const images = d.image
    ? { small: `${d.image}/low.webp`, large: `${d.image}/high.webp` }
    : scrydex
      ? { small: `https://images.scrydex.com/pokemon/${scrydex}-${number}/small`, large: `https://images.scrydex.com/pokemon/${scrydex}-${number}/large` }
      : { small: '', large: '' }

  const prices: Partial<Record<Variant, { low?: number | null; mid?: number | null; high?: number | null; market?: number | null }>> = {}
  for (const [key, value] of Object.entries(d.pricing?.tcgplayer ?? {})) {
    const variant = TCGPLAYER_VARIANTS[key]
    if (variant && typeof value === 'object') prices[variant] = { low: value.lowPrice, mid: value.midPrice, high: value.highPrice, market: value.marketPrice }
  }

  return {
    id: TCGDEX_PREFIX + d.id,
    name: d.name,
    supertype: d.category === 'Pokemon' ? 'Pokémon' : (d.category ?? 'Pokémon'),
    subtypes: [d.stage && stageLabel(d.stage), d.suffix, d.trainerType, d.energyType && `${d.energyType} Energy`].filter((x): x is string => !!x),
    hp: d.hp ? String(d.hp) : undefined,
    types: d.types,
    number,
    rarity: d.rarity,
    images,
    set,
    tcgplayer: Object.keys(prices).length ? { prices } : undefined,
    cardmarket: toCardmarket(d.pricing?.cardmarket) ?? undefined,
    tcgdexVariants: toVariants(d.variants),
  }
}

// Set details (series, release date, card list) are needed to shape cards; fetch each once.
const setDetails = new Map<string, Promise<TdSet | null>>()
function setDetail(tdSetId: string): Promise<TdSet | null> {
  if (!setDetails.has(tdSetId)) setDetails.set(tdSetId, getJson<TdSet>(`/sets/${encodeURIComponent(tdSetId)}`))
  return setDetails.get(tdSetId)!
}

/** The physical sets TCGdex has that pokemontcg.io doesn't, as TcgSets. */
export async function extraSets(ptcgSets: TcgSet[]): Promise<TcgSet[]> {
  const all = await tcgdexSets()
  const covered = new Set(ptcgSets.map((s) => mapSetId(s, all)).filter((id): id is string => !!id))
  const missing = all.filter((s) => !covered.has(s.id) && !SKIP_SETS.has(s.id) && !isPocket(s.id))
  const details = await Promise.all(missing.map((s) => setDetail(s.id)))
  return details.filter((d): d is TdSet => !!d && d.serie?.id !== 'tcgp' && (d.cards?.length ?? 0) > 0).map(toTcgSet)
}

/** One card by its app id ("tcgdex:mep-101"). */
export async function tcgdexCard(id: string): Promise<Card | null> {
  const d = await getJson<TdCard>(`/cards/${encodeURIComponent(strip(id))}`)
  if (!d) return null
  const set = await setDetail(d.set.id)
  return set ? toCard(d, toTcgSet(set)) : null
}

export async function tcgdexCards(ids: string[]): Promise<Card[]> {
  return (await Promise.all(ids.map(tcgdexCard))).filter((c): c is Card => !!c)
}

/** Every card in a TCGdex-only set ("tcgdex:mep"). One request per card; cached for a day by the caller. */
export async function tcgdexSetCards(setId: string): Promise<Card[]> {
  const set = await setDetail(strip(setId))
  if (!set) throw new Error('Set not found')
  return tcgdexCards((set.cards ?? []).map((c) => TCGDEX_PREFIX + c.id))
}

/** A card by set and number, e.g. MEP 101. */
export async function tcgdexCardByNumber(setId: string, number: string): Promise<Card | null> {
  const tdSetId = strip(setId)
  const set = await setDetail(tdSetId)
  const hit = set?.cards?.find((c) => c.localId === number || (/^\d+$/.test(c.localId) && Number(c.localId) === Number(number)))
  return hit ? tcgdexCard(TCGDEX_PREFIX + hit.id) : null
}

/** Cards matching a name in the TCGdex-only sets (TCGdex matches names by "contains"). */
export async function tcgdexSearchByName(term: string, extraSetIds: string[], limit = 12): Promise<Card[]> {
  const sets = extraSetIds.map(strip)
  const hits = (await getJson<{ id: string }[]>(`/cards?name=${encodeURIComponent(term)}`)) ?? []
  const inExtra = hits.filter((h) => sets.some((s) => h.id.startsWith(`${s}-`))).slice(0, limit)
  return tcgdexCards(inExtra.map((h) => TCGDEX_PREFIX + h.id))
}
