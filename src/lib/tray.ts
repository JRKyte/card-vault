// The scan tray: cards snapped but not yet added, reviewed before "Add all".

import { variantsFor, type Condition } from './pricing'
import type { CollectionItem } from './sets'
import type { Card, Variant } from './tcg'

export interface TrayItem {
  id: string
  /** One card when the scan was sure; several when it needs you to pick. */
  options: Card[]
  /** The picked card id, or null while it still needs picking. */
  chosen: string | null
  variant: Variant
  condition: Condition
  quantity: number
  /** Snapped and still being recognised. */
  pending?: boolean
  /** Couldn't be recognised, or the scan was interrupted. */
  failed?: boolean
  /** A small copy of the snap, shown while it's recognised and next to the options to pick from. */
  photo?: string
}

export const chosenCard = (item: TrayItem) => item.options.find((c) => c.id === item.chosen) ?? null

/** A snapped card goes in the tray straight away, to be recognised in the background. */
export function addPending(tray: TrayItem[], id: string, photo: string): TrayItem[] {
  return [...tray, { id, options: [], chosen: null, variant: 'normal', condition: 'near_mint', quantity: 1, pending: true, photo }]
}

/**
 * A snap has been recognised. One sure card that's already in the tray bumps that row's count
 * instead; nothing found marks the snap as failed. A snap removed meanwhile is left out.
 */
export function resolveScan(tray: TrayItem[], id: string, cards: Card[]): TrayItem[] {
  const row = tray.find((t) => t.id === id)
  if (!row) return tray
  if (!cards.length) return tray.map((t) => (t === row ? { ...t, pending: false, failed: true } : t))
  if (cards.length === 1) {
    const existing = tray.find((t) => t !== row && t.chosen === cards[0].id)
    if (existing) return tray.filter((t) => t !== row).map((t) => (t === existing ? { ...t, quantity: t.quantity + 1 } : t))
  }
  const resolved: TrayItem = { ...row, options: cards, chosen: cards.length === 1 ? cards[0].id : null, variant: variantsFor(cards[0])[0], pending: false }
  return tray.map((t) => (t === row ? resolved : t))
}

/** Rows ready to add: recognised and picked. */
export const readyRows = (tray: TrayItem[]) => tray.filter((t) => t.chosen)

/** What an Undo of a batch must do, newest add first: set a row's count back, or delete it. */
export function undoSteps(adds: { row: CollectionItem; quantity: number }[]): { id: string; left: number }[] {
  return [...adds].reverse().map(({ row, quantity }) => ({ id: row.id, left: row.quantity - quantity }))
}

const KEY = 'scan-tray'

/** The tray survives closing the scanner by accident (this tab only). */
export function loadTray(): TrayItem[] {
  try {
    // Snaps still being recognised when the scanner closed won't finish now.
    return (JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as TrayItem[]).map((t) => (t.pending ? { ...t, pending: false, failed: true } : t))
  } catch {
    return []
  }
}

export function saveTray(tray: TrayItem[]) {
  try {
    if (tray.length) sessionStorage.setItem(KEY, JSON.stringify(tray))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage full or blocked; the tray just won't survive a reload.
  }
}
