// Colour helpers for washes, tints and progress fills.

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

/** Mix `hex` towards `into` by t (0 = hex, 1 = into). */
export function mix(hex: string, into: string, t: number): string {
  const a = parse(hex)
  const b = parse(into)
  return toHex(a.map((v, i) => v + (b[i] - v) * t))
}

/** Pull a colour towards grey so washes stay soft. */
export function desaturate(hex: string, amount: number): string {
  const [r, g, b] = parse(hex)
  const grey = 0.3 * r + 0.59 * g + 0.11 * b
  return toHex([r, g, b].map((v) => v + (grey - v) * amount))
}

export const alpha = (hex: string, a: number) => {
  const [r, g, b] = parse(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** A low-saturation base + blob pair for a screen washed in one hue. */
export function washFor(hex: string): { base: string; blob: string } {
  const soft = desaturate(hex, 0.35)
  return { base: mix(soft, '#F4F5F9', 0.9), blob: mix(soft, '#FFFFFF', 0.45) }
}

export const NEUTRAL_WASH = { base: '#F4F5F9', blob: '#D7DBE8' }
