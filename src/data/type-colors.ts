// Two-stop tints per card type, used behind card art and as the card screen's wash.
export const TYPE_TINTS: Record<string, [string, string]> = {
  Grass: ['#DDF5D2', '#B6E6A3'],
  Fire: ['#FFE3B8', '#FFC58F'],
  Water: ['#D6EEFF', '#A9D6F7'],
  Lightning: ['#FFF3BF', '#FFE07A'],
  Psychic: ['#FFE0EE', '#F7BDD8'],
  Fighting: ['#F5E1D0', '#E2B894'],
  Darkness: ['#E3E3EA', '#B9BAC8'],
  Metal: ['#E9ECF2', '#C5CAD6'],
  Fairy: ['#FFE4F3', '#F6C0E3'],
  Dragon: ['#E6E0FF', '#C3B4F5'],
  Colorless: ['#EDE7FF', '#D3C6FA'],
  Trainer: ['#EEF0F6', '#D5D9E6'],
}

/** Stronger colour per type for chips, shadows and confetti. */
export const TYPE_ACCENTS: Record<string, string> = {
  Grass: '#3E9B3A',
  Fire: '#E8742F',
  Water: '#2F86D6',
  Lightning: '#D9A400',
  Psychic: '#C9488B',
  Fighting: '#B0662F',
  Darkness: '#4A4C63',
  Metal: '#6D7790',
  Fairy: '#D35BA8',
  Dragon: '#6A4FD0',
  Colorless: '#7E6CC4',
  Trainer: '#5B6480',
}

/** Trainers and Energy have no type; they share the neutral tint. */
export function primaryType(card: { types?: string[]; supertype?: string } | undefined): string {
  return card?.types?.[0] ?? 'Trainer'
}

export const typeTint = (card: Parameters<typeof primaryType>[0]) => TYPE_TINTS[primaryType(card)] ?? TYPE_TINTS.Trainer
export const typeAccent = (card: Parameters<typeof primaryType>[0]) => TYPE_ACCENTS[primaryType(card)] ?? TYPE_ACCENTS.Trainer
export const tintGradient = (card: Parameters<typeof primaryType>[0]) => {
  const [a, b] = typeTint(card)
  return `linear-gradient(160deg, ${a}, ${b})`
}
