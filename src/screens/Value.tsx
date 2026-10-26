import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Thumb } from '../components/cards'
import { IconPlus } from '../components/icons'
import { ErrorMessage, Message, PageHeader, Screen, Segmented, Skeleton } from '../components/ui'
import { setColor } from '../data/set-colors'
import { today } from '../lib/cards'
import { CURRENCY_SYMBOL, useCurrencyMode, type CurrencyMode } from '../lib/money'
import { eurToGbp, fmtEur, fmtGbp, fmtIn, fmtUsd, inCurrency, priceFor, VARIANT_LABEL } from '../lib/pricing'
import { useCollection, useSnapshots } from '../lib/queries'
import { itemsValue, type CollectionItem } from '../lib/sets'
import { store, type PriceHistoryRow, type ValueSnapshot } from '../lib/store'
import type { Card } from '../lib/tcg'

type Cur = CurrencyMode
type Range = '7' | '30' | 'all'

const GREEN = '#34d399'
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA')

export function Value() {
  const mode = useCurrencyMode()
  const [cur, setCur] = useState<Cur>(mode)
  const [range, setRange] = useState<Range>('30')
  const { items, cards, isLoading, error } = useCollection()
  const snapshots = useSnapshots()
  const fmt = (n: number | null) => fmtIn(cur, n)

  const value = useMemo(() => itemsValue(items, cards), [items, cards])
  const total = inCurrency(cur, value.usd, value.eur) ?? 0

  const series = useMemo(() => {
    const snaps = [...(snapshots.data ?? [])]
    // Today's line always ends at the live total, even before the snapshot is written.
    const t = today()
    const live: ValueSnapshot = { taken_on: t, total_usd: value.usd, total_eur: value.eur, card_count: 0 }
    const merged = [...snaps.filter((s) => s.taken_on !== t), ...(items.length ? [live] : [])]
    const since = range === 'all' ? '' : daysAgo(Number(range))
    return merged.filter((s) => s.taken_on >= since).map((s) => ({ t: +new Date(s.taken_on + 'T00:00:00'), value: inCurrency(cur, Number(s.total_usd), Number(s.total_eur)) ?? 0 }))
  }, [snapshots.data, value, items.length, range, cur])

  const change = (n: number) => {
    const snaps = snapshots.data ?? []
    const base = [...snaps].reverse().find((s) => s.taken_on <= daysAgo(n))
    if (!base) return null
    return total - (inCurrency(cur, Number(base.total_usd), Number(base.total_eur)) ?? 0)
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

      <section
        className="relative overflow-hidden rounded-[26px] p-5 wide:p-7"
        style={{ background: 'linear-gradient(135deg,#2b1458 0%,#160c2b 60%,#0e0a1a 100%)', boxShadow: '0 0 0 1px rgba(167,139,250,.4), 0 10px 50px rgba(139,92,246,.35)' }}
      >
        <div className="pointer-events-none absolute -top-[70px] -right-[50px] h-60 w-60 rounded-full" style={{ background: 'radial-gradient(circle, rgba(167,139,250,.4), transparent 65%)' }} />
        <div className="flex flex-col gap-5 min-[600px]:flex-row min-[600px]:items-start min-[600px]:justify-between">
          <div>
            <div className="eyebrow !text-accent-2">Today</div>
            <div className="mt-1.5 text-[56px] leading-[.95] font-extrabold tracking-[-.05em]" style={{ textShadow: '0 0 28px rgba(196,181,253,.6)' }}>
              {value.priced ? fmt(total) : '—'}
            </div>
            <div className="mono mt-2.5 text-[12px] font-medium text-[#cbc4dd]">{value.priced ? otherCurrencies(cur, value.usd, value.eur) : 'No prices yet'}</div>
          </div>
          <div className="relative flex gap-2.5">
            <ChangeTile label="7 days" delta={change(7)} fmt={fmt} />
            <ChangeTile label="30 days" delta={change(30)} fmt={fmt} />
          </div>
        </div>

        <div className="mt-6 h-[240px] wide:h-[280px]" aria-label="Collection value over time">
          {series.length < 2 ? (
            <div className="relative grid h-full place-items-center rounded-2xl bg-white/5 p-6 text-center text-[14px] text-mute">
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
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  tick={{ fill: '#a59fb8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={(n: number) => CURRENCY_SYMBOL[cur] + (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n))}
                  tick={{ fill: '#a59fb8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: '#1a1428', color: '#f5f3fa', boxShadow: '0 8px 30px rgba(0,0,0,.4)', fontFamily: 'Sora', fontWeight: 600, fontSize: 13 }}
                  labelStyle={{ color: '#a59fb8', fontWeight: 500 }}
                  labelFormatter={(t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
                  formatter={(n: number) => [fmt(n), 'Value']}
                />
                <Area type="monotone" dataKey="value" stroke={GREEN} strokeWidth={2} fill="url(#valueFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#0b0912', fill: GREEN }}
                  style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,.6))' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="relative mt-4 flex justify-center">
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
    <PageHeader
      eyebrow="Trends"
      title="Value"
      right={
        <Segmented
        label="Currency"
        value={cur}
        onChange={setCur}
        options={[
          { value: 'gbp', label: 'GBP' },
          { value: 'usd', label: 'USD' },
          { value: 'eur', label: 'EUR' },
        ]}
      />
      }
    />
  )
}

/** The hero's second line: the total in the two currencies not shown above it. */
function otherCurrencies(cur: Cur, usd: number, eur: number) {
  const gbp = `approx ${fmtGbp(eurToGbp(eur || null))}`
  if (cur === 'gbp') return `${fmtEur(eur || null)} · ${fmtUsd(usd || null)}`
  if (cur === 'usd') return `${fmtEur(eur || null)} · ${gbp}`
  return `${fmtUsd(usd || null)} · ${gbp}`
}

function ChangeTile({ label, delta, fmt }: { label: string; delta: number | null; fmt: (n: number | null) => string }) {
  const up = (delta ?? 0) >= 0
  const color = delta === null ? '#a59fb8' : up ? '#6ee7b7' : '#f87171'
  return (
    <div
      className="min-w-[120px] rounded-[18px] px-4 py-3"
      style={{ background: delta === null ? 'rgba(255,255,255,.06)' : up ? 'rgba(52,211,153,.14)' : 'rgba(248,113,113,.14)' }}
    >
      <div className="mono text-[10.5px] font-semibold tracking-[.14em] text-mute uppercase">{label}</div>
      <div className="mt-1 text-[20px] font-bold tracking-tight" style={{ color }}>
        {delta === null ? '—' : `${up ? '▲' : '▼'} ${fmt(Math.abs(delta))}`}
      </div>
    </div>
  )
}

function StatTiles({ items, cards, cur, total }: { items: CollectionItem[]; cards: Map<string, Card>; cur: Cur; total: number }) {
  const fmt = (n: number | null) => fmtIn(cur, n)
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
      const v = inCurrency(cur, p?.usd, p?.eur) ?? 0
      if (v && (!priciest || v > priciest.value)) priciest = { card, value: v }
      if (i.variant !== 'normal') holo += v * i.quantity
      const prev = bySet.get(card.set.id) ?? { name: card.set.name, value: 0 }
      bySet.set(card.set.id, { name: prev.name, value: prev.value + v * i.quantity })
    }
    const best = [...bySet.entries()].sort((a, b) => b[1].value - a[1].value)[0]
    return { priciest, holo, best, average: copies ? total / copies : 0 }
  }, [items, cards, cur, total])

  return (
    <div className="grid grid-cols-2 gap-2.5 wide:grid-cols-4">
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
    <div className="tile flex min-w-0 flex-col gap-2 p-3.5">
      <span className="text-[12px] font-medium text-mute">{label}</span>
      <span className="truncate text-[24px] leading-none font-bold tracking-[-.03em]">{value}</span>
      <span className="truncate text-[11.5px] text-mute">{sub}</span>
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
  return inCurrency(cur, p?.usd, p?.eur)
}

function Movers({ items, cards, cur }: { items: CollectionItem[]; cards: Map<string, Card>; cur: Cur }) {
  const navigate = useNavigate()
  const fmt = (n: number | null) => fmtIn(cur, n)
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
      const nowV = inCurrency(cur, now?.usd, now?.eur)
      if (then === null || nowV === null) continue
      const delta = (nowV - then) * item.quantity
      if (Math.abs(delta) >= 0.01) out.push({ item, card, delta })
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)
  }, [history.data, items, cards, cur])

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[22px] font-bold tracking-[-.03em]">Biggest movers this week</h2>
      {history.isLoading ? (
        <Skeleton className="h-[200px]" />
      ) : movers.length === 0 ? (
        <Message title="Nothing has moved yet" body="Prices are checked each day you open the app. Changes will show up here after a few days." />
      ) : (
        <div className="flex flex-col gap-2">
          {movers.map(({ item, card, delta }) => (
            <button key={item.id} type="button" onClick={() => navigate(`/card/${card.id}`)} className="surface flex items-center gap-3.5 !rounded-[20px] p-2.5 pr-4 text-left transition-colors hover:border-accent">
              <Thumb card={card} width={46} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{card.name}</div>
                <div className="truncate text-[12.5px] text-mute">
                  {card.set.name} · {card.number} · {VARIANT_LABEL[item.variant]}
                </div>
              </div>
              <div className={`mono shrink-0 text-[13px] font-semibold ${delta >= 0 ? 'text-up' : 'text-down'}`}>
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
        <button type="button" className="btn mt-2" onClick={() => navigate('/add')}>
          Add a card
        </button>
      }
    />
  )
}
