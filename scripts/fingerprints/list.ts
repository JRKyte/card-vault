// Step 1: list every card the app knows (pokemontcg.io sets plus the TCGdex-only sets) with an image URL.
// Usage: npx vite-node scripts/fingerprints/list.ts <cache dir>

import fs from 'node:fs'
import path from 'node:path'
import type { TcgSet } from '../../src/lib/tcg'
import { extraSets } from '../../src/lib/tcgdexCards'
import { getJson } from '../../src/lib/tcgdex'

const DATA = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'
const SCRYDEX_SETS: Record<string, string> = { mep: 'mep', mee: 'mee', '2023sv': 'mcd23', '2024sv': 'mcd24' }

const out = process.argv[2]
if (!out) throw new Error('Usage: list.ts <cache dir>')
fs.mkdirSync(out, { recursive: true })

const sets = (await (await fetch(`${DATA}/sets/en.json`)).json()) as { id: string; name: string }[]
const cards: { id: string; url: string }[] = []
for (const s of sets) {
  const list = (await (await fetch(`${DATA}/cards/en/${s.id}.json`)).json()) as { id: string; images: { small: string } }[]
  for (const c of list) cards.push({ id: c.id, url: c.images.small })
}
console.log(cards.length, 'pokemontcg.io cards in', sets.length, 'sets')

// extraSets only needs each set's id and name.
const extras = await extraSets(sets as TcgSet[])
let extra = 0
for (const set of extras) {
  const tdId = set.id.replace(/^tcgdex:/, '')
  const detail = await getJson<{ cards: { id: string; localId: string; image?: string }[] }>(`/sets/${encodeURIComponent(tdId)}`)
  for (const c of detail?.cards ?? []) {
    const number = /^\d+$/.test(c.localId) ? String(Number(c.localId)) : c.localId
    const url = c.image ? `${c.image}/low.webp` : SCRYDEX_SETS[tdId] ? `https://images.scrydex.com/pokemon/${SCRYDEX_SETS[tdId]}-${number}/small` : ''
    if (url) {
      cards.push({ id: `tcgdex:${c.id}`, url })
      extra++
    }
  }
}
console.log(extra, 'TCGdex-only cards in', extras.length, 'sets')
fs.writeFileSync(path.join(out, 'cards.json'), JSON.stringify(cards))
