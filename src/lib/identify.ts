// Deciding which card the scanner is looking at, from the picture matches (artmatch.ts) and, when
// one came back, the number read off the bottom (ocr.ts). The picture is the main evidence; the
// number only settles which of the closest pictures it is (reprints share art).

import type { ArtMatch } from './artmatch'
import type { CardText } from './scan'
import { setCodes } from './search'
import type { Card } from './tcg'

// Both measured on photo-like test images of real cards and on ordinary non-card photos: a wrong
// best match led the runner-up by at most ~0.011; empty frames scored at most ~0.54, cards ~0.63+.
/** How far ahead of the runner-up the best picture match must be to trust it alone. */
export const SURE_MARGIN = 0.02
/** Below this, the best match is too weak to mean a card is in the frame at all (rapid mode). */
export const PRESENT_SCORE = 0.58
/** How many of the closest pictures to offer when it isn't sure. */
export const OPTIONS = 6

const normNumber = (n: string) => n.toUpperCase().replace(/^0+(?=\d)/, '')

/** Does what was read off the bottom of the card fit this card? */
export function numberFits(card: Card, read: CardText): boolean {
  if (normNumber(card.number) !== normNumber(read.number)) return false
  if (read.total && ![card.set.printedTotal, card.set.total].includes(Number(read.total))) return false
  if (read.setCode && !setCodes(card.set).includes(read.setCode.toUpperCase())) return false
  return true
}

export interface Identified {
  /** Best first. One card when sure; otherwise the closest few to pick from. */
  cards: Card[]
  sure: boolean
}

/** Combine picture matches (best first) with any number readings into a decision. */
export function identify(matches: ArtMatch[], cards: ReadonlyMap<string, Card>, reads: CardText[] = []): Identified {
  const ranked = matches.map((m) => cards.get(m.id)).filter((c): c is Card => !!c)
  if (!ranked.length) return { cards: [], sure: false }

  // A close picture match whose number was also read: as good as it gets.
  const agreed = ranked.find((c) => reads.some((r) => numberFits(c, r)))
  if (agreed) return { cards: [agreed, ...ranked.filter((c) => c !== agreed).slice(0, OPTIONS - 1)], sure: true }

  const margin = matches.length > 1 ? matches[0].score - matches[1].score : 1
  return { cards: ranked.slice(0, OPTIONS), sure: margin >= SURE_MARGIN && ranked[0].id === matches[0].id }
}
