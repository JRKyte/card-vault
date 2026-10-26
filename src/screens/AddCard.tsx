import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CardImage } from '../components/cards'
import { Burst, MasteredCelebration, useCountUp } from '../components/Celebrate'
import { IconMinus, IconPlus } from '../components/icons'
import { BackPill, Chip, ErrorMessage, Screen, Skeleton, TopRow } from '../components/ui'
import { typeAccent, typeTint } from '../data/type-colors'
import { alpha, washFor } from '../lib/color'
import { mainMoney, useCurrencyMode } from '../lib/money'
import {
  CONDITION_LABEL,
  CONDITIONS,
  ebaySoldGbp,
  fmtGbp,
  fmtUsd,
  fmtEur,
  priceFor,
  VARIANT_LABEL,
  variantsFor,
  type Condition,
} from '../lib/pricing'
import { useAddItem, useCard, useCollection, useCustomMembership, useCustomSets, useDeleteItem, useSets, useUpdateItem } from '../lib/queries'
import type { CollectionItem } from '../lib/sets'
import { setsForCard, type SetSummary } from '../lib/summaries'
import type { Card, Variant } from '../lib/tcg'

interface FromState {
  from?: { name: string; href: string }
}

export function AddCard({ mode }: { mode: 'add' | 'edit' }) {
  const { cardId = '' } = useParams()
  const card = useCard(cardId)
  const location = useLocation()
  const from = (location.state as FromState | null)?.from
  const back = <BackPill label={from ? `Back to ${from.name}` : mode === 'add' ? 'Results' : 'Back'} fallback={from?.href ?? (mode === 'add' ? '/add' : '/')} />

  if (card.isLoading) {
    return (
      <Screen>
        <TopRow left={back} />
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="aspect-[63/88] w-[300px]" />
        </div>
      </Screen>
    )
  }
  if (!card.data) {
    return (
      <Screen>
        <TopRow left={back} />
        <ErrorMessage error={card.error} retry={() => card.refetch()} />
      </Screen>
    )
  }
  return <CardScreen card={card.data} mode={mode} back={back} />
}

function CardScreen({ card, mode, back }: { card: Card; mode: 'add' | 'edit'; back: React.ReactNode }) {
  const navigate = useNavigate()
  const { items, cards, owned } = useCollection()
  const sets = useSets()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  const currency = useCurrencyMode()

  const mine = useMemo(() => items.filter((i) => i.card_id === card.id), [items, card.id])
  const have = mine.reduce((n, i) => n + i.quantity, 0)
  const variants = variantsFor(card)
  const accent = typeAccent(card)
  const tint = typeTint(card)

  // Edit mode works on one owned row at a time.
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = mode === 'edit' ? (mine.find((i) => i.id === editingId) ?? mine[0]) : undefined

  const [variant, setVariant] = useState<Variant>(variants[0])
  const [condition, setCondition] = useState<Condition>('near_mint')
  const [qty, setQty] = useState(1)

  const add = useAddItem()
  const update = useUpdateItem()
  const remove = useDeleteItem()

  // Celebration state.
  const [burstKey, setBurstKey] = useState(0)
  const [mastered, setMastered] = useState<SetSummary | null>(null)

  const cardSets = useMemo(
    () => setsForCard(card, sets.data, customSets.data, membership.members, items, cards, owned),
    [card, sets.data, customSets.data, membership.members, items, cards, owned],
  )

  // Edit mode with nothing owned (e.g. just removed): go to the add screen instead.
  useEffect(() => {
    if (mode === 'edit' && !mine.length && !remove.isPending) navigate(`/add/${card.id}`, { replace: true })
  }, [mode, mine.length, remove.isPending, navigate, card.id])

  const current = editing ?? { variant, condition, quantity: qty }
  const each = priceFor(card, current.variant, current.condition)
  const addedValue = each ? (currency === 'eur' ? each.eur : each.usd) : null

  function doAdd() {
    const before = cardSets
    const wasOwned = owned.has(card.id)
    add.mutate(
      { card, variant, condition, quantity: qty },
      {
        onSuccess: () => {
          setBurstKey((k) => k + 1)
          setQty(1)
          if (!wasOwned) {
            const done = before.find((s) => s.progress.total > 0 && s.progress.owned + 1 === s.progress.total)
            if (done) setMastered(done)
          }
        },
      },
    )
  }

  const optionsCls = 'flex flex-col gap-2 wide:flex-row wide:flex-wrap'
  const optionBtn = (active: boolean) =>
    `min-h-12 rounded-2xl px-4 text-left text-[16px] font-semibold transition-colors wide:rounded-full wide:text-center ${active ? 'bg-ink text-white' : 'bg-white/70 text-ink'}`

  const panel = (
    <div className="glass grid grid-cols-1 gap-5 p-5 min-[600px]:grid-cols-3 wide:grid-cols-1 wide:gap-4">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[15px] font-bold text-ink-2">Which kind?</legend>
        <div className={optionsCls}>
          {variants.map((v) => {
            const p = priceFor(card, v, current.condition)
            const active = current.variant === v
            return (
              <button
                key={v}
                type="button"
                aria-pressed={active}
                className={optionBtn(active)}
                onClick={() => (editing ? update.mutate({ id: editing.id, patch: { variant: v } }) : setVariant(v))}
              >
                {VARIANT_LABEL[v]} · {p ? (currency === 'eur' ? fmtEur(p.eur) : fmtUsd(p.usd)) : '—'}
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[15px] font-bold text-ink-2">Condition</legend>
        <div className={optionsCls}>
          {CONDITIONS.map((c) => {
            const active = current.condition === c
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                className={optionBtn(active)}
                onClick={() => (editing ? update.mutate({ id: editing.id, patch: { condition: c } }) : setCondition(c))}
              >
                {CONDITION_LABEL[c]}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex min-w-0 flex-col gap-3 wide:flex-row wide:items-center wide:justify-between">
        <div>
          <div className="mb-2 text-[15px] font-bold text-ink-2">How many?</div>
          <Stepper
            value={current.quantity}
            onChange={(n) => (editing ? update.mutate({ id: editing.id, patch: { quantity: n } }) : setQty(n))}
          />
        </div>
        <EbayLine card={card} />
      </div>
    </div>
  )

  const summaryPills = (
    <div className="flex flex-wrap justify-center gap-2 wide:justify-start">
      {mode === 'add' && <MoneyPill value={addedValue} qty={qty} burst={burstKey} currency={currency} />}
      {cardSets.slice(0, 2).map((s) => (
        <SetPill key={s.key} set={s} />
      ))}
      {cardSets.length > 2 && <span className="glass pill text-[15px] text-ink-2">+{cardSets.length - 2} more</span>}
    </div>
  )

  return (
    <Screen wash={washFor(accent)}>
      <TopRow left={back} right={<span className="glass pill text-[15px]">{have ? `You have ${have}` : "You don't have this one yet"}</span>} />

      <div className="flex flex-col gap-6 wide:min-h-[calc(100dvh-220px)] wide:flex-row wide:items-center wide:gap-12">
        <div className="text-center wide:hidden">
          <Title card={card} accent={accent} />
        </div>

        <div className="relative mx-auto w-[300px] shrink-0 wide:mx-0 wide:w-[360px]">
          {burstKey > 0 && <Burst key={burstKey} colors={[accent, tint[1], ...cardSets.slice(0, 1).map((s) => s.color)]} />}
          <div key={burstKey} className={`relative z-10 ${burstKey ? 'animate-pop' : ''}`}>
            <CardImage card={card} size="large" rounded={18} style={{ boxShadow: `0 30px 60px ${alpha(accent, 0.35)}, 0 8px 18px rgba(21,23,43,0.12)` }} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="hidden wide:block">
            <Title card={card} accent={accent} />
          </div>

          {mode === 'edit' && mine.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {mine.map((i) => (
                <button key={i.id} type="button" className={`pill text-[15px] ${editing?.id === i.id ? 'bg-ink text-white' : 'glass'}`} onClick={() => setEditingId(i.id)}>
                  {copyLabel(i)}
                </button>
              ))}
            </div>
          )}

          {panel}

          {mode === 'add' ? (
            <div className="flex flex-col gap-4 wide:flex-row wide:items-center">
              <button type="button" className="btn-dark w-full wide:w-auto wide:shrink-0" onClick={doAdd} disabled={add.isPending}>
                <IconPlus /> {have ? 'Add another' : 'Add to my collection'}
              </button>
              {summaryPills}
            </div>
          ) : (
            <>
              {cardSets.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 wide:justify-start">
                  <span className="text-[15px] font-bold text-ink-2">Counts towards</span>
                  {cardSets.map((s) => (
                    <SetPill key={s.key} set={s} />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link to={`/add/${card.id}`} className="glass pill text-[15px]">
                  <IconPlus size={18} /> Add another kind
                </Link>
                {editing && (
                  <button
                    type="button"
                    className="min-h-11 px-2 text-[15px] font-semibold text-down underline underline-offset-4"
                    onClick={() => {
                      if (confirm(`Remove ${copyLabel(editing)} from your collection?`)) remove.mutate(editing.id)
                    }}
                  >
                    Remove from collection
                  </button>
                )}
              </div>
            </>
          )}
          {add.isError && <p className="text-[15px] font-semibold text-down">Couldn't save that. Check your connection and try again.</p>}
        </div>
      </div>

      {mastered && <MasteredCelebration setName={mastered.name} colors={[mastered.color, accent, '#15172B', '#FFFFFF']} onDone={() => setMastered(null)} />}
    </Screen>
  )
}

const copyLabel = (i: CollectionItem) => `${VARIANT_LABEL[i.variant]} · ${CONDITION_LABEL[i.condition]}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`

function Title({ card, accent }: { card: Card; accent: string }) {
  return (
    <>
      <h1 className="text-[38px] leading-tight font-extrabold tracking-tight wide:text-[46px]">{card.name}</h1>
      <p className="mt-1 text-[17px] font-semibold text-ink-2">
        {card.set.name} · {card.number}
        {card.set.printedTotal ? `/${card.set.printedTotal}` : ''}
        {card.rarity && ` · ${card.rarity}`}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2 wide:justify-start">
        {(card.types ?? [card.supertype]).map((t) => (
          <Chip key={t} color={accent}>
            {t}
          </Chip>
        ))}
        {(card.subtypes ?? []).map((t) => (
          <Chip key={t} color={accent}>
            {t}
          </Chip>
        ))}
        {card.hp && <Chip color={accent}>HP {card.hp}</Chip>}
      </div>
    </>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="One fewer" className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 text-ink disabled:opacity-40" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <IconMinus />
      </button>
      <span className="w-10 text-center text-[30px] font-extrabold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="One more" className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 text-ink" onClick={() => onChange(value + 1)}>
        <IconPlus />
      </button>
    </div>
  )
}

function EbayLine({ card }: { card: Card }) {
  const gbp = ebaySoldGbp(card)
  return <p className="text-[14px] font-semibold text-ink-2">{gbp === null ? 'Sold prices not available' : `Recently sold on eBay: ${fmtGbp(gbp)}`}</p>
}

function MoneyPill({ value, qty, burst, currency }: { value: number | null; qty: number; burst: number; currency: 'both' | 'usd' | 'eur' }) {
  // After an add, count up from zero to the amount just added.
  const [target, setTarget] = useState<number | null>(null)
  useEffect(() => {
    if (!burst) return
    setTarget(0)
    const t = requestAnimationFrame(() => setTarget(null))
    return () => cancelAnimationFrame(t)
  }, [burst])
  const total = value === null ? null : value * qty
  const shown = useCountUp(target ?? total ?? 0)
  if (total === null) return <span className="glass pill text-[15px] text-ink-2">No price yet</span>
  return (
    <span className="glass pill text-[15px] text-up tabular-nums">
      + {mainMoney(currency === 'eur' ? 'eur' : 'usd', shown, shown)} to your total
    </span>
  )
}

function SetPill({ set }: { set: SetSummary }) {
  const owned = useCountUp(set.progress.owned)
  return (
    <Link to={set.href} className="glass pill text-[15px] tabular-nums" style={{ color: set.color }}>
      {set.name} → {Math.round(owned)} of {set.progress.total}
    </Link>
  )
}
