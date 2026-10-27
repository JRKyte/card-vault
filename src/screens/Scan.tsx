import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CardImage } from '../components/cards'
import { IconCamera, IconX } from '../components/icons'
import { QuickAddSheet } from '../components/QuickAdd'
import { ReviewSheet, TrayStrip } from '../components/ScanTray'
import { Modal } from '../components/ui'
import { matchCard, warmUpArt, type ArtMatch } from '../lib/artmatch'
import { loadCards } from '../lib/cards'
import { identify, OPTIONS, PRESENT_SCORE, SURE_MARGIN, type Identified } from '../lib/identify'
import { readStrip, warmUpOcr } from '../lib/ocr'
import { useSets } from '../lib/queries'
import { isPromoSet } from '../lib/scan'
import { setCodes } from '../lib/search'
import type { Card } from '../lib/tcg'
import { addScan, loadTray, saveTray, type TrayItem } from '../lib/tray'

type Phase = 'starting' | 'live' | 'reading' | 'no-camera'
type Mode = 'single' | 'rapid'
type Outcome = Identified & {
  failed?: boolean
  /** A card whose printed number was read too: shown first, tagged. */
  numberMatch?: string
}

/** How long the same card can stay in view before scanning it again counts as another copy. */
const SAME_CARD_MS = 8000
/** In rapid mode, a card held this many looks in a row without a clear winner goes in the tray to pick. */
const UNSURE_LOOKS = 3

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/** The bottom of a card picture, where the number is printed. */
function bottomStrip(card: HTMLCanvasElement): HTMLCanvasElement {
  const h = Math.round(card.height * 0.11)
  const out = document.createElement('canvas')
  out.width = card.width
  out.height = h
  out.getContext('2d')!.drawImage(card, 0, card.height - h, card.width, h, 0, 0, card.width, h)
  return out
}

/**
 * Card scanner. Cards are recognised by their picture; the number on the bottom, when it reads,
 * settles which of the closest pictures it is. Single: scan, then add. Rapid: keeps scanning into
 * a tray, then add them all.
 */
export function Scan() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [ocrReady, setOcrReady] = useState(false)
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

  // For the number reader: promo set codes (MEP, SVP…) and every set size, so a misread slash
  // ("1287142") can still be split into 128/142. See ocr.ts.
  const knownCodes = useMemo(() => new Set((sets.data ?? []).filter(isPromoSet).flatMap(setCodes)), [sets.data])
  const promoFallback = useMemo(
    () =>
      (sets.data ?? [])
        .filter(isPromoSet)
        .sort((x, y) => y.releaseDate.localeCompare(x.releaseDate))
        .flatMap((s) => setCodes(s).slice(-1))
        .slice(0, 2),
    [sets.data],
  )
  const knownTotals = useMemo(() => {
    const totals = new Set<number>()
    for (const s of sets.data ?? []) {
      if (s.printedTotal) totals.add(s.printedTotal)
      totals.add(s.total)
    }
    return totals
  }, [sets.data])

  // Camera on while the screen is open; the picture matcher loads in the background.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    warmUpArt()
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setLoadError(true))
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

  // The number reader only helps single scans, so it loads only for those.
  useEffect(() => {
    if (mode !== 'single' || ocrReady) return
    let cancelled = false
    warmUpOcr()
      .then(() => !cancelled && setOcrReady(true))
      .catch(() => undefined) // Scanning still works by picture alone.
    return () => {
      cancelled = true
    }
  }, [mode, ocrReady])

  /** The card-shaped guide, cropped from the live video at full camera resolution. */
  const cropGuide = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current
    const guide = guideRef.current
    if (!video || !guide || !video.videoWidth) return null
    const vw = video.videoWidth
    const vh = video.videoHeight
    const box = video.getBoundingClientRect()
    // The video is drawn with object-fit: cover; undo that to map screen → camera pixels.
    const scale = Math.max(box.width / vw, box.height / vh)
    const offX = (box.width - vw * scale) / 2
    const offY = (box.height - vh * scale) / 2
    const r = guide.getBoundingClientRect()
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

  /** Load the matched cards and decide. */
  const decide = useCallback(async (matches: ArtMatch[]) => {
    const cards = await loadCards(matches.map((m) => m.id))
    return { cards, result: identify(matches, cards) }
  }, [])

  /** Single scan of a card picture: match it, then show the result. */
  async function scanCard(card: HTMLCanvasElement) {
    setPhase((p) => (p === 'no-camera' ? p : 'reading'))
    try {
      const matches = await matchCard(card, OPTIONS)
      const { cards, result } = await decide(matches)
      if (mode === 'rapid' && result.cards.length) catchCards(result.sure ? result.cards.slice(0, 1) : result.cards.slice(0, 4))
      else {
        setOutcome(result)
        if (result.sure) setQuickCard(result.cards[0])
        // Not sure: while they look, read the number. If it fits one of the pictures, that one goes first.
        else if (ocrReady && result.cards.length > 1) {
          void readStrip(bottomStrip(card), knownTotals, knownCodes, promoFallback, 3)
            .then((read) => {
              const byNumber = identify(matches, cards, read.candidates)
              if (byNumber.sure) setOutcome((o) => (o === result ? { ...byNumber, sure: false, numberMatch: byNumber.cards[0].id } : o))
            })
            .catch(() => undefined)
        }
      }
    } catch {
      setOutcome({ cards: [], sure: false, failed: true })
    } finally {
      setPhase((p) => (p === 'reading' ? 'live' : p))
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

  // Rapid mode: keep looking. A card held in the frame goes in the tray: on its own when one
  // picture is clearly closest, or to pick from later when it stays unsure. The same card left in
  // view isn't added again. Tapping the shutter takes the card in view straight away.
  const forceRead = useRef(false)
  const lastCatch = useRef<{ ids: Set<string>; seen: number } | null>(null)
  useEffect(() => {
    if (mode !== 'rapid' || phase !== 'live' || !ready || reviewing || quickCard || outcome) return
    let running = true
    let previous: string | null = null
    let looks = 0
    ;(async () => {
      while (running) {
        const canvas = cropGuide()
        if (!canvas) {
          await wait(400)
          continue
        }
        const forced = forceRead.current
        forceRead.current = false
        let matches: ArtMatch[]
        try {
          matches = await matchCard(canvas, OPTIONS, false)
        } catch {
          await wait(1000)
          continue
        }
        if (!running) break
        const [top, second] = matches
        // Something card-like in the frame, and the same best match as last look.
        const present = !!top && top.score >= PRESENT_SCORE
        looks = present && top.id === previous ? looks + 1 : present ? 1 : 0
        previous = present ? top.id : null
        const clear = !!top && (!second || top.score - second.score >= SURE_MARGIN)
        const now = Date.now()
        const last = lastCatch.current
        if (import.meta.env.DEV) console.debug('[rapid]', top?.id, top?.score.toFixed(3), second ? (top.score - second.score).toFixed(3) : '-', { present, looks, clear })
        if (present && last && now - last.seen < SAME_CARD_MS && last.ids.has(top.id)) {
          last.seen = now // Still the card we just caught.
        } else if (forced || (clear && looks >= 2) || looks >= UNSURE_LOOKS) {
          const result = (await decide(matches).catch(() => null))?.result
          if (!running) break
          if (result?.cards.length) {
            catchCards(result.sure ? result.cards.slice(0, 1) : result.cards.slice(0, 4))
            lastCatch.current = { ids: new Set(matches.slice(0, 4).map((m) => m.id)), seen: now }
            looks = 0
          } else if (forced) setStatus("Couldn't find that one, try again")
        }
        await wait(150)
      }
    })()
    return () => {
      running = false
    }
  }, [mode, phase, ready, reviewing, quickCard, outcome, cropGuide, decide, catchCards])

  // Status messages fade after a moment.
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), 2500)
    return () => clearTimeout(t)
  }, [status])

  /** Fallback: a photo of the card, taken with the phone's own camera. */
  async function scanPhoto(file: File) {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    await scanCard(canvas)
  }

  const busy = phase === 'reading'
  const rapid = mode === 'rapid'
  const caption = busy ? 'Looking…' : rapid ? 'Hold each card in the frame, it adds itself' : 'Fit the card in the frame'

  return (
    <div className="fixed inset-0 z-30 overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Card-shaped guide; the huge shadow darkens everything outside it. Rapid mode keeps room for the tray so the guide never jumps. */}
      <div className="absolute inset-0 flex items-center justify-center p-6" style={{ paddingBottom: `calc(${rapid ? 230 : 150}px + env(safe-area-inset-bottom))`, paddingTop: 'calc(110px + env(safe-area-inset-top))' }}>
        <div
          ref={guideRef}
          className="relative aspect-[63/88] max-h-full w-full max-w-[420px] rounded-[18px] transition-shadow"
          style={{
            boxShadow: busy
              ? '0 0 0 9999px rgba(11,9,18,.72), 0 0 0 3px #6ee7b7, 0 0 34px rgba(52,211,153,.6)'
              : '0 0 0 9999px rgba(11,9,18,.72), 0 0 0 2px rgba(167,139,250,.9), 0 0 30px rgba(139,92,246,.6)',
          }}
        >
          <div className="absolute inset-x-0 bottom-3 px-3 text-center text-[13px] font-semibold text-[#fde047]" style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
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
          {loadError ? "Scanner couldn't load. Check your connection." : !ready ? 'Getting the scanner ready (the first time takes a minute)…' : (status ?? (rapid ? 'Looking for a card…' : 'Ready'))}
        </span>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {rapid && <TrayStrip tray={tray} flashId={flashId} onReview={() => setReviewing(true)} />}
        {phase === 'no-camera' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="max-w-[300px] text-[14px] text-white/80">The camera isn't available here. Allow camera access in Settings, or use a photo of the card.</p>
            <button type="button" className="cta" disabled={!ready} onClick={() => fileRef.current?.click()}>
              <IconCamera size={18} /> Use a photo instead
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={rapid ? 'Add the card in the frame now' : 'Scan card'}
              disabled={phase !== 'live' || !ready}
              onClick={() => {
                unlockAudio()
                if (rapid) {
                  forceRead.current = true
                  setStatus('Looking at this one…')
                } else {
                  const card = cropGuide()
                  if (card) void scanCard(card)
                }
              }}
              className={`grid place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-50 ${rapid ? 'h-[60px] w-[60px]' : 'h-[76px] w-[76px]'}`}
              style={{ background: 'linear-gradient(135deg,#fef3c7,#f9a8d4 50%,#a78bfa)', boxShadow: '0 0 0 4px rgba(255,255,255,.15), 0 0 30px rgba(244,114,182,.5)' }}
            >
              {busy ? <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1b1030]/30 border-t-[#1b1030]" /> : <IconCamera size={rapid ? 24 : 30} className="text-[#1b1030]" />}
            </button>
            <button type="button" className="text-[13px] font-semibold text-white/70 underline underline-offset-4 disabled:opacity-50" disabled={!ready} onClick={() => fileRef.current?.click()}>
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
          onAdded={() => setOutcome(null)}
          onClose={() => {
            setQuickCard(null)
            // Not added: back to the other close matches, if there were any.
            if ((outcome?.cards.length ?? 0) <= 1) setOutcome(null)
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
  const [term, setTerm] = useState('')
  const found = outcome.cards.length > 0
  const title = outcome.failed ? "Couldn't scan that" : !found ? 'No match found' : outcome.sure ? 'Not this one?' : 'Which one is it?'
  const sub = outcome.failed ? 'Check your connection and try again' : !found ? 'Fit the whole card in the frame, in good light. Shiny cards scan best out of their sleeve.' : 'Tap your card. These look closest.'

  return (
    <Modal onClose={onClose} title="Scan results">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4 pl-5">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold tracking-tight">{title}</h2>
          <div className="text-[12.5px] text-mute">{sub}</div>
        </div>
        <button type="button" className="chip-btn flex-none" onClick={onClose}>
          Scan again
        </button>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        {found && (
          <div className="grid grid-cols-3 gap-x-3 gap-y-3.5">
            {outcome.cards.map((c) => (
              <button key={c.id} type="button" onClick={() => onPick(c)} className="flex min-w-0 flex-col gap-1.5 text-left transition-transform active:scale-95" aria-label={`${c.name}, ${c.set.name} ${c.number}`}>
                <div className="relative">
                  <CardImage card={c} rounded={10} style={c.id === outcome.numberMatch ? { boxShadow: '0 0 0 2px #6ee7b7, 0 0 18px rgba(52,211,153,.5)' } : undefined} />
                  {c.id === outcome.numberMatch && <span className="absolute inset-x-1 bottom-1 rounded-full bg-[#064e3b]/90 py-0.5 text-center text-[10px] font-bold text-up">Number matches</span>}
                </div>
                <span className="truncate px-0.5 text-[12.5px] font-semibold">{c.name}</span>
                <span className="mono -mt-1 truncate px-0.5 text-[10.5px] text-mute">
                  {c.set.name} · {c.number}
                </span>
              </button>
            ))}
          </div>
        )}
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (term.trim()) onSearch(term.trim())
          }}
        >
          <span className="eyebrow">{found ? 'None of these? Search for it' : 'Or search for it'}</span>
          <div className="flex gap-2">
            <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name, or the number like 128/142" />
            <button type="submit" className="btn flex-none">
              Search
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
