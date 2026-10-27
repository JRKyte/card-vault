import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Thumb } from '../components/cards'
import { IconCamera, IconChevronRight, IconX } from '../components/icons'
import { QuickAddSheet } from '../components/QuickAdd'
import { ReviewSheet, TrayStrip } from '../components/ScanTray'
import { Modal } from '../components/ui'
import { readStrip, warmUpOcr } from '../lib/ocr'
import { useSets } from '../lib/queries'
import { isPromoSet, type CardText } from '../lib/scan'
import { findByNumber, setCodes } from '../lib/search'
import { sortCards } from '../lib/sets'
import type { Card } from '../lib/tcg'
import { addScan, loadTray, saveTray, type TrayItem } from '../lib/tray'

type Phase = 'starting' | 'live' | 'reading' | 'no-camera'
type Mode = 'single' | 'rapid'

interface Outcome {
  reads: CardText[]
  text: string
  cards: Card[]
}

/** How long the same card can stay in view before scanning it again counts as another copy. */
const SAME_CARD_MS = 8000

/** A short soft "ping" when rapid scan catches a card. iOS only allows audio after a tap. */
let audio: AudioContext | null = null
function unlockAudio() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    // No Web Audio; scanning still works silently.
  }
}
function ping() {
  navigator.vibrate?.(30)
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.frequency.value = 1320
  gain.gain.setValueAtTime(0.0001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18)
  osc.connect(gain).connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + 0.2)
}

/** Card scanner. Single: scan, then add. Rapid: keeps scanning into a tray, then add them all. */
export function Scan() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [ocrReady, setOcrReady] = useState(false)
  const [ocrError, setOcrError] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [quickCard, setQuickCard] = useState<Card | null>(null)
  const [mode, setModeState] = useState<Mode>(() => (sessionStorage.getItem('scan-mode') as Mode) || 'single')
  const [tray, setTrayState] = useState<TrayItem[]>(loadTray)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const sets = useSets()

  const setMode = (m: Mode) => {
    unlockAudio()
    setModeState(m)
    try {
      sessionStorage.setItem('scan-mode', m)
    } catch {
      // Not important.
    }
  }
  // A ref alongside the state, so the scanning loop always sees the latest tray.
  const trayRef = useRef(tray)
  const setTray = useCallback((update: (t: TrayItem[]) => TrayItem[]) => {
    const next = update(trayRef.current)
    trayRef.current = next
    saveTray(next)
    setTrayState(next)
  }, [])

  // Promo set codes (MEP, SVP…): only promos print a bare number like "MEP EN 101", so only their
  // codes count. A stray "SW 3" in the flavour text can't pass for Secret Wonders #3.
  const knownCodes = useMemo(() => new Set((sets.data ?? []).filter(isPromoSet).flatMap(setCodes)), [sets.data])
  // The two newest promo sets (MEP, SV promos), tried when only a bare number could be read.
  const promoFallback = useMemo(
    () =>
      (sets.data ?? [])
        .filter(isPromoSet)
        .sort((x, y) => y.releaseDate.localeCompare(x.releaseDate))
        .flatMap((s) => setCodes(s).slice(-1))
        .slice(0, 2),
    [sets.data],
  )

  // Every set size, so a misread slash ("1287142") can still be split into 128/142.
  const knownTotals = useMemo(() => {
    const totals = new Set<number>()
    for (const s of sets.data ?? []) {
      if (s.printedTotal) totals.add(s.printedTotal)
      totals.add(s.total)
    }
    return totals
  }, [sets.data])

  // Camera on while the screen is open; recogniser loads in the background.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    warmUpOcr()
      .then(() => !cancelled && setOcrReady(true))
      .catch(() => !cancelled && setOcrError(true))
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera API')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
        if (cancelled) return
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        setPhase('live')
      } catch {
        if (!cancelled) setPhase('no-camera')
      }
    })()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  /** Search for each likely reading and merge what comes back. */
  const findCards = useCallback(
    async (reads: CardText[]) => {
      const found = new Map<string, Card>()
      await Promise.all(
        reads.map(async (read) => {
          try {
            for (const c of await findByNumber(read, sets.data ?? [])) found.set(c.id, c)
          } catch {
            // One failed lookup shouldn't hide the others.
          }
        }),
      )
      return sortCards([...found.values()])
    },
    [sets.data],
  )

  /** The strip under the guide, cropped from the live video at full camera resolution. */
  const cropStrip = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current
    const strip = stripRef.current
    if (!video || !strip || !video.videoWidth) return null
    const vw = video.videoWidth
    const vh = video.videoHeight
    const box = video.getBoundingClientRect()
    // The video is drawn with object-fit: cover; undo that to map screen → camera pixels.
    const scale = Math.max(box.width / vw, box.height / vh)
    const offX = (box.width - vw * scale) / 2
    const offY = (box.height - vh * scale) / 2
    const r = strip.getBoundingClientRect()
    const sx = Math.max(0, (r.left - box.left - offX) / scale)
    const sy = Math.max(0, (r.top - box.top - offY) / scale)
    const sw = Math.min(vw - sx, r.width / scale)
    const sh = Math.min(vh - sy, r.height / scale)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw)
    canvas.height = Math.round(sh)
    canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    return canvas
  }, [])

  /** Single mode: scan, then show the match (or matches) to add. */
  async function scanFrame() {
    const canvas = cropStrip()
    if (!canvas || phase !== 'live') return
    setPhase('reading')
    try {
      const { text, candidates } = await readStrip(canvas, knownTotals, knownCodes, promoFallback)
      const cards = await findCards(candidates)
      setOutcome({ reads: candidates, text, cards })
      if (cards.length === 1) setQuickCard(cards[0])
    } finally {
      setPhase('live')
    }
  }

  /** Put a catch in the tray with a little celebration. */
  const catchCards = useCallback(
    (cards: Card[]) => {
      const before = trayRef.current
      setTray((t) => addScan(t, cards, () => crypto.randomUUID()))
      // The row that changed (a new card, or another copy) gets a little pop.
      setFlashId(trayRef.current.find((item, i) => item !== before[i])?.id ?? null)
      setStatus(cards.length === 1 ? `Got ${cards[0].name}` : `Got one: pick it when you review`)
      ping()
    },
    [setTray],
  )

  // Rapid mode: keep reading. Only confident reads add anything, and the same card left in view
  // isn't added again. Tapping the shutter forces a full read of the card in view.
  const forceRead = useRef(false)
  const lastCatch = useRef<{ keys: Set<string>; ids: Set<string>; seen: number } | null>(null)
  useEffect(() => {
    if (mode !== 'rapid' || phase !== 'live' || !ocrReady || reviewing || quickCard || outcome) return
    let running = true
    ;(async () => {
      while (running) {
        const canvas = cropStrip()
        if (!canvas) {
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        const forced = forceRead.current
        forceRead.current = false
        const read = await readStrip(canvas, knownTotals, knownCodes, promoFallback)
        if (!running) break
        // Reads of one card vary a little (an extra guess here and there), so any overlap counts as the same card.
        const keys = read.candidates.map((c) => `${c.setCode ?? ''}${c.number}/${c.total ?? ''}`)
        const now = Date.now()
        const same = lastCatch.current && keys.some((k) => lastCatch.current!.keys.has(k)) && now - lastCatch.current.seen < SAME_CARD_MS
        if (same) {
          // Still looking at the card we just caught.
          lastCatch.current!.seen = now
        } else if (read.confident || (forced && read.candidates.length)) {
          const cards = await findCards(read.candidates)
          if (!running) break
          const last = lastCatch.current
          if (last && now - last.seen < SAME_CARD_MS && cards.some((c) => last.ids.has(c.id))) {
            // Read differently, but it's the card we just caught.
            keys.forEach((k) => last.keys.add(k))
            last.seen = now
          } else if (cards.length) {
            catchCards(cards)
            lastCatch.current = { keys: new Set(keys), ids: new Set(cards.map((c) => c.id)), seen: now }
          } else if (forced) setStatus("Couldn't find that one, try again")
        } else if (forced) {
          setStatus("Couldn't read the number, try again")
        }
        await new Promise((r) => setTimeout(r, 250))
      }
    })()
    return () => {
      running = false
    }
  }, [mode, phase, ocrReady, reviewing, quickCard, outcome, cropStrip, knownTotals, knownCodes, promoFallback, findCards, catchCards])

  // Status messages fade after a moment.
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), 2500)
    return () => clearTimeout(t)
  }, [status])

  /** Fallback: read a photo. The number is in the bottom strip of the card, so read the bottom fifth. */
  async function scanPhoto(file: File) {
    setPhase((p) => (p === 'no-camera' ? p : 'reading'))
    try {
      const bitmap = await createImageBitmap(file)
      const sh = Math.round(bitmap.height * 0.2)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = sh
      canvas.getContext('2d')!.drawImage(bitmap, 0, bitmap.height - sh, bitmap.width, sh, 0, 0, bitmap.width, sh)
      const { text, candidates } = await readStrip(canvas, knownTotals, knownCodes, promoFallback)
      const cards = await findCards(candidates)
      if (mode === 'rapid' && cards.length) catchCards(cards)
      else {
        setOutcome({ reads: candidates, text, cards })
        if (cards.length === 1) setQuickCard(cards[0])
      }
    } finally {
      setPhase((p) => (p === 'reading' ? 'live' : p))
    }
  }

  const busy = phase === 'reading'
  const rapid = mode === 'rapid'
  const caption = busy ? 'Reading…' : rapid ? 'Hold each card here, it adds itself' : 'Line up the number here'

  return (
    <div className="fixed inset-0 z-30 overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Card-shaped guide; the huge shadow darkens everything outside it. Rapid mode keeps room for the tray so the guide never jumps. */}
      <div className="absolute inset-0 flex items-center justify-center p-6" style={{ paddingBottom: `calc(${rapid ? 230 : 150}px + env(safe-area-inset-bottom))`, paddingTop: 'calc(110px + env(safe-area-inset-top))' }}>
        <div
          className="relative aspect-[63/88] max-h-full w-full max-w-[420px] rounded-[18px]"
          style={{ boxShadow: '0 0 0 9999px rgba(11,9,18,.72), 0 0 0 2px rgba(167,139,250,.9), 0 0 30px rgba(139,92,246,.6)' }}
        >
          <div
            ref={stripRef}
            className="absolute inset-x-2 bottom-1.5 h-[9%] rounded-[10px] border-2 border-dashed"
            style={{ borderColor: busy ? '#6ee7b7' : 'rgba(250,204,21,.9)', boxShadow: busy ? '0 0 20px rgba(52,211,153,.6)' : '0 0 16px rgba(250,204,21,.35)' }}
          />
          <div className="absolute inset-x-0 bottom-[calc(9%+16px)] px-3 text-center text-[13px] font-semibold text-[#fde047]" style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
            {caption}
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <div className="flex w-full items-center justify-between gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-11 items-center gap-1.5 rounded-full bg-black/55 pr-4 pl-3 text-[14px] font-semibold text-white backdrop-blur">
            <IconX size={18} /> Close
          </button>
          <div role="tablist" aria-label="Scan mode" className="flex gap-0.5 rounded-full bg-black/55 p-1 backdrop-blur">
            {(['single', 'rapid'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold capitalize ${mode === m ? 'bg-sel text-white' : 'text-white/70'}`}
                style={mode === m ? { boxShadow: 'var(--sel-shadow)' } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <span
          className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium backdrop-blur transition-colors ${status ? 'bg-[rgba(52,211,153,.25)] text-up' : 'bg-black/55 text-white/80'}`}
          role="status"
        >
          {ocrError ? "Scanner couldn't load" : !ocrReady ? 'Getting the scanner ready…' : (status ?? (rapid ? 'Looking for a card…' : 'Ready'))}
        </span>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {rapid && <TrayStrip tray={tray} flashId={flashId} onReview={() => setReviewing(true)} />}
        {phase === 'no-camera' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="max-w-[300px] text-[14px] text-white/80">The camera isn't available here. Allow camera access in Settings, or use a photo of the card.</p>
            <button type="button" className="cta" onClick={() => fileRef.current?.click()}>
              <IconCamera size={18} /> Use a photo instead
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={rapid ? 'Read this card now' : 'Scan card'}
              disabled={phase !== 'live' || !ocrReady}
              onClick={() => {
                unlockAudio()
                if (rapid) {
                  forceRead.current = true
                  setStatus('Reading this one…')
                } else void scanFrame()
              }}
              className={`grid place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-50 ${rapid ? 'h-[60px] w-[60px]' : 'h-[76px] w-[76px]'}`}
              style={{ background: 'linear-gradient(135deg,#fef3c7,#f9a8d4 50%,#a78bfa)', boxShadow: '0 0 0 4px rgba(255,255,255,.15), 0 0 30px rgba(244,114,182,.5)' }}
            >
              {busy ? <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1b1030]/30 border-t-[#1b1030]" /> : <IconCamera size={rapid ? 24 : 30} className="text-[#1b1030]" />}
            </button>
            <button type="button" className="text-[13px] font-semibold text-white/70 underline underline-offset-4" onClick={() => fileRef.current?.click()}>
              Use a photo instead
            </button>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void scanPhoto(f)
            e.target.value = ''
          }}
        />
      </div>

      {outcome && !quickCard && (
        <ScanResults
          outcome={outcome}
          onPick={setQuickCard}
          onClose={() => setOutcome(null)}
          onSearch={(term) => navigate(`/add?q=${encodeURIComponent(term)}`, { replace: true })}
        />
      )}
      {quickCard && (
        <QuickAddSheet
          card={quickCard}
          onClose={() => {
            setQuickCard(null)
            // A single match goes straight to the drawer; closing it returns to the camera.
            if (outcome?.cards.length === 1) setOutcome(null)
          }}
        />
      )}
      {reviewing && (
        <ReviewSheet
          tray={tray}
          onChange={(next) => setTray(() => next)}
          onClose={() => setReviewing(false)}
          onAdded={() => {
            setTray(() => [])
            setReviewing(false)
            lastCatch.current = null
          }}
        />
      )}
    </div>
  )
}

function ScanResults({ outcome, onPick, onClose, onSearch }: { outcome: Outcome; onPick: (c: Card) => void; onClose: () => void; onSearch: (term: string) => void }) {
  const r = outcome.reads[0]
  const label = (c: CardText) => `${c.setCode ? `${c.setCode} ` : ''}${c.number}${c.total ? `/${c.total}` : ''}`
  const readAs = outcome.reads.map(label).join(' or ')
  const [term, setTerm] = useState(r ? `${r.number}${r.total ? `/${r.total}` : ''}` : '')

  return (
    <Modal onClose={onClose} title="Scan results">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4 pl-5">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold tracking-tight">{outcome.cards.length ? `${outcome.cards.length} ${outcome.cards.length === 1 ? 'card matches' : 'cards match'}` : r ? 'No card found' : "Couldn't read the number"}</h2>
          <div className="mono truncate text-[11.5px] text-mute">{r ? `Read as ${readAs}` : 'Hold it closer and steadier, in good light'}</div>
        </div>
        <button type="button" aria-label="Scan again" className="chip-btn flex-none" onClick={onClose}>
          Scan again
        </button>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto p-4">
        {outcome.cards.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)} className="surface flex items-center gap-3 !rounded-[18px] p-2.5 pr-4 text-left hover:border-accent">
            <Thumb card={c} width={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{c.name}</div>
              <div className="truncate text-[12px] text-mute">
                {c.set.name} · {c.number}
                {c.set.printedTotal ? `/${c.set.printedTotal}` : ''}
              </div>
            </div>
            <IconChevronRight size={18} className="text-mute" />
          </button>
        ))}
        {outcome.cards.length === 0 && (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (term.trim()) onSearch(term.trim())
            }}
          >
            <span className="eyebrow">Or type what's printed at the bottom</span>
            <div className="flex gap-2">
              <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="128/142, or MEP 29 for promos" />
              <button type="submit" className="btn flex-none">
                Search
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
