import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { alpha } from '../lib/color'
import { useGoUp, type ParentMatch } from '../lib/trail'
import { IconChevronLeft } from './icons'

/**
 * A screen: the violet/pink ambient glow at the top plus the content column. `glow` adds a second
 * ambient in one colour (the card's type colour on the card screen).
 */
export function Screen({ glow, children, className = '' }: { glow?: string; children: ReactNode; className?: string }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[700px]" style={{ background: 'var(--ambient)' }} />
      {glow && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px]"
          style={{ background: `radial-gradient(60% 45% at 50% 28%, ${alpha(glow, 0.2)}, transparent 70%)` }}
        />
      )}
      <main className={`page pt-safe ${className}`}>{children}</main>
    </>
  )
}

/** True once the page has scrolled past `y` pixels. */
function useScrolledPast(y: number) {
  const [past, setPast] = useState(() => typeof window !== 'undefined' && window.scrollY > y)
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > y)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [y])
  return past
}

/**
 * Back pill. Goes back in history when there is some, else to `fallback`. Once the page scrolls
 * past it, a floating copy appears bottom-left so long pages don't need scrolling back up.
 */
/**
 * Back to the parent screen `to` (a path, or a test for any acceptable parent). Without `to`, just
 * one step back. Either way, `fallback` opens in place of this screen when there's nowhere to go.
 */
export function BackPill({ label, to, fallback }: { label: string; to?: ParentMatch; fallback?: string }) {
  const navigate = useNavigate()
  const goUp = useGoUp()
  const floating = useScrolledPast(120)
  const go = () => {
    if (to) goUp(to, fallback)
    else if (window.history.state?.idx > 0) navigate(-1)
    else navigate(fallback ?? '/', { replace: true })
  }
  return (
    <>
      <button type="button" className="chip-btn max-w-full !pl-3" onClick={go}>
        <IconChevronLeft size={16} strokeWidth={2.4} />
        <span className="truncate">{label}</span>
      </button>
      {floating &&
        createPortal(
          <button
            type="button"
            onClick={go}
            aria-label={label}
            className="animate-fade-up fixed left-4 z-40 flex h-[50px] max-w-[60vw] items-center gap-1.5 rounded-full pr-5 pl-3.5 text-[14px] font-semibold text-ink"
            style={{
              bottom: 'calc(22px + env(safe-area-inset-bottom))',
              background: 'rgba(24,19,36,.82)',
              border: '1px solid rgba(255,255,255,.1)',
              WebkitBackdropFilter: 'blur(18px)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 12px 40px rgba(0,0,0,.35)',
            }}
          >
            <IconChevronLeft size={20} strokeWidth={2.4} />
            <span className="truncate">{label}</span>
          </button>,
          document.body,
        )}
    </>
  )
}

/** Muted status pill with a dot, e.g. "You don't have this one yet". */
export function StatusPill({ children, dot = 'var(--color-mute)' }: { children: ReactNode; dot?: string }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--chip)] px-3.5 text-[12px] font-medium whitespace-nowrap text-mute">
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: dot, boxShadow: dot === 'var(--color-mute)' ? undefined : `0 0 8px ${dot}` }} />
      {children}
    </span>
  )
}

export function TopRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2.5">
      <div className="min-w-0">{left}</div>
      {right && <div className="min-w-0 shrink">{right}</div>}
    </div>
  )
}

/** Eyebrow + big title, with optional content on the right. */
export function PageHeader({ eyebrow, title, right }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="title">{title}</h1>
      </div>
      {right}
    </header>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} type="button" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Glowing progress bar. A sliver always shows once there's progress. */
export function ProgressBar({ pct, color, height = 6, className = '' }: { pct: number; color: string; height?: number; className?: string }) {
  return (
    <div className={`relative w-full rounded-full ${className}`} style={{ height, background: 'var(--track)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
        style={{ width: pct > 0 ? `${Math.max(pct, 3)}%` : 0, background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </div>
  )
}

/** Tinted chip, e.g. the card's type / subtype / HP. */
export function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: alpha(color, 0.14), color: tint(color) }}>
      {children}
    </span>
  )
}

/** A lighter version of a colour for text on dark backgrounds. */
export function tint(color: string) {
  return `color-mix(in srgb, ${color} 70%, white)`
}

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function Message({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && (
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[rgba(139,92,246,.18)] text-accent-2" style={{ boxShadow: '0 0 24px rgba(139,92,246,.3)' }}>
          {icon}
        </div>
      )}
      <h2 className="text-[20px] font-bold tracking-tight">{title}</h2>
      {body && <p className="max-w-md text-[14px] text-mute">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorMessage({ error, retry }: { error: unknown; retry?: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <Message
      title={offline ? "You're offline" : 'Something went wrong'}
      body={offline ? 'Connect to the internet and try again.' : error instanceof Error ? error.message : 'Please try again.'}
      action={
        retry && (
          <button type="button" className="btn mt-2" onClick={retry}>
            Try again
          </button>
        )
      }
    />
  )
}

/** Bottom sheet / centred dialog. Portalled to <body> so no ancestor can trap `position: fixed`. */
export function Modal({ onClose, children, title }: { onClose: () => void; children: ReactNode; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] wide:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="animate-fade-up m-3 flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[26px] border border-[var(--line)] bg-[#141020]"
        style={{ marginBottom: 'max(12px, env(safe-area-inset-bottom))', boxShadow: '0 20px 60px rgba(0,0,0,.5), 0 0 60px rgba(139,92,246,.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
