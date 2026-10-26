// The "New custom set" form survives a trip to the search screen to choose cards.
import type { Exclusions } from './sets'

export interface Draft {
  name: string
  color: string
  kind: 'smart' | 'picked'
  term: string
  exclusions: Exclusions
  cards: string[]
}

const KEY = 'custom-set-draft'

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // Draft just won't survive navigation.
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

export const draftCards = () => loadDraft()?.cards ?? []

export function setDraftCards(cards: string[]) {
  const d = loadDraft()
  if (d) saveDraft({ ...d, cards })
}
