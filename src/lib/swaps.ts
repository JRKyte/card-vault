// Working out swaps between two collections. A "spare" is a card you have 2+ copies of (all
// versions counted together). A swap is one of their spares you don't have, for one of yours
// they don't have.

export interface CardCount {
  card_id: string
  quantity: number
}

export interface SwapOptions {
  /** Their spares you don't own. */
  theyCanGive: CardCount[]
  /** Your spares they don't own. */
  youCanGive: CardCount[]
  /** One-for-one swaps possible: the shorter of the two lists. */
  swaps: number
}

/** Total copies per card, across versions and conditions. */
export function countByCard(rows: CardCount[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.card_id, (counts.get(r.card_id) ?? 0) + r.quantity)
  return counts
}

/** Cards with copies to spare, and how many can go (keeping one). */
function spares(counts: Map<string, number>): CardCount[] {
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([card_id, n]) => ({ card_id, quantity: n - 1 }))
}

export function swapOptions(mine: CardCount[], theirs: CardCount[]): SwapOptions {
  const myCounts = countByCard(mine)
  const theirCounts = countByCard(theirs)
  const theyCanGive = spares(theirCounts).filter((c) => !myCounts.has(c.card_id))
  const youCanGive = spares(myCounts).filter((c) => !theirCounts.has(c.card_id))
  return { theyCanGive, youCanGive, swaps: Math.min(theyCanGive.length, youCanGive.length) }
}
