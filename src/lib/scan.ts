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

/** Everything the text could be: a clean read if there is one, else the digit-run guesses. */
export function cardCandidates(raw: string, knownTotals: ReadonlySet<number>): CardText[] {
  const clean = parseCardText(raw)
  if (clean && (!clean.total || knownTotals.size === 0 || knownTotals.has(Number(clean.total)))) return [clean]
  return splitDigitRuns(raw, knownTotals).slice(0, 4)
}

/** The last 3-letter code before the number, e.g. "SCR" in "H SCR EN 128/142". */
function findSetCode(before: string): string | null {
  const codes = [...before.toUpperCase().matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]).filter((c) => !NOT_SET_CODES.has(c))
  return codes.at(-1) ?? null
}

/**
 * The pokemontcg.io query for what was read. A set code narrows it to one set; otherwise the
 * printed total does most of the work.
 */
export function scanQuery(read: CardText, setIdForCode: (code: string) => string | null): string {
  const setId = read.setCode ? setIdForCode(read.setCode) : null
  // Gallery cards live in a sub-set (swsh11 → swsh11tg), so match the set id as a prefix.
  if (setId && /^[A-Z]/.test(read.number)) return `set.id:${setId}* number:${read.number}`
  if (setId) return `set.id:${setId} number:${read.number}`
  return read.total ? `number:${read.number} set.printedTotal:${read.total}` : `number:${read.number}`
}
