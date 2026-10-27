// On-device text recognition for the card scanner (Tesseract.js). Loaded only when the scanner
// opens; the engine and English data (~10MB) download once and are cached after that.

import type { PSM, Worker } from 'tesseract.js'
import { cardCandidates, type CardText } from './scan'

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

// Tried in order until one gives a real card number. Each pass takes about a second.
const PASSES: Pass[] = [
  { invert: false, binarize: false, whitelist: true },
  { invert: true, binarize: false, whitelist: true },
  { invert: false, binarize: true, whitelist: false },
]

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

/**
 * Read the number line from a crop of the card's bottom strip. `knownTotals` (every set's printed
 * size) lets a misread slash still give the right number.
 */
export async function readStrip(strip: HTMLCanvasElement, knownTotals: ReadonlySet<number>): Promise<{ text: string; candidates: CardText[] }> {
  const worker = await warmUpOcr()
  let lastText = ''
  for (const pass of PASSES) {
    await worker.setParameters({
      tessedit_char_whitelist: pass.whitelist ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ' : '',
      // Sparse text: the strip has scattered bits of small print.
      tessedit_pageseg_mode: '11' as PSM, // PSM.SPARSE_TEXT
    })
    const { data } = await worker.recognize(prepareStrip(strip, pass))
    lastText = data.text.replace(/\s+/g, ' ').trim()
    const candidates = cardCandidates(lastText, knownTotals)
    if (candidates.length) return { text: lastText, candidates }
  }
  return { text: lastText, candidates: [] }
}
