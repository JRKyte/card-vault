import { useState } from 'react'
import { useCurrencyMode } from '../lib/money'
import { bestEur, bestUsd, displayPrice, priceFor, VARIANT_LABEL } from '../lib/pricing'
import type { CollectionItem } from '../lib/sets'
import type { Card } from '../lib/tcg'
import { tintGradient, typeAccent } from '../data/type-colors'
import { alpha } from '../lib/color'

/** Card art on a type-tinted gradient, which shows while the image loads. */
export function CardImage({
  card,
  size = 'small',
  className = '',
  style,
  rounded = 14,
}: {
  card: Pick<Card, 'images' | 'name' | 'types' | 'supertype'>
  size?: 'small' | 'large'
  className?: string
  style?: React.CSSProperties
  rounded?: number
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className={`relative aspect-[63/88] overflow-hidden ${className}`} style={{ background: tintGradient(card), borderRadius: rounded, ...style }}>
      {!failed && (
        <img
          src={card.images[size]}
          alt={card.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {failed && <div className="absolute inset-0 grid place-items-center p-2 text-center text-[12px] font-semibold text-mute">{card.name}</div>}
    </div>
  )
}

/** A tile in a set grid. Owned tiles get badges and a price; missing ones fade behind a dashed border. */
export function CardTile({ card, items, onClick }: { card: Card; items: CollectionItem[]; onClick: () => void }) {
  const mode = useCurrencyMode()
  const owned = items.length > 0
  if (!owned) {
    return (
      <button type="button" onClick={onClick} className="group flex flex-col gap-1.5 text-left" aria-label={`${card.name}, missing`}>
        <div className="rounded-[14px] border border-dashed border-white/15 p-1 transition-colors group-hover:border-accent/50">
          <CardImage card={card} className="opacity-35 transition-opacity group-hover:opacity-50 group-active:opacity-60" rounded={10} />
        </div>
        <div className="mono flex justify-between gap-1 px-0.5 text-[11px] font-medium text-mute">
          <span>#{card.number}</span>
          <span>{displayPrice(mode, bestUsd(card), bestEur(card))}</span>
        </div>
      </button>
    )
  }
  const qty = items.reduce((n, i) => n + i.quantity, 0)
  const accent = typeAccent(card)
  const glow = alpha(accent, 0.45)
  const glowSoft = alpha(accent, 0.18)
  const special = items.find((i) => i.variant !== 'normal')
  const prices = items.map((i) => ({ p: priceFor(card, i.variant, i.condition), q: i.quantity }))
  const sum = (key: 'usd' | 'eur') => (prices.some(({ p }) => p?.[key] != null) ? prices.reduce((n, { p, q }) => n + (p?.[key] ?? 0) * q, 0) : null)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97]"
      aria-label={`${card.name}, owned ${qty}`}
    >
      <div className="relative">
        <CardImage card={card} rounded={12} style={{ boxShadow: `0 0 0 1px ${glow}, 0 8px 24px rgba(0,0,0,.4), 0 0 22px ${glowSoft}` }} />
        {special && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-[#0b0912]/85 px-2 py-0.5 text-[10.5px] font-semibold text-accent-2 backdrop-blur-sm">
            {special.variant === 'reverseHolofoil' ? 'Reverse' : VARIANT_LABEL[special.variant]}
          </span>
        )}
        {qty > 1 && <span className="mono absolute top-1.5 right-1.5 rounded-full bg-sel px-2 py-0.5 text-[11px] font-semibold text-white" style={{ boxShadow: 'var(--sel-shadow)' }}>×{qty}</span>}
      </div>
      <div className="mono flex justify-between gap-1 px-0.5 text-[11px] font-medium">
        <span className="text-mute">#{card.number}</span>
        <span>{displayPrice(mode, sum('usd'), sum('eur'))}</span>
      </div>
    </button>
  )
}

export function Thumb({ card, width = 54 }: { card: Card; width?: number | string }) {
  return <CardImage card={card} className="shrink-0" style={{ width }} rounded={8} />
}
