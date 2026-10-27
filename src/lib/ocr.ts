// On-device text recognition for the card scanner (Tesseract.js). Loaded only when the scanner
// opens; the engine and English data (~10MB) download once and are cached after that.

import type { PSM, Worker } from 'tesseract.js'
import { cardCandidates, steadyNumber, strongCandidates, type CardText } from './scan'

let workerPromise: Promise<Worker> | null = null

/** Start loading the recogniser early (when the scanner opens) so the first scan is quicker. */
export function warmUpOcr(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('eng')
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

type Pass = { invert: boolean; binarize: boolean; whitelist: boolean }
type Region = 'left' | 'right' | 'all'

// Modern cards print the number bottom-left, older ones bottom-right; reading half the strip keeps
// the attack and flavour text out of the way. Tried in order until one reads confidently; each
// attempt takes about a second.
// Inverted reads catch the set code, which modern cards print white-on-dark ("MEP EN").
const ATTEMPTS: [Region, Pass][] = [
  ['left', { invert: false, binarize: false, whitelist: true }],
  ['left', { invert: true, binarize: false, whitelist: true }],
  ['left', { invert: false, binarize: true, whitelist: false }],
  ['right', { invert: false, binarize: false, whitelist: true }],
  ['all', { invert: false, binarize: false, whitelist: true }],
  ['right', { invert: false, binarize: true, whitelist: false }],
]

function cropRegion(strip: HTMLCanvasElement, region: Region): HTMLCanvasElement {
  if (region === 'all') return strip
  const w = Math.round(strip.width * 0.5)
  const out = document.createElement('canvas')
  out.width = w
  out.height = strip.height
  out.getContext('2d')!.drawImage(strip, region === 'left' ? 0 : strip.width - w, 0, w, strip.height, 0, 0, w, strip.height)
  return out
}

/**
 * Scale up, greyscale and stretch the contrast so small printed text reads well. `invert` flips
 * light-on-dark text (full-art cards); `binarize` goes fully black and white (Otsu threshold).
 */
export function prepareStrip(source: HTMLCanvasElement, { invert, binarize }: Pick<Pass, 'invert' | 'binarize'>): HTMLCanvasElement {
  const scale = Math.max(1, 2000 / source.width)
  const out = document.createElement('canvas')
  out.width = Math.round(source.width * scale)
  out.height = Math.round(source.height * scale)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  const grey = new Uint8ClampedArray(d.length / 4)
  let min = 255
  let max = 0
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
    grey[j] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let j = 0; j < grey.length; j++) grey[j] = ((grey[j] - min) / range) * 255
  const threshold = binarize ? otsu(grey) : -1
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = threshold >= 0 ? (grey[j] > threshold ? 255 : 0) : grey[j]
    if (invert) v = 255 - v
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/** The grey level that best splits the image into ink and paper. */
function otsu(grey: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0)
  for (const g of grey) hist[g]++
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let weightB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    weightB += hist[t]
    if (!weightB) continue
    const weightF = grey.length - weightB
    if (!weightF) break
    sumB += t * hist[t]
    const between = weightB * weightF * (sumB / weightB - (sum - sumB) / weightF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

export interface StripRead {
  text: string
  candidates: CardText[]
  /**
   * A clean read, a promo code, or several attempts agreeing. Rapid scan only acts on these, so
   * an empty frame or a blurry card never adds anything by itself.
   */
  confident: boolean
}

/**
 * Read the number line from a crop of the card's bottom strip. `knownTotals` (every set's printed
 * size) lets a misread slash still give the right number; `knownCodes` lets promo numbers through.
 * Confident readings win straight away; digit-run guesses are only used if nothing better turns up.
 */
export async function readStrip(
  strip: HTMLCanvasElement,
  knownTotals: ReadonlySet<number>,
  knownCodes: ReadonlySet<string>,
  /** Newest promo set codes, tried with a bare number when no code could be read. */
  promoFallback: string[] = [],
): Promise<StripRead> {
  const worker = await warmUpOcr()
  let lastText = ''
  const leftReads: string[] = []
  // How many attempts each pieced-together reading turned up in ("1287142" → 128/142).
  const guessed = new Map<string, { candidate: CardText; count: number; order: number }>()
  for (const [region, pass] of ATTEMPTS) {
    await worker.setParameters({
      tessedit_char_whitelist: pass.whitelist ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ' : '',
      tessedit_pageseg_mode: '11' as PSM, // PSM.SPARSE_TEXT: scattered bits of small print
    })
    const { data } = await worker.recognize(prepareStrip(cropRegion(strip, region), pass))
    lastText = data.text.replace(/\s+/g, ' ').trim()
    if (region === 'left') leftReads.push(lastText)
    const strong = strongCandidates(lastText, knownTotals, knownCodes)
    if (import.meta.env.DEV) console.debug('[scan]', region, JSON.stringify(pass), JSON.stringify(lastText), strong)
    if (strong.length) return { text: lastText, candidates: strong, confident: true }
    for (const candidate of cardCandidates(lastText, knownTotals, knownCodes)) {
      const key = `${candidate.number}/${candidate.total}`
      const seen = guessed.get(key)
      if (seen) seen.count++
      else guessed.set(key, { candidate, count: 1, order: guessed.size })
    }
  }
  // No confident read. Best next: a pieced-together number/total that several attempts agree on.
  const ranked = [...guessed.values()].sort((a, b) => b.count - a.count || a.order - b.order)
  const agreed = ranked.filter((g) => g.count >= 2).map((g) => g.candidate)
  if (agreed.length) return { text: lastText, candidates: agreed.slice(0, 3), confident: true }

  // Then a bare number the left-half reads agree on: most likely a promo whose white-on-dark set
  // code didn't read, so try it in the newest promo sets.
  const steady = steadyNumber(leftReads)
  if (steady && promoFallback.length) return { text: lastText, candidates: promoFallback.map((setCode) => ({ number: steady, total: null, setCode })), confident: false }

  // Last resort: one-off guesses.
  return { text: lastText, candidates: ranked.slice(0, 3).map((g) => g.candidate), confident: false }
}
