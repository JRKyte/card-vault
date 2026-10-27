// Step 2: download each card's small image into <cache dir>/img (skips ones already there).
// Usage: node scripts/fingerprints/download.mjs <cache dir>

import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
const cards = JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8'))
fs.mkdirSync(path.join(dir, 'img'), { recursive: true })
const imageFile = (dir, id) => path.join(dir, 'img', id.replace(/[^a-zA-Z0-9.-]/g, '_'))

let next = 0
let done = 0
const failed = []
async function worker() {
  while (next < cards.length) {
    const card = cards[next++]
    const file = imageFile(dir, card.id)
    if (!fs.existsSync(file)) {
      let ok = false
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const res = await fetch(card.url)
          if (!res.ok) throw new Error(String(res.status))
          fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
          ok = true
        } catch {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
        }
      }
      if (!ok) failed.push(card.id)
    }
    if (++done % 1000 === 0) console.log(done, 'of', cards.length)
  }
}
await Promise.all(Array.from({ length: 16 }, worker))
console.log('done;', failed.length, 'failed', failed.slice(0, 20).join(' '))
