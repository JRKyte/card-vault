import { useState } from 'react'
import { variantsFor } from '../lib/pricing'
import type { SetSummary } from '../lib/summaries'
import type { Card } from '../lib/tcg'
import { AddFields, useAddCard, type AddFieldsValue } from './AddForm'
import { Thumb } from './cards'
import { IconPlus, IconX } from './icons'
import { Modal } from './ui'

/** Drawer for adding a card straight from a grid, without opening the card screen. */
export function QuickAddSheet({ card, onClose, onAdded }: { card: Card; onClose: () => void; onAdded: (card: Card, completed: SetSummary | null) => void }) {
  const [value, setValue] = useState<AddFieldsValue>({ variant: variantsFor(card)[0], condition: 'near_mint', quantity: 1 })
  const { add, isPending, isError } = useAddCard(card)

  return (
    <Modal onClose={onClose} title={`Add ${card.name}`}>
      <div className="flex items-center gap-3.5 border-b border-[var(--line)] p-4 pr-3">
        <Thumb card={card} width={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold tracking-tight">{card.name}</div>
          <div className="truncate text-[12.5px] text-mute">
            {card.set.name} · {card.number}
            {card.rarity && ` · ${card.rarity}`}
          </div>
        </div>
        <button type="button" aria-label="Close" className="grid h-10 w-10 flex-none place-items-center rounded-full text-mute hover:bg-[var(--chip)]" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto p-5">
        <AddFields card={card} value={value} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />
        <button
          type="button"
          className="cta w-full"
          disabled={isPending}
          onClick={() =>
            add(value, (completed) => {
              onAdded(card, completed)
              onClose()
            })
          }
        >
          <IconPlus size={18} strokeWidth={2.6} /> Add to my collection
        </button>
        {isError && <p className="text-[13px] font-semibold text-down">Couldn't save that. Check your connection and try again.</p>}
      </div>
    </Modal>
  )
}
