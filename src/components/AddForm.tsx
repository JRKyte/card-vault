// The add-to-collection form, shared by the card screen and the quick-add drawer.

import { useMemo } from 'react'
import { useCurrencyMode } from '../lib/money'
import { CONDITION_LABEL, CONDITIONS, displayPrice, ebaySoldGbp, fmtGbp, priceFor, VARIANT_LABEL, variantsFor, type Condition } from '../lib/pricing'
import { useAddItem, useCollection, useCustomMembership, useCustomSets, useDeleteItem, useSets, useUpdateItem } from '../lib/queries'
import { setsForCard, type SetSummary } from '../lib/summaries'
import type { Card, Variant } from '../lib/tcg'
import { useToast } from './Toast'

export interface AddFieldsValue {
  variant: Variant
  condition: Condition
  quantity: number
}

/** Which version, condition, how many, and the current price for that choice. */
export function AddFields({ card, value, onChange }: { card: Card; value: AddFieldsValue; onChange: (patch: Partial<AddFieldsValue>) => void }) {
  const currency = useCurrencyMode()
  const each = priceFor(card, value.variant, value.condition)
  const n = value.quantity
  const total = displayPrice(currency, each?.usd != null ? each.usd * n : null, each?.eur != null ? each.eur * n : null)
  const unit = displayPrice(currency, each?.usd, each?.eur)
  const note = n > 1 ? `${n} × ${unit}` : `${CONDITION_LABEL[value.condition]} · ${VARIANT_LABEL[value.variant]}`
  const ebay = ebaySoldGbp(card)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <span className="eyebrow">Which version?</span>
        <div className="grid grid-cols-3 gap-2">
          {variantsFor(card).map((v) => {
            const nm = priceFor(card, v, 'near_mint')
            return (
              <button
                key={v}
                type="button"
                aria-pressed={value.variant === v}
                onClick={() => onChange({ variant: v })}
                className="opt flex min-w-0 flex-col items-start gap-1 px-2.5 py-3 text-left"
              >
                <span className="truncate text-[14px] font-semibold">{VARIANT_LABEL[v]}</span>
                <span className="mono text-[11px] font-medium opacity-70">{displayPrice(currency, nm?.usd, nm?.eur)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="eyebrow">Condition</span>
        <div className="grid grid-cols-2 gap-2">
          {CONDITIONS.map((c) => (
            <button key={c} type="button" aria-pressed={value.condition === c} onClick={() => onChange({ condition: c })} className="opt px-3.5 py-[13px] text-left text-[14px] font-semibold">
              {CONDITION_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow">How many?</span>
          <Stepper value={n} onChange={(q) => onChange({ quantity: q })} />
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

/**
 * Adding a card: the sets it counts towards, and an add() that reports which set (if any) the
 * add just completed, so the caller can celebrate. Every add shows an "Added · Undo" toast.
 */
export function useAddCard(card: Card) {
  const { items, cards, owned } = useCollection()
  const sets = useSets()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  const mutation = useAddItem()
  const update = useUpdateItem()
  const remove = useDeleteItem()
  const toast = useToast()

  const cardSets = useMemo(
    () => setsForCard(card, sets.data, customSets.data, membership.members, items, cards, owned),
    [card, sets.data, customSets.data, membership.members, items, cards, owned],
  )

  function add(value: AddFieldsValue, onDone?: (completed: SetSummary | null) => void) {
    const wasOwned = owned.has(card.id)
    const before = cardSets
    mutation.mutate(
      { card, ...value },
      {
        onSuccess: (row) => {
          const completed = wasOwned ? null : (before.find((s) => s.progress.total > 0 && s.progress.owned + 1 === s.progress.total) ?? null)
          onDone?.(completed)
          toast({
            text: value.quantity > 1 ? `Added ${value.quantity} × ${card.name}` : `Added ${card.name}`,
            action: {
              label: 'Undo',
              // Take back exactly what was added: drop the row if it was new, else lower the count.
              onClick: () => {
                const left = row.quantity - value.quantity
                if (left > 0) update.mutate({ id: row.id, patch: { quantity: left } })
                else remove.mutate(row.id)
              },
            },
          })
        },
      },
    )
  }

  return { cardSets, add, isPending: mutation.isPending, isError: mutation.isError }
}
