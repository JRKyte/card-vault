// The rapid-scan tray: cards scanned but not yet added, reviewed before "Add all".

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
}

export const chosenCard = (item: TrayItem) => item.options.find((c) => c.id === item.chosen) ?? null

/** Add a scan: the same card again bumps its quantity; anything else is a new row. */
export function addScan(tray: TrayItem[], cards: Card[], newId: () => string): TrayItem[] {
  if (!cards.length) return tray
  if (cards.length === 1) {
    const existing = tray.find((t) => t.chosen === cards[0].id)
    if (existing) return tray.map((t) => (t === existing ? { ...t, quantity: t.quantity + 1 } : t))
  }
  const first = cards[0]
  return [
    ...tray,
    { id: newId(), options: cards, chosen: cards.length === 1 ? first.id : null, variant: variantsFor(first)[0], condition: 'near_mint', quantity: 1 },
  ]
}

/** What an Undo of a batch must do, newest add first: set a row's count back, or delete it. */
export function undoSteps(adds: { row: CollectionItem; quantity: number }[]): { id: string; left: number }[] {
  return [...adds].reverse().map(({ row, quantity }) => ({ id: row.id, left: row.quantity - quantity }))
}

const KEY = 'scan-tray'

/** The tray survives closing the scanner by accident (this tab only). */
export function loadTray(): TrayItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as TrayItem[]
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
