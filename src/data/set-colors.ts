// Colour per official set (pokemontcg.io set id → hex). These are bright "neon" colours that
// glow on the dark background. Sets without an entry get one from NEON_PALETTE, picked from
// the set id so a set always keeps the same colour. Add a line here to choose one yourself.
export const SET_COLORS: Record<string, string> = {
  me55: '#60a5fa', // 30th Celebration: blue
  me55c: '#93c5fd', // 30th Celebration: Classic Collection
  rsv10pt5: '#e2e8f0', // White Flare
  zsv10pt5: '#94a3b8', // Black Bolt
  sv10: '#f87171', // Destined Rivals: red
  sv9: '#34d399', // Journey Together: green
  me5: '#a855f7', // Pitch Black: purple
  me1: '#f472b6', // Mega Evolution: pink
  sv8pt5: '#c084fc', // Prismatic Evolutions
  sv8: '#facc15', // Surging Sparks
  sv7: '#2dd4bf', // Stellar Crown: teal
  sv6pt5: '#60a5fa', // Shrouded Fable
  sv3pt5: '#facc15', // 151: yellow
  sv3: '#fb923c', // Obsidian Flames: orange
  sv2: '#a78bfa', // Paldea Evolved: violet
}

/** Fallback colours, chosen per set id. */
export const NEON_PALETTE = ['#60a5fa', '#facc15', '#a855f7', '#f87171', '#34d399', '#f472b6', '#2dd4bf', '#fb923c']

function hash(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export const setColor = (setId: string | undefined) =>
  (setId && SET_COLORS[setId]) || (setId ? NEON_PALETTE[hash(setId) % NEON_PALETTE.length] : NEON_PALETTE[0])

/** The swatches offered for custom sets. */
export const CUSTOM_SET_SWATCHES = [
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Teal', hex: '#2dd4bf' },
  { name: 'Red', hex: '#f87171' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Blue', hex: '#60a5fa' },
  { name: 'Pink', hex: '#f472b6' },
]

// Custom sets made before the dark redesign stored the old, darker swatches.
const OLD_SWATCHES: Record<string, string> = {
  '#f2b705': '#facc15',
  '#0e9f8a': '#2dd4bf',
  '#e8542f': '#f87171',
  '#7c4ddb': '#a855f7',
  '#3b6fd6': '#60a5fa',
}

/** A custom set's colour, upgraded to the neon palette if it was saved with an old swatch. */
export const customColor = (hex: string) => OLD_SWATCHES[hex.toLowerCase()] ?? hex
