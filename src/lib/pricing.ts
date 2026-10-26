import { VARIANTS, type Card, type Variant } from './tcg'

export const CONDITIONS = ['near_mint', 'lightly_played', 'played', 'damaged'] as const
export type Condition = (typeof CONDITIONS)[number]

export const CONDITION_MULTIPLIER: Record<Condition, number> = {
  near_mint: 1.0,
  lightly_played: 0.85,
  played: 0.7,
  damaged: 0.5,
}

export const CONDITION_LABEL: Record<Condition, string> = {
  near_mint: 'Near mint',
  lightly_played: 'Lightly played',
  played: 'Played',
  damaged: 'Damaged',
}

export const VARIANT_LABEL: Record<Variant, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse',
  '1stEditionHolofoil': '1st Ed. Holo',
  '1stEditionNormal': '1st Edition',
}

/** Fixed rate for the "approx £" line. No exchange-rate API on purpose. */
export const EUR_TO_GBP = 0.85

export interface Price {
  usd: number | null
  eur: number | null
}

/** The API uses 0 (and sometimes null) to mean "no data". */
function real(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

export function usdFor(card: Card, variant: Variant): number | null {
  const prices = card.tcgplayer?.prices
  if (!prices) return null
  const own = prices[variant]
  const direct = real(own?.market) ?? real(own?.mid)
  if (direct !== null) return direct
  for (const v of VARIANTS) {
    const market = real(prices[v]?.market)
    if (market !== null) return market
  }
  return null
}

export function eurFor(card: Card, variant: Variant): number | null {
  const p = card.cardmarket?.prices
  if (!p) return null
  if (variant === 'reverseHolofoil') {
    const reverse = real(p.reverseHoloTrend)
    if (reverse !== null) return reverse
  }
  return real(p.trendPrice) ?? real(p.averageSellPrice)
}

/** Price of one copy. Null when neither market has data, so the UI shows "—", never $0. */
export function priceFor(card: Card, variant: Variant, condition: Condition): Price | null {
  const m = CONDITION_MULTIPLIER[condition]
  const usd = usdFor(card, variant)
  const eur = eurFor(card, variant)
  if (usd === null && eur === null) return null
  return { usd: usd === null ? null : round(usd * m), eur: eur === null ? null : round(eur * m) }
}

/** Variants to offer on the Add screen: the ones TCGplayer prices, else what TCGdex says exists, else the common three. */
export function variantsFor(card: Card): Variant[] {
  const priced = VARIANTS.filter((v) => card.tcgplayer?.prices?.[v])
  if (priced.length) return priced
  if (card.tcgdexVariants?.length) return card.tcgdexVariants
  return ['normal', 'holofoil', 'reverseHolofoil']
}

/** Highest market USD across variants; used for "priciest missing". */
export function bestUsd(card: Card): number | null {
  let best: number | null = null
  for (const v of VARIANTS) {
    const n = real(card.tcgplayer?.prices?.[v]?.market) ?? real(card.tcgplayer?.prices?.[v]?.mid)
    if (n !== null && (best === null || n > best)) best = n
  }
  return best
}

/** Highest Cardmarket figure for a card; the EUR counterpart of bestUsd. */
export function bestEur(card: Card): number | null {
  const p = card.cardmarket?.prices
  if (!p) return null
  const values = [p.trendPrice, p.reverseHoloTrend, p.averageSellPrice].map(real).filter((n): n is number => n !== null)
  return values.length ? Math.max(...values) : null
}

/**
 * One price for display. EUR mode shows euros; otherwise dollars, falling back to euros when
 * TCGplayer has nothing (common for new sets, which only TCGdex prices).
 */
export function displayPrice(mode: 'both' | 'usd' | 'eur', usd: number | null | undefined, eur: number | null | undefined): string {
  if (mode === 'eur') return fmtEur(eur)
  return usd != null ? fmtUsd(usd) : fmtEur(eur)
}

/** Slot for a future "recently sold" source (PriceCharting or similar). Always null for now. */
export function ebaySoldGbp(_card: Card): number | null {
  return null
}

const round = (n: number) => Math.round(n * 100) / 100

const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const eurFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export const fmtUsd = (n: number | null | undefined) => (n == null ? '—' : usdFmt.format(n))
export const fmtEur = (n: number | null | undefined) => (n == null ? '—' : eurFmt.format(n))
export const fmtGbp = (n: number | null | undefined) => (n == null ? '—' : gbpFmt.format(n))
export const eurToGbp = (n: number | null | undefined) => (n == null ? null : round(n * EUR_TO_GBP))
