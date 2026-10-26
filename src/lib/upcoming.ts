import upcomingJson from '../data/upcoming-sets.json'
import { parseReleaseDate, type TcgSet } from './tcg'

export interface Upcoming {
  name: string
  code: string
  releaseDate: Date
  cardCount: number | null
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Soonest future set: from the API if it lists any, else from upcoming-sets.json. */
export function nextUpcoming(sets: TcgSet[] | undefined): Upcoming | null {
  const now = startOfToday()
  const fromApi = (sets ?? [])
    .map((s) => ({ name: s.name, code: s.ptcgoCode ?? s.id.toUpperCase(), releaseDate: parseReleaseDate(s.releaseDate), cardCount: s.total || null }))
    .filter((s) => s.releaseDate > now)
    .sort((a, b) => +a.releaseDate - +b.releaseDate)
  if (fromApi.length) return fromApi[0]
  const fromFile = (upcomingJson as { name: string; code: string; releaseDate: string; cardCount: number }[])
    .map((s) => ({ ...s, releaseDate: new Date(s.releaseDate + 'T00:00:00') }))
    .filter((s) => s.releaseDate >= now)
    .sort((a, b) => +a.releaseDate - +b.releaseDate)
  return fromFile[0] ?? null
}

export const daysUntil = (d: Date) => Math.max(0, Math.round((+d - +startOfToday()) / 864e5))
