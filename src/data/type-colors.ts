// Neon colour per card type: the card screen's glow, its chips and confetti.
// Lightning matches the design's yellow (#facc15 glow, #fde047 chip ink).
export const TYPE_ACCENTS: Record<string, string> = {
  Grass: '#4ade80',
  Fire: '#fb923c',
  Water: '#60a5fa',
  Lightning: '#facc15',
  Psychic: '#f472b6',
  Fighting: '#f59e0b',
  Darkness: '#a78bfa',
  Metal: '#cbd5e1',
  Fairy: '#f9a8d4',
  Dragon: '#818cf8',
  Colorless: '#e2e8f0',
  Trainer: '#a59fb8',
}

/** Trainers and Energy have no type; they share the neutral colour. */
export function primaryType(card: { types?: string[]; supertype?: string } | undefined): string {
  return card?.types?.[0] ?? 'Trainer'
}

export const typeAccent = (card: Parameters<typeof primaryType>[0]) => TYPE_ACCENTS[primaryType(card)] ?? TYPE_ACCENTS.Trainer

/** Placeholder behind card art while it loads: a dark wash of the type colour. */
export const tintGradient = (card: Parameters<typeof primaryType>[0]) => {
  const c = typeAccent(card)
  return `linear-gradient(160deg, color-mix(in srgb, ${c} 22%, #120d1f), color-mix(in srgb, ${c} 8%, #0b0912))`
}
