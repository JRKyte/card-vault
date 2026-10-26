import { DEFAULT_PROFILE, useProfile } from './queries'
import { eurToGbp, fmtEur, fmtGbp, fmtUsd } from './pricing'

export type CurrencyMode = 'both' | 'usd' | 'eur'

export function useCurrencyMode(): CurrencyMode {
  return useProfile().data?.currency_display ?? DEFAULT_PROFILE.currency_display
}

/** The headline figure: USD unless the profile says EUR only. */
export const mainMoney = (mode: CurrencyMode, usd: number | null | undefined, eur: number | null | undefined) => (mode === 'eur' ? fmtEur(eur) : fmtUsd(usd))

/** The secondary line under a headline, or null when the profile shows one currency. */
export function secondaryMoney(mode: CurrencyMode, eur: number | null | undefined): string | null {
  if (mode === 'usd') return null
  if (mode === 'eur') return `approx ${fmtGbp(eurToGbp(eur))}`
  return `${fmtEur(eur)} · approx ${fmtGbp(eurToGbp(eur))}`
}
