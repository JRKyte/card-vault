import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CardImage } from '../components/cards'
import { Burst, MasteredCelebration, useCountUp } from '../components/Celebrate'
import { IconPlus } from '../components/icons'
import { BackPill, Chip, ErrorMessage, Screen, Skeleton, StatusPill, tint, TopRow } from '../components/ui'
import { typeAccent } from '../data/type-colors'
import { alpha } from '../lib/color'
import { useCurrencyMode } from '../lib/money'
import { CONDITION_LABEL, CONDITIONS, displayPrice, ebaySoldGbp, fmtGbp, priceFor, VARIANT_LABEL, variantsFor, type Condition } from '../lib/pricing'
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
  const back = <BackPill label={from ? from.name : mode === 'add' ? 'Results' : 'Back'} fallback={from?.href ?? (mode === 'add' ? '/add' : '/')} />

  if (card.isLoading) {
    return (
      <Screen>
        <TopRow left={back} />
        <div className="flex flex-col items-center gap-5">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="aspect-[63/88] w-full max-w-[300px]" />
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

const copyLabel = (i: CollectionItem) => `${VARIANT_LABEL[i.variant]} · ${CONDITION_LABEL[i.condition]}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`

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

  // Edit mode works on one owned row at a time.
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = mode === 'edit' ? (mine.find((i) => i.id === editingId) ?? mine[0]) : undefined

  const [variant, setVariant] = useState<Variant>(variants[0])
  const [condition, setCondition] = useState<Condition>('near_mint')
  const [qty, setQty] = useState(1)

  const add = useAddItem()
  const update = useUpdateItem()
  const remove = useDeleteItem()

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
  const n = current.quantity
  const total = displayPrice(currency, each?.usd != null ? each.usd * n : null, each?.eur != null ? each.eur * n : null)
  const unit = displayPrice(currency, each?.usd, each?.eur)
  const note = n > 1 ? `${n} × ${unit}` : `${CONDITION_LABEL[current.condition]} · ${VARIANT_LABEL[current.variant]}`
  const ebay = ebaySoldGbp(card)

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

  const setVariantFor = (v: Variant) => (editing ? update.mutate({ id: editing.id, patch: { variant: v } }) : setVariant(v))
  const setConditionFor = (c: Condition) => (editing ? update.mutate({ id: editing.id, patch: { condition: c } }) : setCondition(c))
  const setQtyFor = (q: number) => (editing ? update.mutate({ id: editing.id, patch: { quantity: q } }) : setQty(q))

  return (
    <Screen glow={accent}>
      <TopRow
        left={back}
        right={
          have ? <StatusPill dot="#34d399">You have {have}</StatusPill> : <StatusPill>You don't have this one yet</StatusPill>
        }
      />

      <div className="flex flex-wrap items-start justify-center gap-7 wide:items-center">
        {/* Title + card */}
        <div className="flex max-w-[560px] flex-[1_1_360px] flex-col items-center gap-3.5">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h1 className="text-[40px] leading-none font-extrabold tracking-[-.04em]">{card.name}</h1>
            <span className="text-[13px] font-medium text-mute">
              {card.set.name} · {card.number}
              {card.set.printedTotal ? `/${card.set.printedTotal}` : ''}
              {card.rarity && ` · ${card.rarity}`}
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
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
          <div className="relative mt-2.5 w-full max-w-[360px]">
            {burstKey > 0 && <Burst key={burstKey} colors={[accent, '#a78bfa', '#f472b6', ...cardSets.slice(0, 1).map((s) => s.color)]} />}
            <div key={burstKey} className={`relative z-10 ${burstKey ? 'animate-pop' : ''}`}>
              <div className="transition-transform duration-[350ms] hover:scale-[1.02] hover:-rotate-[1.5deg]">
                <CardImage
                  card={card}
                  size="large"
                  rounded={16}
                  style={{ boxShadow: `0 0 0 1px ${alpha(accent, 0.55)}, 0 24px 60px ${alpha(accent, 0.3)}, 0 0 110px ${alpha(accent, 0.25)}` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex max-w-[560px] min-w-0 flex-[1_1_380px] flex-col gap-3.5">
          {mode === 'edit' && mine.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {mine.map((i) => (
                <button key={i.id} type="button" aria-pressed={editing?.id === i.id} className="opt rounded-full! px-3.5 py-2 text-[13px] font-semibold" onClick={() => setEditingId(i.id)}>
                  {copyLabel(i)}
                </button>
              ))}
            </div>
          )}

          <div className="surface flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Which version?</span>
              <div className="grid grid-cols-3 gap-2">
                {variants.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={current.variant === v}
                    onClick={() => setVariantFor(v)}
                    className="opt flex min-w-0 flex-col items-start gap-1 px-2.5 py-3 text-left"
                  >
                    <span className="truncate text-[14px] font-semibold">{VARIANT_LABEL[v]}</span>
                    <span className="mono text-[11px] font-medium opacity-70">{displayPrice(currency, priceFor(card, v, 'near_mint')?.usd, priceFor(card, v, 'near_mint')?.eur)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="eyebrow">Condition</span>
              <div className="grid grid-cols-2 gap-2">
                {CONDITIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={current.condition === c}
                    onClick={() => setConditionFor(c)}
                    className="opt px-3.5 py-[13px] text-left text-[14px] font-semibold"
                  >
                    {CONDITION_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-2.5">
                <span className="eyebrow">How many?</span>
                <Stepper value={n} onChange={setQtyFor} />
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right">
                <span className="eyebrow">Current price</span>
                <span className="text-[28px] leading-none font-extrabold tracking-[-.03em] text-up" style={{ textShadow: '0 0 18px rgba(52,211,153,.5)' }}>
                  {total}
                </span>
                <span className="mono text-[11px] font-medium text-mute">{note}</span>
                {ebay !== null && <span className="mono text-[11px] font-medium text-mute">eBay sold {fmtGbp(ebay)}</span>}
              </div>
            </div>
          </div>

          {mode === 'add' ? (
            <button type="button" className="cta w-full" onClick={doAdd} disabled={add.isPending}>
              <IconPlus size={18} strokeWidth={2.6} /> {have ? 'Add another' : 'Add to my collection'}
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={`/add/${card.id}`} className="chip-btn">
                <IconPlus size={16} /> Add another kind
              </Link>
              {editing && (
                <button
                  type="button"
                  className="min-h-10 px-2 text-[13px] font-semibold text-down underline underline-offset-4"
                  onClick={() => {
                    if (confirm(`Remove ${copyLabel(editing)} from your collection?`)) remove.mutate(editing.id)
                  }}
                >
                  Remove from collection
                </button>
              )}
            </div>
          )}
          {add.isError && <p className="text-[13px] font-semibold text-down">Couldn't save that. Check your connection and try again.</p>}

          {cardSets.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {cardSets.map((s) => (
                <SetPill key={s.key} set={s} />
              ))}
            </div>
          )}
        </div>
      </div>

      {mastered && <MasteredCelebration setName={mastered.name} colors={[mastered.color, accent, '#a78bfa', '#f472b6', '#fef3c7']} onDone={() => setMastered(null)} />}
    </Screen>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--chip)] p-1">
      <button
        type="button"
        aria-label="One fewer"
        className="grid h-11 w-11 place-items-center rounded-full text-[20px] transition-opacity"
        style={{ opacity: value > 1 ? 1 : 0.35 }}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="mono min-w-7 text-center text-[18px] font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="One more"
        className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] text-[20px]"
        style={{ boxShadow: '0 0 0 1px var(--line)' }}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

/** "Set → N of M". Official sets are neutral, custom sets tinted in their colour; counts up after an add. */
function SetPill({ set }: { set: SetSummary }) {
  const owned = useCountUp(set.progress.owned)
  const custom = set.kind !== 'official'
  return (
    <Link
      to={set.href}
      className="rounded-full border px-[13px] py-2 text-[12px] tabular-nums"
      style={
        custom
          ? { background: alpha(set.color, 0.12), borderColor: alpha(set.color, 0.3), color: tint(set.color), fontWeight: 600 }
          : { background: 'var(--chip)', borderColor: 'var(--line)', color: 'var(--color-mute)', fontWeight: 500 }
      }
    >
      {set.name} → {Math.round(owned)} of {set.progress.total}
    </Link>
  )
}
