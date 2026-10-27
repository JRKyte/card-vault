// Step 3: turn each downloaded card image into a fingerprint vector with each model the app uses
// (src/lib/artmatch-config.json). Writes <cache dir>/vectors-<model>.f32 (Float32, unit length)
// and ids-<model>.json; resumable. About 30ms a card per model.
// Usage: node scripts/fingerprints/embed.mjs <cache dir> [model dtype]

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { AutoProcessor, CLIPVisionModelWithProjection, pipeline, RawImage } from '@huggingface/transformers'
import config from '../../src/lib/artmatch-config.json' with { type: 'json' }

const SIZE = config.size

/** Card image → SIZE×SIZE RGB, stretched to fill (the app squashes its camera crop the same way). */
export async function cardPixels(input) {
  const { data } = await sharp(input).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  return new RawImage(new Uint8ClampedArray(data), SIZE, SIZE, 3)
}

/** A function from RawImage to a unit-length fingerprint, for any supported model. */
export async function loadEmbedder(model, dtype) {
  if (/clip/i.test(model)) {
    const processor = await AutoProcessor.from_pretrained(model)
    const vision = await CLIPVisionModelWithProjection.from_pretrained(model, { dtype })
    return async (img) => unit((await vision(await processor(img))).image_embeds.data)
  }
  const extractor = await pipeline('image-feature-extraction', model, { dtype })
  return async (img) => {
    const out = await extractor(img)
    return unit(out.data.slice(0, out.dims[2])) // the CLS token
  }
}

function unit(v) {
  const f = Float32Array.from(v)
  let s = 0
  for (const x of f) s += x * x
  s = Math.sqrt(s)
  return f.map((x) => x / s)
}

export const modelTag = (model, dtype) => model.replace(/[^a-zA-Z0-9]+/g, '_') + '-' + dtype

async function embedAll(dir, model, dtype) {
  const cards = JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8'))
  const tag = modelTag(model, dtype)
  const idsFile = path.join(dir, `ids-${tag}.json`)
  const vecFile = path.join(dir, `vectors-${tag}.f32`)
  // Saved together every 500 cards, so a stopped run picks up where it left off.
  const done = fs.existsSync(idsFile) ? JSON.parse(fs.readFileSync(idsFile, 'utf8')) : []
  const saved = done.length ? fs.readFileSync(vecFile) : null
  const vectors = saved ? [new Float32Array(saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength))] : []
  const have = new Set(done)
  const save = () => {
    fs.writeFileSync(vecFile, Buffer.concat(vectors.map((v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength))))
    fs.writeFileSync(idsFile, JSON.stringify(done))
  }
  const embed = await loadEmbedder(model, dtype)
  const t0 = Date.now()
  let n = 0
  for (const card of cards) {
    if (have.has(card.id)) continue
    const file = path.join(dir, 'img', card.id.replace(/[^a-zA-Z0-9.-]/g, '_'))
    if (!fs.existsSync(file)) continue
    let v
    try {
      v = await embed(await cardPixels(file))
    } catch (e) {
      console.warn('skip', card.id, e.message)
      continue
    }
    vectors.push(v)
    done.push(card.id)
    if (++n % 500 === 0) {
      save()
      console.log(done.length, 'of', cards.length, `${((Date.now() - t0) / n).toFixed(0)}ms/card`)
    }
  }
  save()
  console.log(model, 'done:', done.length, 'fingerprints')
}

// Run as a script (not when imported for testing).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, onlyModel, onlyDtype] = process.argv.slice(2)
  for (const { id, dtype } of onlyModel ? [{ id: onlyModel, dtype: onlyDtype }] : config.models) await embedAll(dir, id, dtype)
}
