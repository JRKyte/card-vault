// Cardmarket (EUR) prices from TCGdex (https://tcgdex.dev). Free, no key, updated daily,
// and unlike pokemontcg.io it covers 2026 sets. It has no bulk price endpoint, so prices are
// fetched one card at a time and saved in the shared card cache for a day.
//
// pokemontcg.io stays the source for card data, images and USD prices. TCGdex uses its own set
// ids (sv07 vs sv7, sv03.5 vs sv3pt5), so we map between them.

import type { Card, CardmarketPrices, Variant } from './tcg'

const BASE = 'https://api.tcgdex.net/v2/en'
const MAX_CONCURRENT = 6

/** Sets whose ids and names both differ between the two APIs. */
const SET_OVERRIDES: Record<string, string> = {
  me55c: '30th-c',
  fut20: 'fut2020',
}

export interface TcgdexSet {
  id: string
  name: string
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** pokemontcg.io set id → the TCGdex id it most likely has: sv7 → sv07, sv3pt5 → sv03.5. */
export function guessTcgdexId(ptcgId: string): string {
  return ptcgId.replace('pt5', '.5').replace(/^(sv|me)(\d)(?!\d)/, (_, series: string, n: string) => `${series}0${n}`)
}

/** Map a pokemontcg.io set to a TCGdex set id: overrides, then id rules, then a unique name match. */
export function mapSetId(set: { id: string; name: string }, tcgdexSets: TcgdexSet[]): string | null {
  if (SET_OVERRIDES[set.id]) return SET_OVERRIDES[set.id]
  const ids = new Set(tcgdexSets.map((s) => s.id))
  const guess = guessTcgdexId(set.id)
  if (ids.has(guess)) return guess
  const byName = tcgdexSets.filter((s) => normName(s.name) === normName(set.name))
  return byName.length === 1 ? byName[0].id : null
}

interface TcgdexCardmarket {
  updated?: string
  avg?: number | null
  trend?: number | null
  'avg-holo'?: number | null
  'trend-holo'?: number | null
}

/**
 * TCGdex's Cardmarket block → the shape priceFor reads. Cardmarket's "-holo" figures are its
 * reverse-holo prices; the plain figures are the card's main printing.
 */
export function toCardmarket(cm: TcgdexCardmarket | null | undefined): Card['cardmarket'] | null {
  if (!cm) return null
  const prices: CardmarketPrices = {
    trendPrice: cm.trend ?? null,
    averageSellPrice: cm.avg ?? null,
    reverseHoloTrend: cm['trend-holo'] || cm['avg-holo'] || null,
  }
  if (!prices.trendPrice && !prices.averageSellPrice && !prices.reverseHoloTrend) return null
  return { updatedAt: cm.updated?.slice(0, 10).replace(/-/g, '/'), prices, source: 'tcgdex' }
}

interface TcgdexVariants {
  normal?: boolean
  holo?: boolean
  reverse?: boolean
  firstEdition?: boolean
}

/** TCGdex's variant flags → our variant keys (which match TCGplayer's). */
export function toVariants(v: TcgdexVariants | null | undefined): Variant[] | undefined {
  if (!v) return undefined
  const out: Variant[] = []
  if (v.normal) out.push('normal')
  if (v.holo) out.push('holofoil')
  if (v.reverse) out.push('reverseHolofoil')
  if (v.firstEdition) out.push(v.holo ? '1stEditionHolofoil' : '1stEditionNormal')
  return out.length ? out : undefined
}

let active = 0
const waiting: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  return withSlot(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(BASE + path)
        if (res.status === 404) return null
        if (res.ok) return (await res.json()) as T
      } catch {
        // Network blip; retry below.
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
    return null
  })
}

const SETS_KEY = 'tcgdex-sets'
const SETS_MAX_AGE = 3 * 24 * 60 * 60 * 1000
let setsPromise: Promise<TcgdexSet[]> | null = null

/** TCGdex's set list (one small request), kept on the device for a few days. */
function tcgdexSets(): Promise<TcgdexSet[]> {
  if (!setsPromise) {
    setsPromise = (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(SETS_KEY) ?? 'null') as { at: number; sets: TcgdexSet[] } | null
        if (saved && Date.now() - saved.at < SETS_MAX_AGE) return saved.sets
      } catch {
        // Nothing saved.
      }
      const sets = (await getJson<TcgdexSet[]>('/sets')) ?? []
      if (sets.length) {
        try {
          localStorage.setItem(SETS_KEY, JSON.stringify({ at: Date.now(), sets: sets.map(({ id, name }) => ({ id, name })) }))
        } catch {
          // Storage full; fine.
        }
      } else setsPromise = null // try again next time
      return sets
    })()
  }
  return setsPromise
}

/**
 * Replace each card's Cardmarket prices with TCGdex's fresher ones. Cards TCGdex can't match keep
 * whatever pokemontcg.io had. Never throws: prices are a bonus, not a reason to fail a load.
 */
export async function withTcgdexPrices(cards: Card[]): Promise<Card[]> {
  if (!cards.length) return cards
  let sets: TcgdexSet[]
  try {
    sets = await tcgdexSets()
  } catch {
    return cards
  }
  if (!sets.length) return cards
  const setIds = new Map<string, string | null>()
  return Promise.all(
    cards.map(async (card) => {
      if (!setIds.has(card.set.id)) setIds.set(card.set.id, mapSetId(card.set, sets))
      const tid = setIds.get(card.set.id)
      if (!tid) return card
      const data = await getJson<{ pricing?: { cardmarket?: TcgdexCardmarket | null }; variants?: TcgdexVariants }>(
        `/sets/${encodeURIComponent(tid)}/${encodeURIComponent(card.number)}`,
      )
      if (!data) return card
      const cm = toCardmarket(data.pricing?.cardmarket)
      const variants = toVariants(data.variants)
      return { ...card, ...(cm && { cardmarket: cm }), ...(variants && { tcgdexVariants: variants }) }
    }),
  )
}

const SERIES_KEY = 'tcgdex-series'
const SERIES_MAX_AGE = 7 * 24 * 60 * 60 * 1000

/** Series name (normalised) → logo URL, e.g. "swordshield" → …/swsh/swsh1/logo.webp. */
export async function seriesLogos(): Promise<Record<string, string>> {
  try {
    const saved = JSON.parse(localStorage.getItem(SERIES_KEY) ?? 'null') as { at: number; logos: Record<string, string> } | null
    if (saved && Date.now() - saved.at < SERIES_MAX_AGE) return saved.logos
  } catch {
    // Nothing saved.
  }
  const series = (await getJson<{ name: string; logo?: string }[]>('/series')) ?? []
  const logos: Record<string, string> = {}
  for (const s of series) if (s.logo) logos[normName(s.name)] = `${s.logo}.webp`
  if (series.length) {
    try {
      localStorage.setItem(SERIES_KEY, JSON.stringify({ at: Date.now(), logos }))
    } catch {
      // Storage full; fine.
    }
  }
  return logos
}

export const seriesLogoFor = (logos: Record<string, string> | undefined, series: string) => logos?.[normName(series)]
