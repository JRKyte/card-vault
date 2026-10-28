import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconCamera, IconX } from '../components/icons'
import { ReviewSheet, TrayStrip } from '../components/ScanTray'
import { matchCard, warmUpArt } from '../lib/artmatch'
import { loadCards } from '../lib/cards'
import { identify, OPTIONS } from '../lib/identify'
import { readStrip, warmUpOcr } from '../lib/ocr'
import { useSets } from '../lib/queries'
import { isPromoSet } from '../lib/scan'
import { setCodes } from '../lib/search'
import type { Card } from '../lib/tcg'
import { addPending, loadTray, resolveScan, saveTray, type TrayItem } from '../lib/tray'

type Phase = 'starting' | 'live' | 'no-camera'

/** A short soft "ping" on each snap. iOS only allows audio after a tap. */
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

/** A small JPEG copy of a snap, shown in the tray while it's recognised. */
function photoOf(card: HTMLCanvasElement, width: number): string {
  const out = document.createElement('canvas')
  out.width = width
  out.height = Math.round((card.height / card.width) * width)
  out.getContext('2d')!.drawImage(card, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.8)
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
 * Card scanner. Tapping the button snaps the card in the frame; the snap drops into the tray and
 * is recognised there, so you can keep snapping. Cards are recognised by their picture; when two
 * pictures are close, the number on the bottom settles it if it reads. Review, then add them all.
 */
export function Scan() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tray, setTrayState] = useState<TrayItem[]>(loadTray)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  /** Bumped on every snap to replay the shutter flash. */
  const [flashes, setFlashes] = useState(0)
  const sets = useSets()

  // A ref alongside the state, so the recognising loop always sees the latest tray.
  const trayRef = useRef(tray)
  const setTray = useCallback((update: (t: TrayItem[]) => TrayItem[]) => {
    const next = update(trayRef.current)
    trayRef.current = next
    saveTray(next)
    setTrayState(next)
  }, [])

  // For the number reader: promo set codes (MEP, SVP…) and every set size, so a misread slash
  // ("1287142") can still be split into 128/142. See ocr.ts.
  const numbers = useRef({ codes: new Set<string>(), fallback: [] as string[], totals: new Set<number>() })
  numbers.current = useMemo(() => {
    const all = sets.data ?? []
    const promos = all.filter(isPromoSet)
    const totals = new Set<number>()
    for (const s of all) {
      if (s.printedTotal) totals.add(s.printedTotal)
      totals.add(s.total)
    }
    return {
      codes: new Set(promos.flatMap(setCodes)),
      fallback: [...promos].sort((x, y) => y.releaseDate.localeCompare(x.releaseDate)).flatMap((s) => setCodes(s).slice(-1)).slice(0, 2),
      totals,
    }
  }, [sets.data])

  // Camera on while the screen is open; the picture matcher and number reader load in the background.
  const ocrReady = useRef(false)
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    warmUpArt()
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setLoadError(true))
    warmUpOcr()
      .then(() => (ocrReady.current = true))
      .catch(() => undefined) // Scanning still works by picture alone.
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

  /** What's in a snap: one card when sure, otherwise the closest few to pick from. */
  const recognise = useCallback(async (card: HTMLCanvasElement): Promise<Card[]> => {
    const matches = await matchCard(card, OPTIONS)
    const cards = await loadCards(matches.map((m) => m.id))
    const result = identify(matches, cards)
    if (result.sure) return result.cards.slice(0, 1)
    // Close call: if the printed number reads and fits one of the pictures, that's the one.
    if (ocrReady.current && result.cards.length > 1) {
      const { codes, fallback, totals } = numbers.current
      const read = await readStrip(bottomStrip(card), totals, codes, fallback, 2).catch(() => null)
      const byNumber = read && identify(matches, cards, read.candidates)
      if (byNumber?.sure) return byNumber.cards.slice(0, 1)
    }
    return result.cards.slice(0, 4)
  }, [])

  // Snaps wait here and are recognised one at a time (the models use the whole phone), while more
  // can be snapped. Each result replaces its placeholder in the tray.
  const queue = useRef<{ id: string; card: HTMLCanvasElement }[]>([])
  const working = useRef(false)
  const processQueue = useCallback(async () => {
    if (working.current) return
    working.current = true
    while (queue.current.length) {
      const { id, card } = queue.current.shift()!
      const cards = await recognise(card).catch(() => [] as Card[]) // Nothing: shown as not recognised.
      setTray((t) => resolveScan(t, id, cards))
      // The row that changed gets a little pop: this snap, or the row it added a copy to.
      setFlashId(trayRef.current.some((t) => t.id === id) ? id : (trayRef.current.find((t) => t.chosen === cards[0]?.id)?.id ?? null))
      setStatus(cards.length === 1 ? `Got ${cards[0].name}` : cards.length ? 'Got one: pick it when you review' : "Couldn't recognise that one")
    }
    working.current = false
  }, [recognise, setTray])

  function snap(card: HTMLCanvasElement) {
    const id = crypto.randomUUID()
    setTray((t) => addPending(t, id, photoOf(card, 120)))
    queue.current.push({ id, card })
    void processQueue()
  }

  function shutter() {
    unlockAudio()
    const card = cropGuide()
    if (!card) return
    setFlashes((n) => n + 1)
    ping()
    snap(card)
  }

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
    snap(canvas)
  }

  const pending = tray.filter((t) => t.pending).length
  const hint = !tray.length ? 'Fit the card in the frame, then tap the button' : 'Next card: fit it in the frame and tap'

  return (
    <div className="fixed inset-0 z-30 overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Card-shaped guide; the huge shadow darkens everything outside it. Room is kept for the tray so the guide never jumps. */}
      <div className="absolute inset-0 flex items-center justify-center p-6" style={{ paddingBottom: 'calc(230px + env(safe-area-inset-bottom))', paddingTop: 'calc(110px + env(safe-area-inset-top))' }}>
        <div
          ref={guideRef}
          className="relative aspect-[63/88] max-h-full w-full max-w-[420px] rounded-[18px]"
          style={{ boxShadow: '0 0 0 9999px rgba(11,9,18,.72), 0 0 0 2px rgba(167,139,250,.9), 0 0 30px rgba(139,92,246,.6)' }}
        >
          {flashes > 0 && <div key={flashes} className="animate-flash pointer-events-none absolute inset-0 rounded-[18px] bg-white" />}
          <div className="absolute inset-x-0 bottom-3 px-3 text-center text-[13px] font-semibold text-[#fde047]" style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
            {hint}
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <div className="flex w-full items-center justify-between gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-11 items-center gap-1.5 rounded-full bg-black/55 pr-4 pl-3 text-[14px] font-semibold text-white backdrop-blur">
            <IconX size={18} /> Close
          </button>
        </div>
        <span
          className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium backdrop-blur transition-colors ${status ? 'bg-[rgba(52,211,153,.25)] text-up' : 'bg-black/55 text-white/80'}`}
          role="status"
        >
          {loadError
            ? "Scanner couldn't load. Check your connection."
            : (status ??
              (!ready
                ? 'Getting the scanner ready (the first time takes a minute)…'
                : pending
                  ? `Recognising ${pending} in the tray, keep going`
                  : tray.length
                    ? 'Snap another, or review to add them'
                    : 'Ready'))}
        </span>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <TrayStrip tray={tray} flashId={flashId} onReview={() => setReviewing(true)} />
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
              aria-label="Snap this card"
              disabled={phase !== 'live'}
              onClick={shutter}
              className="grid h-[72px] w-[72px] place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#fef3c7,#f9a8d4 50%,#a78bfa)', boxShadow: '0 0 0 4px rgba(255,255,255,.15), 0 0 30px rgba(244,114,182,.5)' }}
            >
              <IconCamera size={28} className="text-[#1b1030]" />
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

      {reviewing && (
        <ReviewSheet
          tray={tray}
          onChange={(next) => setTray(() => next)}
          onClose={() => setReviewing(false)}
          onAdded={() => {
            setTray(() => [])
            setReviewing(false)
          }}
        />
      )}
    </div>
  )
}
