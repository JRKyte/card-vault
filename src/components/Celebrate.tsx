import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 12–16 small pieces fired out from behind the card. Remount (change `key`) to fire again. */
export function Burst({ colors }: { colors: string[] }) {
  const pieces = useMemo(() => {
    const n = 14
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4
      const dist = 150 + Math.random() * 110
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 30,
        rot: Math.random() * 540 - 270,
        color: colors[i % colors.length],
        delay: Math.random() * 60,
        dur: 560 + Math.random() * 180,
        round: i % 3 === 0,
      }
    })
  }, [colors])
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              background: p.color,
              borderRadius: p.round ? '50%' : 3,
              width: p.round ? 10 : 9,
              height: p.round ? 10 : 14,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`,
              '--delay': `${p.delay}ms`,
              '--dur': `${p.dur}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** Full-screen confetti and a "Set mastered!" toast, about 1.5s. */
export function MasteredCelebration({ setName, colors, onDone }: { setName: string; colors: string[]; onDone: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        drift: Math.random() * 160 - 80,
        rot: Math.random() * 900 - 450,
        delay: Math.random() * 450,
        dur: 1100 + Math.random() * 500,
        color: colors[i % colors.length],
      })),
    [colors],
  )
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => done.current(), 2600)
    return () => clearTimeout(t)
  }, [])
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-live="polite">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-rain"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              '--drift': `${p.drift}px`,
              '--rot': `${p.rot}deg`,
              '--delay': `${p.delay}ms`,
              '--dur': `${p.dur}ms`,
            } as React.CSSProperties
          }
        />
      ))}
      <div className="absolute inset-x-0 top-[38%] flex justify-center px-4">
        <div
          className="animate-pop rounded-[26px] px-8 py-6 text-center text-white"
          style={{ background: 'linear-gradient(135deg,#2b1458,#160c2b 60%,#0e0a1a)', boxShadow: '0 0 0 1px rgba(167,139,250,.5), 0 0 60px rgba(139,92,246,.5)' }}
        >
          <div className="eyebrow !text-accent-2">Set mastered!</div>
          <div className="mt-1.5 text-[30px] font-extrabold tracking-[-.03em]" style={{ textShadow: '0 0 24px rgba(196,181,253,.6)' }}>
            {setName}
          </div>
          <div className="mt-1 text-[14px] text-[#cbc4dd]">You've got every card.</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Animate a number from its previous value to `target`. */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    if (start === target || reducedMotion()) {
      from.current = target
      setValue(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - t) ** 3
      setValue(start + (target - start) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = target
    }
  }, [target, duration])
  return value
}
