import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Thumb } from '../components/cards'
import { IconCheck, IconHand, IconWand, IconX } from '../components/icons'
import { BackPill, ErrorMessage, Message, Screen, Skeleton, TopRow } from '../components/ui'
import { CUSTOM_SET_SWATCHES } from '../data/set-colors'
import { runSmartQuery, smartQueryFor, termFromQuery } from '../lib/cards'
import { alpha, washFor } from '../lib/color'
import { clearDraft, loadDraft, saveDraft, type Draft } from '../lib/draft'
import { useCurrencyMode } from '../lib/money'
import { bestEur, bestUsd, displayPrice } from '../lib/pricing'
import { useCards, useCollection, useCreateCustomSet, useCustomMembership, useCustomSets, useDeleteCustomSet, useUpdateCustomSet } from '../lib/queries'
import type { Exclusions } from '../lib/sets'
import type { CustomSet } from '../lib/store'
import type { Card } from '../lib/tcg'

const DEFAULT_EXCLUSIONS: Exclusions = { promos: true, beforeYear: 2020, secretRares: false, trainers: false }

const blankDraft = (): Draft => ({ name: '', color: CUSTOM_SET_SWATCHES[0].hex, kind: 'smart', term: '', exclusions: DEFAULT_EXCLUSIONS, cards: [] })

export function CustomSetEditor() {
  const { id } = useParams()
  const customSets = useCustomSets()
  if (!id) return <Editor initial={loadDraft() ?? blankDraft()} />
  if (customSets.isLoading) {
    return (
      <Screen>
        <Skeleton className="h-[300px]" />
      </Screen>
    )
  }
  const set = customSets.data?.find((s) => s.id === id)
  if (!set) {
    return (
      <Screen>
        <TopRow left={<BackPill label="Sets" to="/" />} />
        <Message title="Set not found" />
      </Screen>
    )
  }
  return (
    <Editor
      key={set.id}
      editId={set.id}
      initial={{ name: set.name, color: set.color, kind: set.kind, term: termFromQuery(set.query), exclusions: { ...DEFAULT_EXCLUSIONS, ...(set.exclusions ?? {}) }, cards: [] }}
      original={set}
    />
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Editor({ initial, editId, original }: { initial: Draft; editId?: string; original?: CustomSet }) {
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(initial)
  const update = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const create = useCreateCustomSet()
  const save = useUpdateCustomSet()
  const del = useDeleteCustomSet()
  const membership = useCustomMembership()

  // Keep the new-set form alive across the trip to the search screen.
  useEffect(() => {
    if (!editId) saveDraft(d)
  }, [d, editId])

  const query = d.kind === 'smart' ? smartQueryFor(d.term) : null
  const debouncedQuery = useDebounced(query, 400)
  const exclusionsKey = JSON.stringify(d.exclusions)
  const preview = useQuery({
    queryKey: ['smartPreview', debouncedQuery, exclusionsKey],
    queryFn: () => runSmartQuery(debouncedQuery!, d.exclusions),
    enabled: !!debouncedQuery,
    staleTime: 10 * 60 * 1000,
  })

  const name = d.name.trim()
  const smartChanged = !!original && (original.query !== query || JSON.stringify(original.exclusions ?? {}) !== JSON.stringify(d.exclusions))
  const canSave = !!name && (d.kind === 'picked' || (!!query && !!preview.data))

  async function submit() {
    if (!canSave) return
    const fields = {
      name,
      color: d.color,
      kind: d.kind,
      query: d.kind === 'smart' ? query : null,
      exclusions: d.kind === 'smart' ? d.exclusions : {},
      icon_card_id: original?.icon_card_id ?? (d.kind === 'smart' ? (preview.data?.[0]?.id ?? null) : (d.cards[0] ?? null)),
    }
    if (editId) {
      await save.mutateAsync({ id: editId, patch: fields, resolve: d.kind === 'smart' && smartChanged ? { ...original!, ...fields } : undefined })
      navigate(`/custom/${editId}`, { replace: true })
    } else {
      const ids = d.kind === 'smart' ? (preview.data ?? []).map((c) => c.id) : d.cards
      const created = await create.mutateAsync({ set: fields, cardIds: ids })
      clearDraft()
      navigate(`/custom/${created.id}`, { replace: true })
    }
  }

  const busy = create.isPending || save.isPending
  const error = create.error ?? save.error

  return (
    <Screen wash={washFor(d.color)}>
      <TopRow
        left={
          <button
            type="button"
            className="glass pill text-[16px]"
            onClick={() => {
              if (!editId) clearDraft()
              navigate(editId ? `/custom/${editId}` : '/', { replace: true })
            }}
          >
            <IconX size={18} /> Cancel
          </button>
        }
      />
      <h1 className="mb-6 text-[44px] leading-tight font-extrabold tracking-tight">{editId ? 'Edit set' : 'New custom set'}</h1>

      <div className="flex flex-col gap-4 min-[600px]:flex-row min-[600px]:items-center">
        <input className="field flex-1" placeholder="Set name, like Every Pikachu" value={d.name} onChange={(e) => update({ name: e.target.value })} aria-label="Set name" maxLength={40} />
        <div className="flex gap-2.5" role="radiogroup" aria-label="Colour">
          {CUSTOM_SET_SWATCHES.map((s) => {
            const active = s.hex.toLowerCase() === d.color.toLowerCase()
            return (
              <button
                key={s.hex}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={s.name}
                onClick={() => update({ color: s.hex })}
                className="grid h-14 w-14 place-items-center rounded-full transition-transform active:scale-95"
                style={{ background: s.hex, boxShadow: active ? `0 0 0 3px white, 0 0 0 6px #15172B` : undefined }}
              >
                {active && <IconCheck className="text-white" />}
              </button>
            )
          })}
        </div>
      </div>

      {!editId && (
        <>
          <h2 className="mt-8 mb-3 text-[22px] font-bold">How do cards get in?</h2>
          <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
            <KindCard
              active={d.kind === 'smart'}
              color={d.color}
              icon={<IconWand />}
              title="Smart set"
              body="Every card matching a search. New cards join automatically."
              onClick={() => update({ kind: 'smart' })}
            />
            <KindCard
              active={d.kind === 'picked'}
              color={d.color}
              icon={<IconHand />}
              title="Pick cards"
              body="Build the list yourself, one card at a time."
              onClick={() => update({ kind: 'picked' })}
            />
          </div>
        </>
      )}

      <div className="mt-5">
        {d.kind === 'smart' ? (
          <SmartPanel d={d} update={update} color={d.color} preview={preview} hasQuery={!!query} />
        ) : editId ? (
          <PickedEditNote count={membership.members.get(editId)?.length ?? 0} onChoose={() => navigate(`/add?to=${editId}`)} />
        ) : (
          <PickPanel cards={d.cards} onRemove={(id) => update({ cards: d.cards.filter((c) => c !== id) })} onChoose={() => navigate('/add?pick=draft')} />
        )}
      </div>

      {error && <p className="mt-4 text-[15px] font-semibold text-down">Couldn't save the set. Check your connection and try again.</p>}

      <button type="button" className="btn-dark mt-6 w-full" disabled={!canSave || busy} onClick={submit}>
        {busy ? 'Saving…' : editId ? 'Save changes' : `Create "${name || 'set'}"`}
      </button>
      <p className="mt-3 text-center text-[15px] text-ink-2">Cards you add anywhere count towards this set too</p>

      {editId && (
        <button
          type="button"
          className="mx-auto mt-10 block min-h-11 text-[15px] font-semibold text-down underline underline-offset-4"
          onClick={async () => {
            if (!confirm(`Delete "${original?.name}"? Your cards stay in your collection.`)) return
            await del.mutateAsync(editId)
            navigate('/', { replace: true })
          }}
        >
          Delete this set
        </button>
      )}
    </Screen>
  )
}

function KindCard({ active, color, icon, title, body, onClick }: { active: boolean; color: string; icon: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`glass flex items-start gap-4 p-5 text-left transition-shadow ${active ? '!border-ink !border-2' : ''}`}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[16px] text-white" style={{ background: active ? '#15172B' : alpha(color, 0.7) }}>
        {icon}
      </div>
      <div>
        <div className="text-[20px] font-bold">{title}</div>
        <div className="text-[15px] text-ink-2">{body}</div>
      </div>
    </button>
  )
}

function SmartPanel({
  d,
  update,
  color,
  preview,
  hasQuery,
}: {
  d: Draft
  update: (p: Partial<Draft>) => void
  color: string
  preview: UseQueryResult<Card[]>
  hasQuery: boolean
}) {
  const { owned } = useCollection()
  const mode = useCurrencyMode()
  const ex = d.exclusions
  const setEx = (patch: Partial<Exclusions>) => update({ exclusions: { ...ex, ...patch } })

  const stats = useMemo(() => {
    const cards = preview.data ?? []
    const have = cards.filter((c) => owned.has(c.id)).length
    // Sum each currency separately; show USD unless it's missing or EUR is chosen.
    let usd = 0
    let eur = 0
    for (const c of cards) {
      if (owned.has(c.id)) continue
      usd += bestUsd(c) ?? 0
      eur += bestEur(c) ?? 0
    }
    return { total: cards.length, have, toComplete: { usd: usd || null, eur: eur || null } }
  }, [preview.data, owned])

  return (
    <div className="glass flex flex-col gap-5 p-5">
      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-bold text-ink-2">Cards named</span>
        <input className="field" placeholder="Pikachu" value={d.term} onChange={(e) => update({ term: e.target.value })} autoCapitalize="words" />
      </label>

      <div>
        <div className="mb-2 text-[15px] font-bold text-ink-2">Leave out</div>
        <div className="flex flex-wrap gap-2">
          <Toggle on={!!ex.promos} onClick={() => setEx({ promos: !ex.promos })}>
            Promos
          </Toggle>
          <Toggle on={!!ex.beforeYear} onClick={() => setEx({ beforeYear: ex.beforeYear ? null : 2020 })}>
            Before{' '}
            {ex.beforeYear ? (
              <input
                type="number"
                inputMode="numeric"
                className="w-[5.2ch] bg-transparent text-center font-bold outline-none"
                value={ex.beforeYear}
                min={1996}
                max={2100}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEx({ beforeYear: Number(e.target.value) || 2020 })}
                aria-label="Leave out cards from before this year"
              />
            ) : (
              '2020'
            )}
          </Toggle>
          <Toggle on={!!ex.secretRares} onClick={() => setEx({ secretRares: !ex.secretRares })}>
            Secret rares
          </Toggle>
          <Toggle on={!!ex.trainers} onClick={() => setEx({ trainers: !ex.trainers })}>
            Trainer cards
          </Toggle>
        </div>
      </div>

      <div className="rounded-[18px] p-4" style={{ background: alpha(color, 0.12) }}>
        {!hasQuery ? (
          <p className="text-[16px] font-semibold text-ink-2">Type a name to see which cards match.</p>
        ) : preview.isLoading || (preview.isFetching && !preview.data) ? (
          <Skeleton className="h-[110px]" />
        ) : preview.error ? (
          <ErrorMessage error={preview.error} retry={() => preview.refetch()} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[24px] font-extrabold">{stats.total} cards match</div>
              <div className="text-[15px] font-semibold text-ink-2">
                You already own {stats.have} of them
                {(stats.toComplete.usd ?? stats.toComplete.eur) && <> · worth {displayPrice(mode, stats.toComplete.usd, stats.toComplete.eur)} to complete</>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(preview.data ?? []).slice(0, 3).map((c) => (
                <Thumb key={c.id} card={c} width={54} />
              ))}
              {stats.total > 3 && (
                <div className="grid aspect-[63/88] w-[54px] place-items-center rounded-lg bg-white/60 text-[15px] font-bold text-ink-2">+{stats.total - 3}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`pill text-[16px] transition-colors ${on ? 'bg-ink text-white' : 'bg-white/70 text-ink'}`}>
      {on && <IconCheck size={18} />}
      {children}
    </button>
  )
}

function PickPanel({ cards, onRemove, onChoose }: { cards: string[]; onRemove: (id: string) => void; onChoose: () => void }) {
  const data = useCards(cards)
  return (
    <div className="glass flex flex-col gap-4 p-5">
      <p className="text-[16px] text-ink-2">Search for cards and add them to this set. Choosing a card here doesn't mark it as owned.</p>
      <button type="button" className="btn-dark self-start !min-h-12 !text-[17px]" onClick={onChoose}>
        Choose cards
      </button>
      {cards.length > 0 && (
        <div className="grid grid-cols-4 gap-3 min-[600px]:grid-cols-6 wide:grid-cols-8">
          {cards.map((id) => {
            const c = data.data?.get(id)
            return (
              <div key={id} className="relative">
                {c ? <Thumb card={c} width="100%" /> : <Skeleton className="aspect-[63/88]" />}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  aria-label="Remove"
                  className="absolute -top-2 -right-2 grid h-9 w-9 place-items-center rounded-full bg-ink text-white shadow"
                >
                  <IconX size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PickedEditNote({ count, onChoose }: { count: number; onChoose: () => void }) {
  return (
    <div className="glass flex flex-wrap items-center justify-between gap-4 p-5">
      <p className="text-[16px] text-ink-2">This set has {count} cards. Add more here, or remove them from the set page.</p>
      <button type="button" className="btn-dark !min-h-12 !text-[17px]" onClick={onChoose}>
        Add cards
      </button>
    </div>
  )
}
