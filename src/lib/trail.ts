// Back buttons go up to a parent screen. If that screen is already further back in the history,
// they step back to it; otherwise they swap the current screen for it. They never push a new
// screen, which is what used to make back buttons loop between a set and its editor.

import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

const KEY = 'nav-trail'

/** The path at each history position (react-router's `idx`), kept across reloads. */
let trail: string[] = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
})()

const position = (): number => window.history.state?.idx ?? 0

/** Records where each history entry points. Mount once, inside the router. */
export function useTrail() {
  const { pathname, search } = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    const idx = position()
    // A new screen drops anything that was forward of here.
    if (type === 'PUSH') trail = trail.slice(0, idx)
    trail[idx] = pathname + search
    try {
      sessionStorage.setItem(KEY, JSON.stringify(trail))
    } catch {
      // Back buttons just fall back to opening the parent.
    }
  }, [pathname, search, type])
}

export type ParentMatch = string | ((path: string) => boolean)

const pathOf = (p: string) => p.split('?')[0]

/** Screens a set can be opened from: the tabs and the series pages. */
export const isListScreen = (path: string) => {
  const p = pathOf(path)
  return ['/', '/sets', '/value', '/swaps'].includes(p) || p.startsWith('/series/')
}

/**
 * Go up to the parent: a path (matched ignoring ?query), or a test for any acceptable parent.
 * `fallback` is opened in place of this screen when no parent is in the history.
 */
export function useGoUp() {
  const navigate = useNavigate()
  return (parent: ParentMatch, fallback = typeof parent === 'string' ? parent : '/') => {
    const matches = typeof parent === 'string' ? (p: string) => pathOf(p) === pathOf(parent) : parent
    const idx = position()
    for (let k = idx - 1; k >= 0; k--) {
      if (trail[k] && matches(trail[k])) {
        navigate(k - idx)
        return
      }
    }
    navigate(fallback, { replace: true })
  }
}
