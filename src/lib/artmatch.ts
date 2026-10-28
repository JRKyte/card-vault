// Recognise a card by its picture. Two small image models, run on the phone, each turn the
// camera's view of the card into a fingerprint, compared with fingerprints of every card made
// ahead of time by scripts/fingerprints. Their scores are averaged: they get different cards wrong,
// so together they're right more often. Free and no server: the models (~47MB) and fingerprints
// (~19MB) download the first time the scanner opens, and are cached after that.

import config from './artmatch-config.json'

export interface ArtMatch {
  id: string
  /** Average cosine similarity, roughly 0–1; mostly useful compared with the other matches. */
  score: number
}

interface ModelIndex {
  id: string
  dims: number
  vectors: Int8Array
}

interface Index {
  ids: string[]
  models: ModelIndex[]
}

type Embedder = (pixels: Uint8ClampedArray) => Promise<Float32Array>

let indexPromise: Promise<Index> | null = null
let embeddersPromise: Promise<Map<string, Embedder>> | null = null

function loadIndex(): Promise<Index> {
  indexPromise ??= (async () => {
    const base = `${import.meta.env.BASE_URL}fingerprints/`
    const res = await fetch(`${base}index.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`Fingerprints: ${res.status}`)
    const meta = (await res.json()) as { ids: string[]; models: { id: string; dims: number; file: string }[] }
    const models = await Promise.all(
      config.models.map(async ({ id }) => {
        const m = meta.models.find((x) => x.id === id)
        if (!m) throw new Error(`No fingerprints for ${id}`)
        const bin = await fetch(base + m.file)
        if (!bin.ok) throw new Error(`Fingerprints: ${bin.status}`)
        return { id, dims: m.dims, vectors: new Int8Array(await bin.arrayBuffer()) }
      }),
    )
    return { ids: meta.ids, models }
  })().catch((e) => {
    indexPromise = null
    throw e
  })
  return indexPromise
}

function loadEmbedders(): Promise<Map<string, Embedder>> {
  embeddersPromise ??= (async () => {
    const { env, pipeline, AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const image = (pixels: Uint8ClampedArray) => new RawImage(pixels, config.size, config.size, 3)
    // Same as scripts/fingerprints/embed.mjs: CLIP's image embedding, or the CLS token otherwise.
    const load = async ({ id, dtype }: { id: string; dtype: string }): Promise<Embedder> => {
      const options = { dtype: dtype as 'q8', device: 'wasm' as const }
      if (/clip/i.test(id)) {
        const [processor, vision] = await Promise.all([AutoProcessor.from_pretrained(id), CLIPVisionModelWithProjection.from_pretrained(id, options)])
        return async (pixels) => unit((await vision(await processor(image(pixels)))).image_embeds.data as Float32Array)
      }
      const extractor = await pipeline('image-feature-extraction', id, options)
      return async (pixels) => {
        const out = await extractor(image(pixels))
        return unit((out.data as Float32Array).slice(0, out.dims[2]))
      }
    }
    const embedders = await Promise.all(config.models.map(load))
    return new Map(config.models.map((m, i) => [m.id, embedders[i]]))
  })().catch((e) => {
    embeddersPromise = null
    throw e
  })
  return embeddersPromise
}

/** Start downloading the models and fingerprints as soon as the scanner opens. */
export function warmUpArt(): Promise<unknown> {
  return Promise.all([loadIndex(), loadEmbedders()])
}

function unit(v: Float32Array): Float32Array {
  let s = 0
  for (const x of v) s += x * x
  s = Math.sqrt(s) || 1
  return v.map((x) => x / s)
}

type Picture = CanvasImageSource & { width: number; height: number }

/**
 * Part of a picture (inset by a fraction on every side) as size×size RGB, squashed to fill like
 * the script does. Shrinks in halves first: one jump down from a 4K camera frame aliases badly.
 */
export function cardPixels(source: Picture, inset = 0): Uint8ClampedArray {
  const size = config.size
  let current: CanvasImageSource = source
  let x = source.width * inset
  let y = source.height * inset
  let w = source.width - 2 * x
  let h = source.height - 2 * y
  while (w / 2 >= size * 1.5 && h / 2 >= size * 1.5) {
    const half = document.createElement('canvas')
    half.width = Math.round(w / 2)
    half.height = Math.round(h / 2)
    const ctx = half.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(current, x, y, w, h, 0, 0, half.width, half.height)
    current = half
    x = y = 0
    w = half.width
    h = half.height
  }
  const out = document.createElement('canvas')
  out.width = out.height = size
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(current, x, y, w, h, 0, 0, size, size)
  const rgba = ctx.getImageData(0, 0, size, size).data
  const rgb = new Uint8ClampedArray(size * size * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]
    rgb[j + 1] = rgba[i + 1]
    rgb[j + 2] = rgba[i + 2]
  }
  return rgb
}

/** Every card's score: each model's cosine similarity to the query, averaged over the models. */
export function scoreAll(index: Index, queries: Map<string, Float32Array>): Float32Array {
  const scores = new Float32Array(index.ids.length)
  for (const { id, dims, vectors } of index.models) {
    const q = queries.get(id)!
    const weight = 1 / (127 * index.models.length)
    for (let i = 0, o = 0; i < scores.length; i++, o += dims) {
      let dot = 0
      for (let j = 0; j < dims; j++) dot += q[j] * vectors[o + j]
      scores[i] += dot * weight
    }
  }
  return scores
}

/** The k best scores, best first. */
export function topK(ids: string[], scores: Float32Array, k: number): ArtMatch[] {
  const best: ArtMatch[] = []
  for (let i = 0; i < scores.length; i++) {
    if (best.length < k || scores[i] > best[best.length - 1].score) {
      best.push({ id: ids[i], score: scores[i] })
      best.sort((a, b) => b.score - a.score)
      if (best.length > k) best.pop()
    }
  }
  return best
}

/**
 * The closest cards to the card in this picture (a crop of the card-shaped guide). `thorough`
 * also tries the picture slightly cropped, since nobody lines a card up exactly: about three
 * times slower, and noticeably better.
 */
export async function matchCard(source: Picture, k = 8, thorough = true): Promise<ArtMatch[]> {
  const [index, embedders] = await Promise.all([loadIndex(), loadEmbedders()])
  const framings = (thorough ? config.insets : [config.insets[1] ?? 0]).map((inset) => cardPixels(source, inset))
  const queries = new Map<string, Float32Array>()
  for (const [id, embed] of embedders) {
    const sum = new Float32Array(index.models.find((m) => m.id === id)!.dims)
    for (const pixels of framings) (await embed(pixels)).forEach((x, j) => (sum[j] += x))
    queries.set(id, unit(sum))
  }
  return topK(index.ids, scoreAll(index, queries), k)
}
