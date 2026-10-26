import { useState } from 'react'
import { useCard } from '../lib/queries'
import type { Profile } from '../lib/store'

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

/** A card's art cropped into a circle, focused on the Pokémon near the top. */
export function CardCircle({ src, size, onError }: { src: string; size: number; onError?: () => void }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-full bg-white" style={{ width: size, height: size }}>
      <img src={src} alt="" className="h-full w-full" style={{ objectFit: 'cover', objectPosition: '50% 18%', transform: 'scale(1.9)', transformOrigin: '50% 22%' }} onError={onError} />
    </div>
  )
}

export function InitialsCircle({ name, size }: { name: string; size: number }) {
  return (
    <div className="grid shrink-0 place-items-center rounded-full bg-ink font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initialsOf(name)}
    </div>
  )
}

export function Avatar({ profile, size = 48 }: { profile: Profile; size?: number }) {
  const card = useCard(profile.avatar_mode === 'card' ? (profile.avatar_card_id ?? undefined) : undefined)
  const [failed, setFailed] = useState<string | null>(null)
  if (profile.avatar_mode === 'card' && card.data && failed !== card.data.id) {
    return <CardCircle src={card.data.images.small} size={size} onError={() => setFailed(card.data!.id)} />
  }
  return <InitialsCircle name={profile.display_name} size={size} />
}
