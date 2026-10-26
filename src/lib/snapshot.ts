import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { loadCards, today } from './cards'
import { keys } from './queries'
import { snapshotTotals } from './sets'
import { store } from './store'

/** On app open, record today's collection value if it hasn't been recorded yet. */
export function useDailySnapshot() {
  const qc = useQueryClient()
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void (async () => {
      try {
        const day = today()
        const snapshots = await qc.fetchQuery({ queryKey: keys.snapshots, queryFn: () => store.listSnapshots() })
        if (snapshots.some((s) => s.taken_on === day)) return
        const items = await qc.fetchQuery({ queryKey: keys.items, queryFn: () => store.listItems() })
        if (!items.length) return
        // loadCards refreshes anything older than 24h, so totals use today's prices.
        const cards = await loadCards(items.map((i) => i.card_id))
        await store.putSnapshot({ taken_on: day, ...snapshotTotals(items, cards) })
        qc.invalidateQueries({ queryKey: keys.snapshots })
      } catch {
        // Offline or API down: try again next time the app opens.
        ran.current = false
      }
    })()
  }, [qc])
}
