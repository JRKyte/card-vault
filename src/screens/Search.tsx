import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Thumb } from '../components/cards'
import { IconCheck, IconChevronRight, IconPlus, IconSearch } from '../components/icons'
import { BackPill, ErrorMessage, Message, PageHeader, Screen, Segmented, Skeleton, StatusPill, TopRow } from '../components/ui'
import { draftCards, loadDraft, setDraftCards } from '../lib/draft'
import { useCurrencyMode } from '../lib/money'
import { bestEur, bestUsd, displayPrice } from '../lib/pricing'
import { useCollection, useCustomMembership, useCustomSetMembership, useCustomSets, useSearch, useTracked } from '../lib/queries'
import { sortCards } from '../lib/sets'
import { searchQueryFor, type Card } from '../lib/tcg'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function Search() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const term = params.get('q') ?? ''
  const toSetId = params.get('to') // add-to-custom-set mode
  const pickDraft = params.get('pick') === 'draft' // choosing cards for a set being created
  const [scope, setScope] = useState<'all' | 'mine'>('all')

  const debounced = useDebounced(term, 300)
  const q = searchQueryFor(debounced)
  const search = useSearch(q)

  const tracked = useTracked()
  const customSets = useCustomSets()
  const membership = useCustomMembership()
  const toggle = useCustomSetMembership()
  const targetSet = customSets.data?.find((s) => s.id === toSetId)
  const [draft, setDraft] = useState<string[]>(() => (pickDraft ? draftCards() : []))

  const inMySets = useMemo(() => {
    const trackedIds = new Set((tracked.data ?? []).map((t) => t.set_id))
    const customIds = new Set([...membership.members.values()].flat())
    return (c: Card) => trackedIds.has(c.set.id) || customIds.has(c.id)
  }, [tracked.data, membership.members])

  const results = useMemo(() => sortCards((search.data?.data ?? []).filter((c) => scope === 'all' || inMySets(c))), [search.data, scope, inMySets])
  const picking = !!toSetId || pickDraft
  const targetName = pickDraft ? loadDraft()?.name.trim() || 'new set' : (targetSet?.name ?? 'set')
  const isPicked = (c: Card) => (pickDraft ? draft.includes(c.id) : (membership.members.get(toSetId ?? '') ?? []).includes(c.id))

  function pick(c: Card) {
    if (pickDraft) {
      const next = draft.includes(c.id) ? draft.filter((id) => id !== c.id) : [...draft, c.id]
      setDraft(next)
      setDraftCards(next)
    } else if (toSetId) {
      toggle.mutate({ setId: toSetId, cardId: c.id, on: !isPicked(c) })
    }
  }

  const setTerm = (v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set('q', v)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  return (
    <Screen>
      {picking && (
        <TopRow
          left={<BackPill label={`Back to ${targetName}`} to={pickDraft ? '/custom/new' : `/custom/${toSetId}`} />}
          right={pickDraft && <StatusPill dot="#a78bfa">{draft.length} chosen</StatusPill>}
        />
      )}
      <PageHeader eyebrow={picking ? 'Choose cards' : 'Add'} title={picking ? `Add to ${targetName}` : 'Add a card'} />

      <div
        className="relative rounded-[22px] border border-[rgba(167,139,250,.45)] bg-[var(--surface)] transition-shadow focus-within:border-accent"
        style={{ boxShadow: '0 0 0 1px rgba(167,139,250,.15), 0 0 30px rgba(139,92,246,.2)' }}
      >
        <IconSearch size={24} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-accent" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Card name or number"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="min-h-16 w-full rounded-[22px] bg-transparent pr-5 pl-14 text-[20px] font-semibold outline-none placeholder:font-medium placeholder:text-mute"
          aria-label="Search cards"
        />
      </div>

      {q && (
        <div className="flex items-center justify-between gap-3">
          <div className="mono truncate text-[12px] font-medium text-mute">
            {search.isFetching && !search.data ? 'Searching…' : `${search.data?.totalCount ?? 0} cards match "${debounced.trim()}"`}
          </div>
          <Segmented
            label="Search scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'My sets' },
            ]}
          />
        </div>
      )}

      {!q ? (
        <EmptyPrompt picking={picking} />
      ) : search.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[99px] !rounded-[22px]" />
          ))}
        </div>
      ) : search.error && !search.data ? (
        <ErrorMessage error={search.error} retry={() => search.refetch()} />
      ) : results.length === 0 ? (
        <Message title="No cards found" body={scope === 'mine' ? 'Nothing in your sets matches. Try "All".' : "Check the spelling, or try the number on the card, like 128/142."} />
      ) : (
        <div className={`flex flex-col gap-2 transition-opacity ${search.isPlaceholderData ? 'opacity-60' : ''}`}>
          {results.map((c) =>
            picking ? (
              <ResultRow key={c.id} card={c} onClick={() => pick(c)} trailing={<PickButton picked={isPicked(c)} name={targetName} />} />
            ) : (
              <ResultRow key={c.id} card={c} onClick={() => navigate(`/add/${c.id}`)} trailing={<IconChevronRight className="text-mute" />} />
            ),
          )}
          {(search.data?.totalCount ?? 0) > (search.data?.data.length ?? 0) && (
            <p className="mt-2 text-center text-[13px] text-mute">Showing the newest {search.data?.data.length}. Add more of the name to narrow it down.</p>
          )}
        </div>
      )}

      <p className="mt-2 text-center text-[13px] text-mute">Can't find it? Try the number on the card, like 128/142</p>
    </Screen>
  )
}

function ResultRow({ card, onClick, trailing }: { card: Card; onClick: () => void; trailing: React.ReactNode }) {
  const mode = useCurrencyMode()
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface flex items-center gap-3.5 !rounded-[20px] p-2.5 pr-4 text-left transition-[transform,border-color] duration-200 hover:border-accent active:scale-[0.99]"
    >
      <Thumb card={card} width={54} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold">{card.name}</div>
        <div className="truncate text-[12.5px] text-mute">
          {card.set.name} · {card.number}
          {card.rarity && ` · ${card.rarity}`}
        </div>
      </div>
      {(bestUsd(card) ?? bestEur(card)) !== null && <div className="mono shrink-0 text-[13px] font-semibold text-up">{displayPrice(mode, bestUsd(card), bestEur(card))}</div>}
      {trailing}
    </button>
  )
}

function PickButton({ picked, name }: { picked: boolean; name: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold ${picked ? 'bg-[rgba(52,211,153,.14)] text-up' : 'bg-sel text-white'}`}
      style={picked ? undefined : { boxShadow: 'var(--sel-shadow)' }}
    >
      {picked ? <IconCheck size={16} /> : <IconPlus size={16} />}
      <span className="hidden sm:inline">{picked ? 'Added' : `Add to ${name}`}</span>
    </span>
  )
}

function EmptyPrompt({ picking }: { picking: boolean }) {
  const { items, cards } = useCollection()
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Card[] = []
    for (const i of items) {
      const c = cards.get(i.card_id)
      if (c && !seen.has(c.id)) {
        seen.add(c.id)
        out.push(c)
      }
      if (out.length === 6) break
    }
    return out
  }, [items, cards])

  return (
    <div className="flex flex-col gap-3">
      <div className="surface p-6 text-center">
        <div className="text-[18px] font-bold">{picking ? 'Which cards should be in this set?' : 'What did you get?'}</div>
        <p className="mt-1 text-[14px] text-mute">Type a name like "Pikachu", or the number at the bottom of the card.</p>
      </div>
      {!picking && recent.length > 0 && (
        <>
          <h2 className="mt-3 text-[22px] font-bold tracking-[-.03em]">Add another</h2>
          <div className="grid grid-cols-3 gap-3 min-[600px]:grid-cols-6">
            {recent.map((c) => (
              <Link key={c.id} to={`/add/${c.id}`} className="flex flex-col gap-1.5 transition-transform active:scale-[0.97]">
                <Thumb card={c} width="100%" />
                <span className="truncate text-[13px] font-semibold">{c.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
