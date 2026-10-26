import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconPlus, IconSearch, IconSparkle, IconStar, IconWand } from '../components/icons'
import { SetIcon, SetRow } from '../components/SetBits'
import { ErrorMessage, Message, Modal, PageHeader, Screen, Segmented, Skeleton } from '../components/ui'
import { setColor } from '../data/set-colors'
import { useSets } from '../lib/queries'
import { useSetSummaries, type SetSummary } from '../lib/summaries'

type View = 'mine' | 'all'

export function Sets() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => {
    try {
      return (sessionStorage.getItem('sets-view') as View) ?? 'mine'
    } catch {
      return 'mine'
    }
  })
  const chooser = params.get('new') === '1'
  const setChooser = (open: boolean) => setParams(open ? { new: '1' } : {}, { replace: true })
  const summaries = useSetSummaries()

  const changeView = (v: View) => {
    setView(v)
    try {
      sessionStorage.setItem('sets-view', v)
    } catch {
      // Not important.
    }
  }

  const rows: SetSummary[] = view === 'mine' ? summaries.mine : [...summaries.custom, ...summaries.official]
  const eyebrow = view === 'mine' ? `${summaries.mine.length} tracked` : `${summaries.custom.length + summaries.official.length} available`

  return (
    <Screen>
      <PageHeader
        eyebrow={eyebrow}
        title="Sets"
        right={
          <Segmented
            label="Which sets"
            value={view}
            onChange={changeView}
            options={[
              { value: 'mine', label: 'My sets' },
              { value: 'all', label: 'All sets' },
            ]}
          />
        }
      />

      {summaries.isLoading ? (
        <Grid>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[88px] !rounded-[22px]" />
          ))}
        </Grid>
      ) : summaries.setsError && !summaries.official.length && (view === 'all' || summaries.trackedPending > 0) ? (
        <ErrorMessage error={summaries.setsError} retry={() => summaries.refetchSets()} />
      ) : view === 'mine' && rows.length === 0 && !summaries.trackedPending ? (
        <Message
          icon={<IconStar />}
          title="Pick a set to collect"
          body="Choose a set and see which cards you've got and which you still need."
          action={
            <button type="button" className="btn mt-2" onClick={() => setChooser(true)}>
              Choose a set
            </button>
          }
        />
      ) : (
        <Grid>
          {rows.map((s) => (
            <SetRow key={s.key} set={s} />
          ))}
          {summaries.setsLoading &&
            Array.from({ length: view === 'mine' ? summaries.trackedPending : 4 }, (_, i) => <Skeleton key={`pending-${i}`} className="h-[88px] !rounded-[22px]" />)}
          <button
            type="button"
            onClick={() => setChooser(true)}
            className="flex min-h-[88px] items-center justify-center gap-2 rounded-[22px] border border-dashed border-white/20 text-[15px] font-semibold text-accent transition-colors hover:border-accent hover:bg-[var(--chip)]"
          >
            <IconPlus size={20} /> New set
          </button>
        </Grid>
      )}

      {chooser && <NewSetChooser onClose={() => setChooser(false)} trackedIds={summaries.trackedIds} />}
    </Screen>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">{children}</div>
}

function NewSetChooser({ onClose, trackedIds }: { onClose: () => void; trackedIds: Set<string> }) {
  const [step, setStep] = useState<'choose' | 'official'>('choose')
  const [term, setTerm] = useState('')
  const navigate = useNavigate()
  const sets = useSets()

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase()
    return (sets.data ?? []).filter((s) => !t || s.name.toLowerCase().includes(t) || s.series.toLowerCase().includes(t) || s.id.toLowerCase().includes(t))
  }, [sets.data, term])

  return (
    <Modal onClose={onClose} title="New set">
      {step === 'choose' ? (
        <div className="flex flex-col gap-3 p-5">
          <h2 className="mb-1 text-[24px] font-extrabold tracking-tight">New set</h2>
          <ChoiceButton icon={<IconSparkle />} title="Track an official set" body="Pick from every set that's been released." onClick={() => setStep('official')} />
          <ChoiceButton
            icon={<IconWand />}
            title="Make a custom set"
            body="Every Pikachu, your favourites, anything you like."
            onClick={() => {
              onClose()
              navigate('/custom/new')
            }}
          />
        </div>
      ) : (
        <>
          <div className="p-5 pb-3">
            <h2 className="mb-3 text-[24px] font-extrabold tracking-tight">Track an official set</h2>
            <div className="relative">
              <IconSearch size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mute" />
              <input className="field pl-11" placeholder="Search sets" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {sets.isLoading && <Skeleton className="mx-2 h-40" />}
            {sets.error && !sets.data && <ErrorMessage error={sets.error} retry={() => sets.refetch()} />}
            <div className="flex flex-col">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(`/set/${s.id}`)
                  }}
                  className="flex items-center gap-3 rounded-2xl p-2 text-left hover:bg-[var(--chip)]"
                >
                  <SetIcon set={{ kind: 'official', color: setColor(s.id), code: s.ptcgoCode ?? s.id.toUpperCase(), name: s.name }} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{s.name}</div>
                    <div className="mono text-[11px] text-mute">
                      {s.series} · {s.releaseDate.slice(0, 4)} · {s.total} cards
                    </div>
                  </div>
                  {trackedIds.has(s.id) && <span className="mono text-[10px] font-semibold tracking-wider text-up">TRACKED</span>}
                </button>
              ))}
              {!sets.isLoading && filtered.length === 0 && sets.data && <p className="p-4 text-center text-mute">No sets match "{term}".</p>}
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

function ChoiceButton({ icon, title, body, onClick }: { icon: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" className="surface flex items-center gap-4 !rounded-[20px] p-4 text-left transition-colors hover:border-accent" onClick={onClick}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] text-white" style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 0 20px rgba(139,92,246,.5)' }}>
        {icon}
      </div>
      <div>
        <div className="text-[16px] font-semibold">{title}</div>
        <div className="text-[13px] text-mute">{body}</div>
      </div>
    </button>
  )
}
