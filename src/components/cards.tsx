import { useState } from 'react'
import { fmtUsd, priceFor, VARIANT_LABEL, bestUsd } from '../lib/pricing'
import type { CollectionItem } from '../lib/sets'
import type { Card } from '../lib/tcg'
import { tintGradient } from '../data/type-colors'

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
      {failed && <div className="absolute inset-0 grid place-items-center p-2 text-center text-[13px] font-semibold text-ink-2">{card.name}</div>}
    </div>
  )
}

/** A tile in a set grid. Owned tiles get badges and a price; missing ones fade behind a dashed border. */
export function CardTile({ card, items, onClick }: { card: Card; items: CollectionItem[]; onClick: () => void }) {
  const owned = items.length > 0
  if (!owned) {
    const usd = bestUsd(card)
    return (
      <button type="button" onClick={onClick} className="group flex flex-col gap-1.5 text-left" aria-label={`${card.name}, missing`}>
        <div className="rounded-[16px] border-2 border-dashed border-ink/20 p-1">
          <CardImage card={card} className="opacity-35 transition-opacity group-active:opacity-60" rounded={11} />
        </div>
        <div className="flex justify-between gap-1 px-0.5 text-[13px] font-semibold text-muted">
          <span>#{card.number}</span>
          <span>{fmtUsd(usd)}</span>
        </div>
      </button>
    )
  }
  const qty = items.reduce((n, i) => n + i.quantity, 0)
  const special = items.find((i) => i.variant !== 'normal')
  const usd = items.reduce((sum, i) => sum + (priceFor(card, i.variant, i.condition)?.usd ?? 0) * i.quantity, 0)
  return (
    <button type="button" onClick={onClick} className="flex flex-col gap-1.5 text-left transition-transform active:scale-[0.97]" aria-label={`${card.name}, owned ${qty}`}>
      <div className="relative">
        <CardImage card={card} style={{ boxShadow: '0 8px 20px rgba(21,23,43,0.16)' }} />
        {special && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-ink/85 px-2 py-0.5 text-[11px] font-bold text-white">
            {special.variant === 'reverseHolofoil' ? 'Reverse' : VARIANT_LABEL[special.variant]}
          </span>
        )}
        {qty > 1 && <span className="absolute top-1.5 right-1.5 rounded-full bg-white px-2 py-0.5 text-[12px] font-extrabold text-ink shadow">×{qty}</span>}
      </div>
      <div className="flex justify-between gap-1 px-0.5 text-[13px] font-semibold">
        <span className="text-ink-2">#{card.number}</span>
        <span>{usd > 0 ? fmtUsd(usd) : '—'}</span>
      </div>
    </button>
  )
}

export function Thumb({ card, width = 54 }: { card: Card; width?: number | string }) {
  return <CardImage card={card} className="shrink-0" style={{ width }} rounded={8} />
}
