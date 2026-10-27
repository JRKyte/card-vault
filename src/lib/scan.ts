// Turning the text read from the bottom of a card into a search.
//
// Modern cards print a line like "SCR EN 128/142" (set code, language, number/printed total).
// Older cards print just "4/102". Trainer Gallery and Galarian Gallery use "TG05/TG30".

export interface CardText {
  number: string
  total: string | null
  setCode: string | null
}

// OCR often confuses these with digits in the number line.
const DIGIT_FIXES: Record<string, string> = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', Z: '2', S: '5', s: '5', B: '8', G: '6' }
const toDigits = (s: string) => s.replace(/[OoDQIl|iZSsBG]/g, (c) => DIGIT_FIXES[c] ?? c)

// Words that turn up on the bottom line but are never set codes.
const NOT_SET_CODES = new Set(['EN', 'HP', 'ILLUS', 'THE', 'AND', 'FOR', 'POKEMON', 'NINTENDO', 'GAME', 'FREAK', 'CREATURES', 'INC'])

/** Pull the card number, printed total and set code out of OCR text. Null when no number is found. */
export function parseCardText(raw: string): CardText | null {
  const text = raw.replace(/\s+/g, ' ').trim()

  // Gallery subsets: TG05/TG30, GG12/GG70.
  const gallery = text.match(/\b([A-Z]{2})\s?(\d{1,3})\s?\/\s?\1\s?(\d{1,3})\b/)
  if (gallery) {
    return { number: `${gallery[1]}${gallery[2].padStart(2, '0')}`, total: null, setCode: findSetCode(text.slice(0, gallery.index)) }
  }

  // number/total, allowing letter-for-digit OCR slips inside the numbers.
  const slash = text.match(/([0-9OoDQIl|iZSsBG]{1,3})\s?\/\s?([0-9OoDQIl|iZSsBG]{2,3})/)
  if (!slash) return null
  const number = toDigits(slash[1]).replace(/^0+(?=\d)/, '')
  const total = toDigits(slash[2]).replace(/^0+(?=\d)/, '')
  if (!/^\d+$/.test(number) || !/^\d+$/.test(total)) return null
  return { number, total, setCode: findSetCode(text.slice(0, slash.index)) }
}

/**
 * When the slash is misread (the number font is slanted, so "/" often reads as 7, 1 or nothing),
 * "128/142" arrives as "1287142" or "128142". Try every way to split a digit run into
 * number + optional separator + total, keeping only totals that are real set sizes.
 */
export function splitDigitRuns(raw: string, knownTotals: ReadonlySet<number>): CardText[] {
  const out: CardText[] = []
  const seen = new Set<string>()
  // Whole digit runs only. Long runs are the copyright years ("1995969899"), and a lone year
  // ("1999") is never a card number.
  const runs = (toDigits(raw.replace(/[,.]/g, '')).match(/\d+/g) ?? []).filter((r) => r.length >= 3 && r.length <= 7 && !/^(19|20)\d\d$/.test(r))
  for (const run of runs) {
    for (let i = 1; i <= 3 && i < run.length - 1; i++) {
      const number = run.slice(0, i).replace(/^0+(?=\d)/, '')
      // A misread slash first: "41102" is more likely 4/102 than 41/102.
      for (const sep of [1, 0]) {
        if (sep && !/[71]/.test(run[i])) continue
        const total = run.slice(i + sep)
        if (total.length < 2 || total.length > 3 || total.startsWith('0')) continue
        const t = Number(total)
        // Secret rares go past the printed total, but not by more than ~100.
        if (!knownTotals.has(t) || Number(number) > t + 110 || Number(number) === 0) continue
        const key = `${number}/${total}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ number, total, setCode: null })
        }
      }
    }
  }
  return out
}

/**
 * Promos print a set code and a bare number ("MEP EN 101", "SVP EN 085"), no "/total". Only
 * codes of real sets count, so stray words on the card can't pass for one.
 */
export function promoNumbers(raw: string, knownCodes: ReadonlySet<string>): CardText[] {
  const out: CardText[] = []
  for (const m of raw.toUpperCase().matchAll(/\b([A-Z]{2,4})\s?(?:EN\s?)?([0-9OQDIL|SBZG]{1,3})\b/g)) {
    const number = toDigits(m[2]).replace(/^0+(?=\d)/, '')
    // At least one real digit: "MEP G" is not MEP 6.
    if (knownCodes.has(m[1]) && /\d/.test(m[2]) && /^\d+$/.test(number) && number !== '0') out.push({ number, total: null, setCode: m[1] })
  }
  return out
}

/** Confident readings: a clean "number/total" with a real total, or a promo number with a real set code. */
export function strongCandidates(raw: string, knownTotals: ReadonlySet<number>, knownCodes: ReadonlySet<string> = new Set()): CardText[] {
  const clean = parseCardText(raw)
  if (clean && (!clean.total || knownTotals.size === 0 || knownTotals.has(Number(clean.total)))) return [clean]
  return promoNumbers(raw, knownCodes).slice(0, 2)
}

/** Everything the text could be: confident readings first, else the digit-run guesses. */
export function cardCandidates(raw: string, knownTotals: ReadonlySet<number>, knownCodes: ReadonlySet<string> = new Set()): CardText[] {
  const strong = strongCandidates(raw, knownTotals, knownCodes)
  return strong.length ? strong : splitDigitRuns(raw, knownTotals).slice(0, 4)
}

/** The last 3-letter code before the number, e.g. "SCR" in "H SCR EN 128/142". */
function findSetCode(before: string): string | null {
  const codes = [...before.toUpperCase().matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]).filter((c) => !NOT_SET_CODES.has(c))
  return codes.at(-1) ?? null
}

/** Promo sets ("MEP Black Star Promos", "Scarlet & Violet Black Star Promos") print bare numbers. */
export const isPromoSet = (set: { name: string }) => /promo/i.test(set.name)

/**
 * The bare number that keeps turning up across several reads, e.g. "101" in three reads of a
 * promo whose set code (printed white-on-dark) didn't read. Ties go to the longer number.
 */
export function steadyNumber(reads: string[]): string | null {
  const counts = new Map<string, number>()
  for (const text of reads) {
    for (const token of new Set(text.split(/\s+/))) {
      const n = token.replace(/^0+(?=\d)/, '')
      if (/^\d{1,3}$/.test(n) && n !== '0') counts.set(n, (counts.get(n) ?? 0) + 1)
    }
  }
  const best = [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]
  return best?.[0] ?? null
}
