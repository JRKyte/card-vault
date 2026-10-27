// Step 4: pack the fingerprints for the app: public/fingerprints/index.json (card ids, one list
// shared by every model) and one <model>.bin per model. Vectors are stored as int8 (value × 127):
// a quarter of the size, with no real loss for matching.
// Usage: node scripts/fingerprints/pack.mjs <cache dir>

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import config from '../../src/lib/artmatch-config.json' with { type: 'json' }
import { modelTag } from './embed.mjs'

const dir = process.argv[2]
const out = path.join(import.meta.dirname, '../../public/fingerprints')

const load = ({ id, dtype }) => {
  const tag = modelTag(id, dtype)
  const ids = JSON.parse(fs.readFileSync(path.join(dir, `ids-${tag}.json`), 'utf8'))
  const raw = fs.readFileSync(path.join(dir, `vectors-${tag}.f32`))
  const floats = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  const dims = floats.length / ids.length
  if (!Number.isInteger(dims)) throw new Error(`${id}: ids and vectors are out of step`)
  return { id, dtype, tag, ids, floats, dims }
}
const models = config.models.map(load)

// Only cards every model has a fingerprint for, in one order.
const have = models.map((m) => new Set(m.ids))
const ids = models[0].ids.filter((id) => have.every((h) => h.has(id)))

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const packed = models.map((m) => {
  const row = new Map(m.ids.map((id, i) => [id, i]))
  const bytes = new Int8Array(ids.length * m.dims)
  ids.forEach((id, i) => {
    const from = row.get(id) * m.dims
    for (let j = 0; j < m.dims; j++) bytes[i * m.dims + j] = Math.max(-127, Math.min(127, Math.round(m.floats[from + j] * 127)))
  })
  // The hash changes whenever the fingerprints do, so the app never reuses a stale cached copy.
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const file = `${m.tag}.${hash}.bin`
  fs.writeFileSync(path.join(out, file), bytes)
  console.log(m.id, ids.length, 'cards,', m.dims, 'dims,', (bytes.length / 1e6).toFixed(1), 'MB')
  return { id: m.id, dtype: m.dtype, dims: m.dims, file }
})
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ models: packed, ids }))
