import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Thumb } from '../components/cards'
import { IconCamera, IconChevronRight, IconX } from '../components/icons'
import { QuickAddSheet } from '../components/QuickAdd'
import { Modal } from '../components/ui'
import { readStrip, warmUpOcr } from '../lib/ocr'
import { useSets } from '../lib/queries'
import { scanQuery, type CardText } from '../lib/scan'
import { sortCards } from '../lib/sets'
import { searchCards, type Card } from '../lib/tcg'

type Phase = 'starting' | 'live' | 'reading' | 'no-camera'

interface Outcome {
  reads: CardText[]
  text: string
  cards: Card[]
}

/** Card scanner: point the camera at a card, read its number line, find it, quick add. */
export function Scan() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [ocrReady, setOcrReady] = useState(false)
  const [ocrError, setOcrError] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [quickCard, setQuickCard] = useState<Card | null>(null)
  const sets = useSets()

  // Set code (e.g. SCR) → pokemontcg.io set id. Sub-sets share codes, so prefer the shortest id.
  const setIdForCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sets.data ?? []) {
      const code = s.ptcgoCode?.toUpperCase()
      if (code && (!map.has(code) || s.id.length < map.get(code)!.length)) map.set(code, s.id)
    }
    return (code: string) => map.get(code.toUpperCase()) ?? null
  }, [sets.data])

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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
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
  const lookUp = useCallback(
    async (reads: CardText[], text: string) => {
      const found = new Map<string, Card>()
      await Promise.all(
        reads.map(async (read) => {
          try {
            for (const c of (await searchCards(scanQuery(read, setIdForCode), { pageSize: 30 })).data) found.set(c.id, c)
          } catch {
            // One failed lookup shouldn't hide the others.
          }
        }),
      )
      const cards = sortCards([...found.values()])
      setOutcome({ reads, text, cards })
      if (cards.length === 1) setQuickCard(cards[0])
    },
    [setIdForCode],
  )

  /** Crop the strip under the guide from the live video, at full camera resolution. */
  async function scanFrame() {
    const video = videoRef.current
    const strip = stripRef.current
    if (!video || !strip || phase !== 'live') return
    setPhase('reading')
    try {
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
      const { text, candidates } = await readStrip(canvas, knownTotals)
      await lookUp(candidates, text)
    } finally {
      setPhase('live')
    }
  }

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
      const { text, candidates } = await readStrip(canvas, knownTotals)
      await lookUp(candidates, text)
    } finally {
      setPhase((p) => (p === 'reading' ? 'live' : p))
    }
  }

  const busy = phase === 'reading'

  return (
    <div className="fixed inset-0 z-30 overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Card-shaped guide; the huge shadow darkens everything outside it. */}
      <div className="absolute inset-0 flex items-center justify-center p-6" style={{ paddingBottom: 'calc(150px + env(safe-area-inset-bottom))', paddingTop: 'calc(80px + env(safe-area-inset-top))' }}>
        <div
          ref={guideRef}
          className="relative aspect-[63/88] max-h-full w-full max-w-[420px] rounded-[18px]"
          style={{ boxShadow: '0 0 0 9999px rgba(11,9,18,.72), 0 0 0 2px rgba(167,139,250,.9), 0 0 30px rgba(139,92,246,.6)' }}
        >
          <div
            ref={stripRef}
            className="absolute inset-x-2 bottom-2 h-[12%] rounded-[10px] border-2 border-dashed"
            style={{ borderColor: busy ? '#6ee7b7' : 'rgba(250,204,21,.9)', boxShadow: busy ? '0 0 20px rgba(52,211,153,.6)' : '0 0 16px rgba(250,204,21,.35)' }}
          />
          <div className="absolute inset-x-0 bottom-[calc(12%+18px)] text-center text-[13px] font-semibold text-[#fde047]" style={{ textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
            {busy ? 'Reading…' : 'Line up the number here'}
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <button type="button" onClick={() => navigate(-1)} className="flex h-11 items-center gap-1.5 rounded-full bg-black/55 pr-4 pl-3 text-[14px] font-semibold text-white backdrop-blur">
          <IconX size={18} /> Close
        </button>
        <span className="rounded-full bg-black/55 px-3.5 py-2 text-[12px] font-medium text-white/80 backdrop-blur">
          {ocrError ? "Scanner couldn't load" : ocrReady ? 'Ready' : 'Getting the scanner ready…'}
        </span>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
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
              aria-label="Scan card"
              disabled={phase !== 'live' || !ocrReady}
              onClick={scanFrame}
              className="grid h-[76px] w-[76px] place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#fef3c7,#f9a8d4 50%,#a78bfa)', boxShadow: '0 0 0 4px rgba(255,255,255,.15), 0 0 30px rgba(244,114,182,.5)' }}
            >
              {busy ? <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#1b1030]/30 border-t-[#1b1030]" /> : <IconCamera size={30} className="text-[#1b1030]" />}
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
          <h2 className="text-[18px] font-bold tracking-tight">{outcome.cards.length ? `${outcome.cards.length} cards match` : r ? 'No card found' : "Couldn't read the number"}</h2>
          <div className="mono truncate text-[11.5px] text-mute">{r ? `Read as ${readAs}` : 'Try again with the number inside the yellow box'}</div>
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
            <span className="eyebrow">Search for it instead</span>
            <div className="flex gap-2">
              <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name or number, like 128/142" />
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
