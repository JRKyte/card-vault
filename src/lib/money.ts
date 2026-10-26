import { DEFAULT_PROFILE, useProfile } from './queries'
import { type CurrencyMode } from './pricing'
import type { Profile } from './store'

export type { CurrencyMode }

// The database's currency_display allows 'both' | 'usd' | 'eur'. Since the dark redesign, 'both'
// means "pounds" (approximate, from EUR), so no migration is needed.
export const fromStored = (v: Profile['currency_display']): CurrencyMode => (v === 'usd' || v === 'eur' ? v : 'gbp')
export const toStored = (m: CurrencyMode): Profile['currency_display'] => (m === 'gbp' ? 'both' : m)

export function useCurrencyMode(): CurrencyMode {
  return fromStored(useProfile().data?.currency_display ?? DEFAULT_PROFILE.currency_display)
}

export const CURRENCY_SYMBOL: Record<CurrencyMode, string> = { gbp: '£', usd: '$', eur: '€' }
