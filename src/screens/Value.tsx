import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Thumb } from '../components/cards'
import { IconPlus } from '../components/icons'
import { ErrorMessage, Message, Screen, Segmented, Skeleton } from '../components/ui'
import { setColor } from '../data/set-colors'
import { today } from '../lib/cards'
import { useCurrencyMode } from '../lib/money'
import { eurToGbp, fmtEur, fmtGbp, fmtUsd, priceFor, VARIANT_LABEL } from '../lib/pricing'
import { useCollection, useSnapshots } from '../lib/queries'
import { itemsValue, type CollectionItem } from '../lib/sets'
import { store, type PriceHistoryRow, type ValueSnapshot } from '../lib/store'
import type { Card } from '../lib/tcg'

type Cur = 'usd' | 'eur'
type Range = '7' | '30' | 'all'

const GREEN = '#1F7A4C'
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA')

export function Value() {
  const mode = useCurrencyMode()
  const [cur, setCur] = useState<Cur>(mode === 'eur' ? 'eur' : 'usd')
  const [range, setRange] = useState<Range>('30')
  const { items, cards, isLoading, error } = useCollection()
  const snapshots = useSnapshots()
  const fmt = cur === 'usd' ? fmtUsd : fmtEur

  const value = useMemo(() => itemsValue(items, cards), [items, cards])
  const total = cur === 'usd' ? value.usd : value.eur

  const series = useMemo(() => {
    const snaps = [...(snapshots.data ?? [])]
    // Today's line always ends at the live total, even before the snapshot is written.
    const t = today()
    const live: ValueSnapshot = { taken_on: t, total_usd: value.usd, total_eur: value.eur, card_count: 0 }
    const merged = [...snaps.filter((s) => s.taken_on !== t), ...(items.length ? [live] : [])]
    const since = range === 'all' ? '' : daysAgo(Number(range))
    return merged.filter((s) => s.taken_on >= since).map((s) => ({ t: +new Date(s.taken_on + 'T00:00:00'), value: Number(cur === 'usd' ? s.total_usd : s.total_eur) }))
  }, [snapshots.data, value, items.length, range, cur])

  const change = (n: number) => {
    const snaps = snapshots.data ?? []
    const base = [...snaps].reverse().find((s) => s.taken_on <= daysAgo(n))
    if (!base) return null
    return total - Number(cur === 'usd' ? base.total_usd : base.total_eur)
  }

  if (isLoading) {
    return (
      <Screen>
        <Title cur={cur} setCur={setCur} />
        <Skeleton className="h-[420px]" />
      </Screen>
    )
  }
  if (error) {
    return (
      <Screen>
        <Title cur={cur} setCur={setCur} />
        <ErrorMessage error={error} />
      </Screen>
    )
  }
  if (!items.length) {
    return (
      <Screen>
        <Title cur={cur} setCur={setCur} />
        <EmptyValue />
      </Screen>
    )
  }

  return (
    <Screen>
      <Title cur={cur} setCur={setCur} />

      <section className="glass p-5 wide:p-7">
        <div className="flex flex-col gap-5 min-[600px]:flex-row min-[600px]:items-start min-[600px]:justify-between">
          <div>
            <div className="eyebrow text-ink-2">Today</div>
            <div className="mt-1 text-[56px] leading-none font-extrabold tracking-tight tabular-nums wide:text-[68px]">{value.priced ? fmt(total) : '—'}</div>
            <div className="mt-2 text-[17px] font-semibold text-ink-2">
              {cur === 'usd' ? fmtEur(value.priced ? value.eur : null) : fmtUsd(value.priced ? value.usd : null)} · approx {fmtGbp(value.priced ? eurToGbp(value.eur) : null)}
            </div>
          </div>
          <div className="flex gap-3">
            <ChangeTile label="7 days" delta={change(7)} fmt={fmt} />
            <ChangeTile label="30 days" delta={change(30)} fmt={fmt} />
          </div>
        </div>

        <div className="mt-6 h-[240px] wide:h-[280px]" aria-label="Collection value over time">
          {series.length < 2 ? (
            <div className="grid h-full place-items-center rounded-2xl bg-white/40 p-6 text-center text-[16px] text-ink-2">
              The chart fills in as you open the app on different days. Come back tomorrow!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(21,23,43,0.07)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  tick={{ fill: '#8A93AD', fontSize: 13, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={(n: number) => (cur === 'usd' ? '$' : '€') + (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n))}
                  tick={{ fill: '#8A93AD', fontSize: 13, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(21,23,43,0.25)', strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 8px 30px rgba(21,23,43,0.12)', fontFamily: 'Outfit', fontWeight: 600 }}
                  labelFormatter={(t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
                  formatter={(n: number) => [fmt(n), 'Value']}
                />
                <Area type="monotone" dataKey="value" stroke={GREEN} strokeWidth={2} fill="url(#valueFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-4 flex justify-center">
          <Segmented
            label="Chart range"
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: 'all', label: 'All time' },
            ]}
          />
        </div>
      </section>

      <StatTiles items={items} cards={cards} cur={cur} total={total} />
      <Movers items={items} cards={cards} cur={cur} />
    </Screen>
  )
}

function Title({ cur, setCur }: { cur: Cur; setCur: (c: Cur) => void }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h1 className="text-[44px] leading-tight font-extrabold tracking-tight wide:text-[52px]">Value</h1>
      <Segmented
        label="Currency"
        value={cur}
        onChange={setCur}
        options={[
          { value: 'usd', label: 'USD' },
          { value: 'eur', label: 'EUR' },
        ]}
      />
    </div>
  )
}

function ChangeTile({ label, delta, fmt }: { label: string; delta: number | null; fmt: (n: number | null) => string }) {
  const up = (delta ?? 0) >= 0
  const color = delta === null ? '#5B6480' : up ? '#1F7A4C' : '#B3261E'
  return (
    <div className="min-w-[128px] rounded-[18px] px-4 py-3" style={{ background: delta === null ? 'rgba(21,23,43,0.05)' : up ? 'rgba(31,122,76,0.1)' : 'rgba(179,38,30,0.09)' }}>
      <div className="text-[14px] font-semibold text-ink-2">{label}</div>
      <div className="mt-0.5 text-[22px] font-extrabold tabular-nums" style={{ color }}>
        {delta === null ? '—' : `${up ? '▲' : '▼'} ${fmt(Math.abs(delta))}`}
      </div>
    </div>
  )
}

function StatTiles({ items, cards, cur, total }: { items: CollectionItem[]; cards: Map<string, Card>; cur: Cur; total: number }) {
  const fmt = cur === 'usd' ? fmtUsd : fmtEur
  const s = useMemo(() => {
    let priciest: { card: Card; value: number } | null = null
    let holo = 0
    const bySet = new Map<string, { name: string; value: number }>()
    let copies = 0
    for (const i of items) {
      const card = cards.get(i.card_id)
      copies += i.quantity
      if (!card) continue
      const p = priceFor(card, i.variant, i.condition)
      const v = (cur === 'usd' ? p?.usd : p?.eur) ?? 0
      if (v && (!priciest || v > priciest.value)) priciest = { card, value: v }
      if (i.variant !== 'normal') holo += v * i.quantity
      const prev = bySet.get(card.set.id) ?? { name: card.set.name, value: 0 }
      bySet.set(card.set.id, { name: prev.name, value: prev.value + v * i.quantity })
    }
    const best = [...bySet.entries()].sort((a, b) => b[1].value - a[1].value)[0]
    return { priciest, holo, best, average: copies ? total / copies : 0 }
  }, [items, cards, cur, total])

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 wide:grid-cols-4">
      <SmallTile label="Priciest card" value={s.priciest ? fmt(s.priciest.value) : '—'} sub={s.priciest?.card.name ?? 'No prices yet'} />
      <SmallTile label="Average per card" value={s.average ? fmt(s.average) : '—'} sub="Across every copy" />
      <SmallTile label="Holos" value={s.holo ? fmt(s.holo) : '—'} sub={total ? `${Math.round((s.holo / total) * 100)}% of total` : 'Holo and reverse copies'} />
      <SmallTile
        label="Best set"
        value={s.best && s.best[1].value ? fmt(s.best[1].value) : '—'}
        sub={s.best ? <span style={{ color: setColor(s.best[0]) }}>{s.best[1].name}</span> : '—'}
      />
    </div>
  )
}

function SmallTile({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="glass min-w-0 p-4">
      <div className="text-[14px] font-semibold text-ink-2">{label}</div>
      <div className="mt-1 truncate text-[24px] font-extrabold tabular-nums">{value}</div>
      <div className="truncate text-[14px] font-semibold text-ink-2">{sub}</div>
    </div>
  )
}

/** The price we stored for a card on a past day, matching how priceFor reads today's data. */
function historicPrice(row: PriceHistoryRow, item: CollectionItem, cur: Cur, card: Card): number | null {
  // Rebuild a minimal card from the history row and reuse priceFor so fallbacks and condition match.
  const past: Card = {
    ...card,
    tcgplayer: { prices: Object.fromEntries(Object.entries(row.usd ?? {}).map(([v, n]) => [v, { market: n }])) },
    cardmarket: row.eur ? { prices: { trendPrice: row.eur.trend, reverseHoloTrend: row.eur.reverseHoloTrend, averageSellPrice: row.eur.average } } : undefined,
  }
  const p = priceFor(past, item.variant, item.condition)
  return (cur === 'usd' ? p?.usd : p?.eur) ?? null
}

function Movers({ items, cards, cur }: { items: CollectionItem[]; cards: Map<string, Card>; cur: Cur }) {
  const navigate = useNavigate()
  const fmt = cur === 'usd' ? fmtUsd : fmtEur
  const ids = useMemo(() => [...new Set(items.map((i) => i.card_id))].sort(), [items])
  const history = useQuery({
    queryKey: ['priceHistory', ids],
    queryFn: () => store.getPriceHistory(ids, daysAgo(30)),
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
  })

  const movers = useMemo(() => {
    const byCard = new Map<string, PriceHistoryRow[]>()
    for (const r of history.data ?? []) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r])
    const weekAgo = daysAgo(7)
    const t = today()
    const out: { item: CollectionItem; card: Card; delta: number }[] = []
    for (const item of items) {
      const card = cards.get(item.card_id)
      const rows = (byCard.get(item.card_id) ?? []).filter((r) => r.taken_on < t).sort((a, b) => a.taken_on.localeCompare(b.taken_on))
      if (!card || !rows.length) continue
      // The newest row at least a week old, else the oldest we have.
      const base = [...rows].reverse().find((r) => r.taken_on <= weekAgo) ?? rows[0]
      const then = historicPrice(base, item, cur, card)
      const now = priceFor(card, item.variant, item.condition)
      const nowV = (cur === 'usd' ? now?.usd : now?.eur) ?? null
      if (then === null || nowV === null) continue
      const delta = (nowV - then) * item.quantity
      if (Math.abs(delta) >= 0.01) out.push({ item, card, delta })
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)
  }, [history.data, items, cards, cur])

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[24px] font-extrabold">Biggest movers this week</h2>
      {history.isLoading ? (
        <Skeleton className="h-[200px]" />
      ) : movers.length === 0 ? (
        <Message title="Nothing has moved yet" body="Prices are checked each day you open the app. Changes will show up here after a few days." />
      ) : (
        <div className="flex flex-col gap-2">
          {movers.map(({ item, card, delta }) => (
            <button key={item.id} type="button" onClick={() => navigate(`/card/${card.id}`)} className="glass-flat flex items-center gap-4 p-3 pr-5 text-left">
              <Thumb card={card} width={46} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[18px] font-bold">{card.name}</div>
                <div className="truncate text-[14px] text-ink-2">
                  {card.set.name} · {card.number} · {VARIANT_LABEL[item.variant]}
                </div>
              </div>
              <div className={`shrink-0 text-[18px] font-extrabold tabular-nums ${delta >= 0 ? 'text-up' : 'text-down'}`}>
                {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyValue() {
  const navigate = useNavigate()
  return (
    <Message
      icon={<IconPlus />}
      title="Add your first card"
      body="Once you've added some cards, you'll see what your collection is worth here."
      action={
        <button type="button" className="btn-dark mt-2" onClick={() => navigate('/add')}>
          Add a card
        </button>
      }
    />
  )
}
