import { useState } from 'react'
import { useCurrencyMode } from '../lib/money'
import { bestEur, bestUsd, displayPrice, priceFor, VARIANT_LABEL } from '../lib/pricing'
import type { CollectionItem } from '../lib/sets'
import type { Card } from '../lib/tcg'
import { tintGradient, typeAccent } from '../data/type-colors'
import { IconPlus } from './icons'
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
/** A tile in a set grid, with an optional "+" for adding it without opening the card screen. */
export function CardTile({ card, items, onClick, onQuickAdd }: { card: Card; items: CollectionItem[]; onClick: () => void; onQuickAdd?: () => void }) {
  return (
    <div className="relative">
      <TileBody card={card} items={items} onClick={onClick} />
      {onQuickAdd && (
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label={`Quick add ${card.name}`}
          // Sits over the art's bottom-right corner; the number/price row below is ~30px tall.
          className="absolute right-2 bottom-[34px] grid h-8 w-8 place-items-center rounded-full text-white transition-transform active:scale-90"
          style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 0 0 1px rgba(196,181,253,.5), 0 0 16px rgba(139,92,246,.7)' }}
        >
          <IconPlus size={16} strokeWidth={2.6} />
        </button>
      )}
    </div>
  )
}

function TileBody({ card, items, onClick }: { card: Card; items: CollectionItem[]; onClick: () => void }) {
  const mode = useCurrencyMode()
  const owned = items.length > 0
  if (!owned) {
    return (
      <button type="button" onClick={onClick} className="group flex w-full flex-col gap-1.5 text-left" aria-label={`${card.name}, missing`}>
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
      className="flex w-full flex-col gap-1.5 text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97]"
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
