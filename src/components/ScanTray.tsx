import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useCurrencyMode } from '../lib/money'
import { CONDITION_LABEL, CONDITIONS, displayPrice, priceFor, VARIANT_LABEL, variantsFor, type Condition } from '../lib/pricing'
import { keys, useCards } from '../lib/queries'
import type { CollectionItem } from '../lib/sets'
import { store } from '../lib/store'
import type { Card, Variant } from '../lib/tcg'
import { chosenCard, readyRows, undoSteps, type TrayItem } from '../lib/tray'
import { Thumb } from './cards'
import { IconCheck, IconPlus, IconX } from './icons'
import { useToast } from './Toast'
import { Modal } from './ui'

/** Add every tray card in one go; one Undo puts the whole batch back. */
export function useBatchAdd() {
  const qc = useQueryClient()
  const toast = useToast()
  return async (items: { card: Card; variant: Variant; condition: Condition; quantity: number }[]) => {
    const adds: { row: CollectionItem; quantity: number }[] = []
    for (const it of items) adds.push({ row: await store.addItem(it.card.id, it.variant, it.condition, it.quantity), quantity: it.quantity })
    await qc.invalidateQueries({ queryKey: keys.items })
    const copies = items.reduce((n, i) => n + i.quantity, 0)
    toast({
      text: `Added ${copies} ${copies === 1 ? 'card' : 'cards'}`,
      action: {
        label: 'Undo',
        onClick: async () => {
          for (const step of undoSteps(adds)) {
            if (step.left > 0) await store.updateItem(step.id, { quantity: step.left })
            else await store.deleteItem(step.id)
          }
          await qc.invalidateQueries({ queryKey: keys.items })
        },
      },
    })
  }
}

/** A snap that isn't a known card yet: its photo, with a spinner while it's recognised. */
function SnapThumb({ item, width }: { item: TrayItem; width: number }) {
  return (
    <div className="relative overflow-hidden rounded-[6px] bg-[var(--chip)]" style={{ width, aspectRatio: '63/88' }}>
      {item.photo && <img src={item.photo} alt="" className={`h-full w-full object-cover ${item.pending ? 'opacity-60' : ''}`} />}
      {item.pending && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </span>
      )}
    </div>
  )
}

/** The strip above the scan button: what's been snapped so far, newest first. */
export function TrayStrip({ tray, flashId, onReview }: { tray: TrayItem[]; flashId: string | null; onReview: () => void }) {
  if (!tray.length) return null
  const copies = readyRows(tray).reduce((n, t) => n + t.quantity, 0)
  const pending = tray.filter((t) => t.pending).length
  const toPick = tray.filter((t) => !t.chosen && !t.pending && !t.failed).length
  return (
    <div className="flex w-full max-w-[460px] items-center gap-3 rounded-[22px] bg-black/60 p-2 pr-2 backdrop-blur">
      <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {[...tray].reverse().map((t) => {
          // Until it's a known card, show the snap itself rather than a guess.
          const card = chosenCard(t)
          return (
            <div key={t.id} className={`relative flex-none ${t.id === flashId ? 'animate-pop' : ''}`}>
              {card ? <Thumb card={card} width={36} /> : <SnapThumb item={t} width={36} />}
              {!t.chosen && !t.pending && (
                <span className={`absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-white ${t.failed ? 'bg-down' : 'bg-[#f472b6]'}`}>{t.failed ? '!' : '?'}</span>
              )}
              {t.quantity > 1 && <span className="mono absolute -right-1 -bottom-1 rounded-full bg-sel px-1 text-[9px] font-bold text-white">×{t.quantity}</span>}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={onReview} className="btn flex-none !min-h-11 !px-4 !text-[14px]">
        Review {copies || ''}
        {pending > 0 && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label={`${pending} scanning`} />}
        {toPick > 0 && <span className="rounded-full bg-[#f472b6] px-1.5 text-[11px]">{toPick} ?</span>}
      </button>
    </div>
  )
}

/** Check the tray, fix versions/conditions/counts, pick the unsure ones, then add them all. */
export function ReviewSheet({ tray, onChange, onClose, onAdded }: { tray: TrayItem[]; onChange: (tray: TrayItem[]) => void; onClose: () => void; onAdded: () => void }) {
  const batchAdd = useBatchAdd()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  // Scans come from search results; load the full cards for accurate versions and prices.
  const ids = useMemo(() => tray.flatMap((t) => (t.chosen ? [t.chosen] : [])), [tray])
  const full = useCards(ids)
  const fullCard = (c: Card) => full.data?.get(c.id) ?? c

  const update = (id: string, patch: Partial<TrayItem>) => onChange(tray.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const remove = (id: string) => onChange(tray.filter((t) => t.id !== id))
  const ready = readyRows(tray)
  const pending = tray.filter((t) => t.pending).length
  const failed = tray.filter((t) => t.failed).length
  const toPick = tray.filter((t) => !t.chosen && !t.pending && !t.failed).length
  const copies = ready.reduce((n, t) => n + t.quantity, 0)

  async function addAll() {
    setBusy(true)
    setError(false)
    try {
      await batchAdd(
        // Snaps that couldn't be recognised are left out.
        ready.map((t) => {
          const card = fullCard(chosenCard(t)!)
          // Keep the chosen version valid for the full card.
          const variant = variantsFor(card).includes(t.variant) ? t.variant : variantsFor(card)[0]
          return { card, variant, condition: t.condition, quantity: t.quantity }
        }),
      )
      onAdded()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Review scanned cards">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4 pl-5">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight">
            {copies} scanned {copies === 1 ? 'card' : 'cards'}
          </h2>
          <div className="text-[12.5px] text-mute">
            {pending ? `Still scanning ${pending}…` : toPick ? `${toPick} to pick, tap the right one` : 'Check them, then add them all'}
          </div>
        </div>
        <button type="button" aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-mute hover:bg-[var(--chip)]" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-2.5 overflow-y-auto p-4">
        {tray.map((t) =>
          t.pending || t.failed ? (
            <SnapRow key={t.id} item={t} onRemove={() => remove(t.id)} />
          ) : t.chosen ? (
            <PickedRow key={t.id} item={t} card={fullCard(chosenCard(t)!)} onChange={(patch) => update(t.id, patch)} onRemove={() => remove(t.id)} />
          ) : (
            <PickRow key={t.id} item={t} onPick={(card) => update(t.id, { chosen: card.id, variant: variantsFor(card)[0] })} onRemove={() => remove(t.id)} />
          ),
        )}
        {tray.length === 0 && <p className="py-6 text-center text-mute">Nothing in the tray.</p>}
      </div>
      <div className="flex flex-col gap-2 border-t border-[var(--line)] p-4">
        {error && <p className="text-[13px] font-semibold text-down">Couldn't add them. Check your connection and try again.</p>}
        {failed > 0 && !pending && !toPick && <p className="text-center text-[12.5px] text-mute">Cards that couldn't be recognised won't be added.</p>}
        <button type="button" className="cta w-full" disabled={busy || !ready.length || toPick > 0 || pending > 0} onClick={addAll}>
          <IconPlus size={18} strokeWidth={2.6} /> {pending > 0 ? `Scanning ${pending}…` : toPick > 0 ? `Pick ${toPick} first` : busy ? 'Adding…' : copies === 1 ? 'Add 1 card' : `Add all ${copies}`}
        </button>
      </div>
    </Modal>
  )
}

function PickedRow({ item, card, onChange, onRemove }: { item: TrayItem; card: Card; onChange: (p: Partial<TrayItem>) => void; onRemove: () => void }) {
  const currency = useCurrencyMode()
  const variants = variantsFor(card)
  const variant = variants.includes(item.variant) ? item.variant : variants[0]
  const price = priceFor(card, variant, item.condition)
  return (
    <div className="surface flex gap-3 !rounded-[18px] p-2.5">
      <Thumb card={card} width={52} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{card.name}</div>
            <div className="truncate text-[12px] text-mute">
              {card.set.name} · {card.number} · <span className="mono text-up">{displayPrice(currency, price?.usd, price?.eur)}</span>
            </div>
          </div>
          <button type="button" aria-label={`Remove ${card.name}`} className="grid h-8 w-8 flex-none place-items-center rounded-full text-mute hover:bg-[var(--chip)]" onClick={onRemove}>
            <IconX size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {variants.map((v) => (
            <button key={v} type="button" aria-pressed={variant === v} className="opt rounded-full! px-2.5 py-1 text-[12px] font-semibold" onClick={() => onChange({ variant: v })}>
              {VARIANT_LABEL[v]}
            </button>
          ))}
          <select
            value={item.condition}
            onChange={(e) => onChange({ condition: e.target.value as Condition })}
            className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-[12px] font-semibold text-ink outline-none"
            aria-label="Condition"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--chip)] p-0.5">
            <button type="button" aria-label="One fewer" className="grid h-7 w-7 place-items-center rounded-full disabled:opacity-35" disabled={item.quantity <= 1} onClick={() => onChange({ quantity: item.quantity - 1 })}>
              −
            </button>
            <span className="mono w-5 text-center text-[13px] font-semibold">{item.quantity}</span>
            <button type="button" aria-label="One more" className="grid h-7 w-7 place-items-center rounded-full bg-[var(--surface-2)]" onClick={() => onChange({ quantity: item.quantity + 1 })}>
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PickRow({ item, onPick, onRemove }: { item: TrayItem; onPick: (c: Card) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-[rgba(244,114,182,.4)] p-2.5" style={{ boxShadow: '0 0 18px rgba(244,114,182,.1)' }}>
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#f9a8d4]">
          {item.photo && <img src={item.photo} alt="Your snap" className="aspect-[63/88] w-9 rounded-[5px] object-cover" />}
          Which one is it?
        </span>
        <button type="button" aria-label="Remove" className="grid h-8 w-8 place-items-center rounded-full text-mute hover:bg-[var(--chip)]" onClick={onRemove}>
          <IconX size={16} />
        </button>
      </div>
      {item.options.map((c) => (
        <button key={c.id} type="button" onClick={() => onPick(c)} className="flex items-center gap-3 rounded-[14px] bg-[var(--chip)] p-2 text-left hover:bg-[var(--surface-2)]">
          <Thumb card={c} width={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{c.name}</div>
            <div className="truncate text-[12px] text-mute">
              {c.set.name} · {c.number}
            </div>
          </div>
          <IconCheck size={18} className="text-mute" />
        </button>
      ))}
    </div>
  )
}

function SnapRow({ item, onRemove }: { item: TrayItem; onRemove: () => void }) {
  return (
    <div className={`surface flex items-center gap-3 !rounded-[18px] p-2.5 ${item.failed ? '!border-[rgba(248,113,113,.4)]' : ''}`}>
      <SnapThumb item={item} width={52} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{item.pending ? 'Scanning…' : "Couldn't recognise this one"}</div>
        <div className="text-[12px] text-mute">{item.pending ? 'This takes a second or two' : 'Snap it again, or add it from search'}</div>
      </div>
      <button type="button" aria-label="Remove" className="grid h-8 w-8 flex-none place-items-center rounded-full text-mute hover:bg-[var(--chip)]" onClick={onRemove}>
        <IconX size={16} />
      </button>
    </div>
  )
}
