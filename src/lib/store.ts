// Everything the app persists goes through this interface. The Supabase store is the real one;
// the local store keeps data on this device so the app can be tried before Supabase is set up.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Condition } from './pricing'
import type { CollectionItem, Exclusions } from './sets'
import type { Card, TcgSet, Variant } from './tcg'

export interface CustomSet {
  id: string
  name: string
  color: string
  kind: 'smart' | 'picked'
  query: string | null
  exclusions: Exclusions | null
  icon_card_id: string | null
  created_at: string
}

export interface CustomSetCard {
  custom_set_id: string
  card_id: string
  resolved_at: string
}

export interface TrackedSet {
  set_id: string
  created_at: string
}

export interface Profile {
  display_name: string
  avatar_mode: 'initials' | 'card'
  avatar_card_id: string | null
  currency_display: 'both' | 'usd' | 'eur'
}

export interface ValueSnapshot {
  taken_on: string
  total_usd: number
  total_eur: number
  card_count: number
}

export interface PriceHistoryRow {
  card_id: string
  taken_on: string
  usd: Partial<Record<Variant, number>> | null
  eur: { trend?: number | null; reverseHoloTrend?: number | null; average?: number | null } | null
}

export interface Cached<T> {
  data: T
  fetched_at: string
}

export type NewCustomSet = Omit<CustomSet, 'id' | 'created_at'>

export interface Store {
  readonly mode: 'supabase' | 'local'

  getUser(): Promise<{ id: string; email: string } | null>
  onAuthChange(fn: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>

  listItems(): Promise<CollectionItem[]>
  /** Adds copies, merging into an existing (card, variant, condition) row. */
  addItem(card_id: string, variant: Variant, condition: Condition, quantity: number): Promise<CollectionItem>
  updateItem(id: string, patch: Partial<Pick<CollectionItem, 'variant' | 'condition' | 'quantity'>>): Promise<void>
  deleteItem(id: string): Promise<void>

  listTracked(): Promise<TrackedSet[]>
  track(set_id: string): Promise<void>
  untrack(set_id: string): Promise<void>

  listCustomSets(): Promise<CustomSet[]>
  createCustomSet(set: NewCustomSet): Promise<CustomSet>
  updateCustomSet(id: string, patch: Partial<NewCustomSet>): Promise<void>
  deleteCustomSet(id: string): Promise<void>
  listCustomSetCards(): Promise<CustomSetCard[]>
  addCustomSetCards(custom_set_id: string, card_ids: string[]): Promise<void>
  removeCustomSetCard(custom_set_id: string, card_id: string): Promise<void>
  /** Replace a smart set's resolved membership. */
  replaceCustomSetCards(custom_set_id: string, card_ids: string[]): Promise<void>

  getCachedCards(ids: string[]): Promise<Cached<Card>[]>
  getCachedSetCards(set_id: string): Promise<Cached<Card>[]>
  putCards(cards: Card[]): Promise<void>
  getCachedSets(): Promise<Cached<TcgSet>[]>
  putSets(sets: TcgSet[]): Promise<void>

  getPriceHistory(card_ids: string[], since: string): Promise<PriceHistoryRow[]>
  putPriceHistory(rows: PriceHistoryRow[]): Promise<void>

  listSnapshots(): Promise<ValueSnapshot[]>
  putSnapshot(s: ValueSnapshot): Promise<void>

  getProfile(): Promise<Profile | null>
  saveProfile(p: Profile): Promise<void>
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// --- Supabase ---------------------------------------------------------------

class SupabaseStore implements Store {
  readonly mode = 'supabase' as const
  constructor(private sb: SupabaseClient) {}

  async getUser() {
    const { data } = await this.sb.auth.getSession()
    const u = data.session?.user
    return u ? { id: u.id, email: u.email ?? '' } : null
  }
  onAuthChange(fn: () => void) {
    const { data } = this.sb.auth.onAuthStateChange(() => fn())
    return () => data.subscription.unsubscribe()
  }
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }
  async signOut() {
    await this.sb.auth.signOut()
  }

  async listItems() {
    return must(await this.sb.from('collection_items').select('id,card_id,variant,condition,quantity,created_at').order('created_at', { ascending: false })) as CollectionItem[]
  }
  async addItem(card_id: string, variant: Variant, condition: Condition, quantity: number) {
    const existing = must(
      await this.sb.from('collection_items').select('*').match({ card_id, variant, condition }).maybeSingle(),
    ) as CollectionItem | null
    if (existing) {
      return must(
        await this.sb.from('collection_items').update({ quantity: existing.quantity + quantity }).eq('id', existing.id).select().single(),
      ) as CollectionItem
    }
    return must(await this.sb.from('collection_items').insert({ card_id, variant, condition, quantity }).select().single()) as CollectionItem
  }
  async updateItem(id: string, patch: Partial<Pick<CollectionItem, 'variant' | 'condition' | 'quantity'>>) {
    // Changing variant/condition into a row that already exists merges the two.
    const row = must(await this.sb.from('collection_items').select('*').eq('id', id).single()) as CollectionItem
    const next = { ...row, ...patch }
    if (next.variant !== row.variant || next.condition !== row.condition) {
      const clash = must(
        await this.sb.from('collection_items').select('*').match({ card_id: row.card_id, variant: next.variant, condition: next.condition }).maybeSingle(),
      ) as CollectionItem | null
      if (clash) {
        must(await this.sb.from('collection_items').update({ quantity: clash.quantity + next.quantity }).eq('id', clash.id))
        must(await this.sb.from('collection_items').delete().eq('id', id))
        return
      }
    }
    must(await this.sb.from('collection_items').update(patch).eq('id', id))
  }
  async deleteItem(id: string) {
    must(await this.sb.from('collection_items').delete().eq('id', id))
  }

  async listTracked() {
    return must(await this.sb.from('tracked_sets').select('set_id,created_at')) as TrackedSet[]
  }
  async track(set_id: string) {
    must(await this.sb.from('tracked_sets').upsert({ set_id }, { onConflict: 'user_id,set_id', ignoreDuplicates: true }))
  }
  async untrack(set_id: string) {
    must(await this.sb.from('tracked_sets').delete().eq('set_id', set_id))
  }

  async listCustomSets() {
    return must(await this.sb.from('custom_sets').select('*').order('created_at')) as CustomSet[]
  }
  async createCustomSet(set: NewCustomSet) {
    return must(await this.sb.from('custom_sets').insert(set).select().single()) as CustomSet
  }
  async updateCustomSet(id: string, patch: Partial<NewCustomSet>) {
    must(await this.sb.from('custom_sets').update(patch).eq('id', id))
  }
  async deleteCustomSet(id: string) {
    must(await this.sb.from('custom_sets').delete().eq('id', id))
  }
  async listCustomSetCards() {
    return must(await this.sb.from('custom_set_cards').select('*')) as CustomSetCard[]
  }
  async addCustomSetCards(custom_set_id: string, card_ids: string[]) {
    if (!card_ids.length) return
    must(
      await this.sb
        .from('custom_set_cards')
        .upsert(card_ids.map((card_id) => ({ custom_set_id, card_id })), { onConflict: 'custom_set_id,card_id', ignoreDuplicates: true }),
    )
  }
  async removeCustomSetCard(custom_set_id: string, card_id: string) {
    must(await this.sb.from('custom_set_cards').delete().match({ custom_set_id, card_id }))
  }
  async replaceCustomSetCards(custom_set_id: string, card_ids: string[]) {
    const resolved_at = new Date().toISOString()
    must(await this.sb.from('custom_set_cards').delete().eq('custom_set_id', custom_set_id))
    for (const part of chunk(card_ids, 500)) {
      must(await this.sb.from('custom_set_cards').insert(part.map((card_id) => ({ custom_set_id, card_id, resolved_at }))))
    }
  }

  async getCachedCards(ids: string[]) {
    const out: Cached<Card>[] = []
    for (const part of chunk([...new Set(ids)], 100)) {
      out.push(...(must(await this.sb.from('card_cache').select('data,fetched_at').in('card_id', part)) as Cached<Card>[]))
    }
    return out
  }
  async getCachedSetCards(set_id: string) {
    return must(await this.sb.from('card_cache').select('data,fetched_at').eq('data->set->>id', set_id)) as Cached<Card>[]
  }
  async putCards(cards: Card[]) {
    const fetched_at = new Date().toISOString()
    for (const part of chunk(cards, 200)) {
      must(await this.sb.from('card_cache').upsert(part.map((c) => ({ card_id: c.id, data: c, fetched_at }))))
    }
  }
  async getCachedSets() {
    return must(await this.sb.from('set_cache').select('data,fetched_at')) as Cached<TcgSet>[]
  }
  async putSets(sets: TcgSet[]) {
    const fetched_at = new Date().toISOString()
    must(await this.sb.from('set_cache').upsert(sets.map((s) => ({ set_id: s.id, data: s, fetched_at }))))
  }

  async getPriceHistory(card_ids: string[], since: string) {
    const out: PriceHistoryRow[] = []
    for (const part of chunk([...new Set(card_ids)], 100)) {
      out.push(...(must(await this.sb.from('card_price_history').select('*').in('card_id', part).gte('taken_on', since)) as PriceHistoryRow[]))
    }
    return out
  }
  async putPriceHistory(rows: PriceHistoryRow[]) {
    for (const part of chunk(rows, 200)) {
      // First write of the day wins, so the history keeps one stable row per card per day.
      must(await this.sb.from('card_price_history').upsert(part, { onConflict: 'card_id,taken_on', ignoreDuplicates: true }))
    }
  }

  async listSnapshots() {
    return must(await this.sb.from('value_snapshots').select('taken_on,total_usd,total_eur,card_count').order('taken_on')) as ValueSnapshot[]
  }
  async putSnapshot(s: ValueSnapshot) {
    must(await this.sb.from('value_snapshots').upsert(s, { onConflict: 'user_id,taken_on' }))
  }

  async getProfile() {
    return must(await this.sb.from('profiles').select('display_name,avatar_mode,avatar_card_id,currency_display').maybeSingle()) as Profile | null
  }
  async saveProfile(p: Profile) {
    must(await this.sb.from('profiles').upsert(p, { onConflict: 'user_id' }))
  }
}

// --- Local (this device only) ----------------------------------------------

interface LocalData {
  signedIn: boolean
  items: CollectionItem[]
  tracked: TrackedSet[]
  customSets: CustomSet[]
  customSetCards: CustomSetCard[]
  snapshots: ValueSnapshot[]
  history: PriceHistoryRow[]
  profile: Profile | null
}

const LOCAL_KEY = 'card-vault-local'

class LocalStore implements Store {
  readonly mode = 'local' as const
  private listeners = new Set<() => void>()
  // Card and set caches live in memory; the service worker keeps API responses for offline use.
  private cards = new Map<string, Cached<Card>>()
  private sets = new Map<string, Cached<TcgSet>>()

  private read(): LocalData {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      if (raw) return JSON.parse(raw) as LocalData
    } catch {
      // Fall through to an empty store.
    }
    return { signedIn: false, items: [], tracked: [], customSets: [], customSetCards: [], snapshots: [], history: [], profile: null }
  }
  private write(fn: (d: LocalData) => void) {
    const d = this.read()
    fn(d)
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(d))
    } catch {
      // Storage full or blocked: keep going in memory for this session.
    }
  }

  async getUser() {
    return this.read().signedIn ? { id: 'local', email: 'This device only' } : null
  }
  onAuthChange(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  async signIn() {
    this.write((d) => (d.signedIn = true))
    this.listeners.forEach((f) => f())
  }
  async signOut() {
    this.write((d) => (d.signedIn = false))
    this.listeners.forEach((f) => f())
  }

  async listItems() {
    return [...this.read().items].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  async addItem(card_id: string, variant: Variant, condition: Condition, quantity: number) {
    let result!: CollectionItem
    this.write((d) => {
      const existing = d.items.find((i) => i.card_id === card_id && i.variant === variant && i.condition === condition)
      if (existing) {
        existing.quantity += quantity
        result = existing
      } else {
        result = { id: crypto.randomUUID(), card_id, variant, condition, quantity, created_at: new Date().toISOString() }
        d.items.push(result)
      }
    })
    return result
  }
  async updateItem(id: string, patch: Partial<Pick<CollectionItem, 'variant' | 'condition' | 'quantity'>>) {
    this.write((d) => {
      const row = d.items.find((i) => i.id === id)
      if (!row) return
      const next = { ...row, ...patch }
      const clash = d.items.find((i) => i.id !== id && i.card_id === row.card_id && i.variant === next.variant && i.condition === next.condition)
      if (clash) {
        clash.quantity += next.quantity
        d.items = d.items.filter((i) => i.id !== id)
      } else Object.assign(row, patch)
    })
  }
  async deleteItem(id: string) {
    this.write((d) => (d.items = d.items.filter((i) => i.id !== id)))
  }

  async listTracked() {
    return this.read().tracked
  }
  async track(set_id: string) {
    this.write((d) => {
      if (!d.tracked.some((t) => t.set_id === set_id)) d.tracked.push({ set_id, created_at: new Date().toISOString() })
    })
  }
  async untrack(set_id: string) {
    this.write((d) => (d.tracked = d.tracked.filter((t) => t.set_id !== set_id)))
  }

  async listCustomSets() {
    return this.read().customSets
  }
  async createCustomSet(set: NewCustomSet) {
    const created: CustomSet = { ...set, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    this.write((d) => d.customSets.push(created))
    return created
  }
  async updateCustomSet(id: string, patch: Partial<NewCustomSet>) {
    this.write((d) => {
      const s = d.customSets.find((x) => x.id === id)
      if (s) Object.assign(s, patch)
    })
  }
  async deleteCustomSet(id: string) {
    this.write((d) => {
      d.customSets = d.customSets.filter((s) => s.id !== id)
      d.customSetCards = d.customSetCards.filter((c) => c.custom_set_id !== id)
    })
  }
  async listCustomSetCards() {
    return this.read().customSetCards
  }
  async addCustomSetCards(custom_set_id: string, card_ids: string[]) {
    const resolved_at = new Date().toISOString()
    this.write((d) => {
      for (const card_id of card_ids) {
        if (!d.customSetCards.some((c) => c.custom_set_id === custom_set_id && c.card_id === card_id)) {
          d.customSetCards.push({ custom_set_id, card_id, resolved_at })
        }
      }
    })
  }
  async removeCustomSetCard(custom_set_id: string, card_id: string) {
    this.write((d) => (d.customSetCards = d.customSetCards.filter((c) => !(c.custom_set_id === custom_set_id && c.card_id === card_id))))
  }
  async replaceCustomSetCards(custom_set_id: string, card_ids: string[]) {
    const resolved_at = new Date().toISOString()
    this.write((d) => {
      d.customSetCards = d.customSetCards.filter((c) => c.custom_set_id !== custom_set_id)
      d.customSetCards.push(...card_ids.map((card_id) => ({ custom_set_id, card_id, resolved_at })))
    })
  }

  async getCachedCards(ids: string[]) {
    return ids.map((id) => this.cards.get(id)).filter((c): c is Cached<Card> => !!c)
  }
  async getCachedSetCards(set_id: string) {
    return [...this.cards.values()].filter((c) => c.data.set.id === set_id)
  }
  async putCards(cards: Card[]) {
    const fetched_at = new Date().toISOString()
    for (const c of cards) this.cards.set(c.id, { data: c, fetched_at })
  }
  async getCachedSets() {
    if (!this.sets.size) {
      // The set list is small, so it's kept on the device for offline starts.
      try {
        const raw = localStorage.getItem(`${LOCAL_KEY}-sets`)
        if (raw) for (const s of JSON.parse(raw) as Cached<TcgSet>[]) this.sets.set(s.data.id, s)
      } catch {
        // No saved list.
      }
    }
    return [...this.sets.values()]
  }
  async putSets(sets: TcgSet[]) {
    const fetched_at = new Date().toISOString()
    for (const s of sets) this.sets.set(s.id, { data: s, fetched_at })
    try {
      localStorage.setItem(`${LOCAL_KEY}-sets`, JSON.stringify([...this.sets.values()]))
    } catch {
      // Storage full; the in-memory copy still works.
    }
  }

  async getPriceHistory(card_ids: string[], since: string) {
    const ids = new Set(card_ids)
    return this.read().history.filter((h) => ids.has(h.card_id) && h.taken_on >= since)
  }
  async putPriceHistory(rows: PriceHistoryRow[]) {
    this.write((d) => {
      const seen = new Set(d.history.map((h) => `${h.card_id}|${h.taken_on}`))
      for (const r of rows) if (!seen.has(`${r.card_id}|${r.taken_on}`)) d.history.push(r)
      // Keep local history small: 60 days.
      const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
      d.history = d.history.filter((h) => h.taken_on >= cutoff)
    })
  }

  async listSnapshots() {
    return [...this.read().snapshots].sort((a, b) => a.taken_on.localeCompare(b.taken_on))
  }
  async putSnapshot(s: ValueSnapshot) {
    this.write((d) => {
      d.snapshots = d.snapshots.filter((x) => x.taken_on !== s.taken_on)
      d.snapshots.push(s)
    })
  }

  async getProfile() {
    return this.read().profile
  }
  async saveProfile(p: Profile) {
    this.write((d) => (d.profile = p))
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const store: Store =
  url && anonKey
    ? new SupabaseStore(createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'card-vault-auth' } }))
    : new LocalStore()
