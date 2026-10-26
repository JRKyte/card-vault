// Hand-curated colour per official set (pokemontcg.io set id → hex).
// Add a line here to give a set its own colour; anything missing uses FALLBACK_SET_COLOR.
export const SET_COLORS: Record<string, string> = {
  sv7: '#0E9F8A', // Stellar Crown: teal
  sv3: '#E8542F', // Obsidian Flames: orange-red
  sv3pt5: '#F2B705', // 151: yellow
  sv2: '#7C4DDB', // Paldea Evolved: purple
  sv6pt5: '#3B6FD6', // Shrouded Fable: blue
}

export const FALLBACK_SET_COLOR = '#5B6480'

export const setColor = (setId: string | undefined) => (setId && SET_COLORS[setId]) || FALLBACK_SET_COLOR

/** The five swatches offered for custom sets. */
export const CUSTOM_SET_SWATCHES = [
  { name: 'Yellow', hex: '#F2B705' },
  { name: 'Teal', hex: '#0E9F8A' },
  { name: 'Orange-red', hex: '#E8542F' },
  { name: 'Purple', hex: '#7C4DDB' },
  { name: 'Blue', hex: '#3B6FD6' },
]
