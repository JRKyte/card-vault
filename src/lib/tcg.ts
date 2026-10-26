// Typed client for https://api.pokemontcg.io/v2. Only the fields we use are typed.
//
// Notes from the live API (Oct 2026):
// - `q` uses Lucene-ish syntax: `name:pika*`, `set.id:sv7`, `number:128`, `(id:a OR id:b)`.
// - pageSize max is 250. Responses carry page, pageSize, count, totalCount.
// - tcgplayer.prices is keyed by variant; newer sets often have no prices at all.
// - cardmarket.prices uses 0 to mean "no data".
// - Without a key the API intermittently returns 500/502, so every call retries with backoff.

export const VARIANTS = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal'] as const
export type Variant = (typeof VARIANTS)[number]

export interface TcgPlayerPrice {
  low?: number | null
  mid?: number | null
  high?: number | null
  market?: number | null
  directLow?: number | null
}

export interface CardmarketPrices {
  averageSellPrice?: number | null
  trendPrice?: number | null
  reverseHoloTrend?: number | null
}

export interface TcgSet {
  id: string
  name: string
  series: string
  printedTotal?: number
  total: number
  releaseDate: string // "2024/09/13"
  ptcgoCode?: string
  images: { symbol?: string; logo?: string }
}

export interface Card {
  id: string
  name: string
  supertype: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  number: string
  rarity?: string
  images: { small: string; large: string }
  set: TcgSet
  tcgplayer?: { updatedAt?: string; prices?: Partial<Record<Variant, TcgPlayerPrice>> }
  /** From TCGdex when it has the card (source: 'tcgdex'), else pokemontcg.io's own, often stale, copy. */
  cardmarket?: { updatedAt?: string; prices?: CardmarketPrices; source?: 'tcgdex' }
  /** Printings the card exists in, per TCGdex. Used when TCGplayer lists none. */
  tcgdexVariants?: Variant[]
}

interface Page<T> {
  data: T[]
  page: number
  pageSize: number
  count: number
  totalCount: number
}

const BASE = 'https://api.pokemontcg.io/v2'
const MAX_CONCURRENT = 4
const MAX_ATTEMPTS = 6

export function apiKey(): string | undefined {
  try {
    const stored = localStorage.getItem('pokemontcg-api-key')
    if (stored) return stored
  } catch {
    // Storage blocked; fall through to the build-time key.
  }
  return import.meta.env.VITE_POKEMONTCG_API_KEY || undefined
}

// A tiny semaphore so a set refresh never hammers the API.
let active = 0
const waiting: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const headers: HeadersInit = {}
  const key = apiKey()
  if (key) headers['X-Api-Key'] = key

  return withSlot(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { headers })
        if (res.ok) return (await res.json()) as T
        // 429 and 5xx are worth retrying; anything else is a real error.
        if (res.status !== 429 && res.status < 500) throw new TcgError(`pokemontcg.io ${res.status}`, false)
        lastError = new TcgError(`pokemontcg.io ${res.status}`, true)
        const retryAfter = Number(res.headers.get('Retry-After'))
        await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt))
      } catch (e) {
        if (e instanceof TcgError && !e.retryable) throw e
        lastError = e
        await sleep(backoff(attempt))
      }
    }
    throw lastError
  })
}

function backoff(attempt: number) {
  return Math.min(8000, 400 * 2 ** attempt) + Math.random() * 250
}

export class TcgError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message)
  }
}

const CARD_FIELDS = 'id,name,supertype,subtypes,hp,types,number,rarity,images,set,tcgplayer,cardmarket'
const SET_FIELDS = 'id,name,series,printedTotal,total,releaseDate,ptcgoCode,images'

/** One page of a card search. */
export function searchCards(q: string, opts: { page?: number; pageSize?: number; orderBy?: string } = {}) {
  return get<Page<Card>>('/cards', {
    q,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 60,
    orderBy: opts.orderBy ?? '-set.releaseDate,number',
    select: CARD_FIELDS,
  })
}

/** Every card matching `q`, following pagination at the maximum page size. */
export async function allCards(q: string, orderBy = 'number'): Promise<Card[]> {
  const pageSize = 250
  const first = await get<Page<Card>>('/cards', { q, page: 1, pageSize, orderBy, select: CARD_FIELDS })
  const pages = Math.ceil(first.totalCount / pageSize)
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      get<Page<Card>>('/cards', { q, page: i + 2, pageSize, orderBy, select: CARD_FIELDS }),
    ),
  )
  return [first, ...rest].flatMap((p) => p.data)
}

/** Cards by id, batched into OR queries so 200 ids cost ~4 requests. */
export async function cardsByIds(ids: string[]): Promise<Card[]> {
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50))
  const results = await Promise.all(chunks.map((chunk) => allCards(`(${chunk.map((id) => `id:"${id}"`).join(' OR ')})`)))
  return results.flat()
}

export const setCards = (setId: string) => allCards(`set.id:"${setId}"`)

export async function allSets(): Promise<TcgSet[]> {
  const page = await get<Page<TcgSet>>('/sets', { pageSize: 250, orderBy: '-releaseDate', select: SET_FIELDS })
  return page.data
}

/** Build the `q` for the Add screen: "128/142" or "128" → number, anything else → name prefix. */
export function searchQueryFor(term: string): string | null {
  const t = term.trim()
  if (t.length < 2 && !/^\d+$/.test(t)) return null
  const num = t.match(/^#?0*(\d+)\s*(?:\/\s*0*(\d+))?$/)
  if (num) return num[2] ? `number:${num[1]} set.printedTotal:${num[2]}` : `number:${num[1]}`
  const clean = t.replace(/["\\:()*]/g, ' ').trim()
  if (clean.length < 2) return null
  // Multi-word names need quoting; the wildcard only works unquoted, so use it for single words.
  return clean.includes(' ') ? `name:"${clean}*"` : `name:${clean}*`
}

export const parseReleaseDate = (d: string) => new Date(d.replace(/\//g, '-') + 'T00:00:00')
