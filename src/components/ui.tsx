import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { alpha, NEUTRAL_WASH } from '../lib/color'
import { IconChevronLeft } from './icons'

/** Sets the page wash. One hue per screen. */
export function Screen({ wash = NEUTRAL_WASH, children, className = '' }: { wash?: { base: string; blob: string }; children: ReactNode; className?: string }) {
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', wash.base)
  }, [wash.base])
  return (
    <>
      <div className="wash" style={{ backgroundColor: wash.base, ['--blob' as string]: wash.blob }} />
      <main className={`pt-safe pb-nav mx-auto w-full max-w-[1240px] px-4 sm:px-6 wide:px-10 ${className}`}>{children}</main>
    </>
  )
}

export function Grain() {
  return (
    <svg className="grain" width="100%" height="100%" aria-hidden>
      <filter id="grain-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-filter)" />
    </svg>
  )
}

/** Glass "back" pill. Goes back in history when there is some, else to `fallback`. */
export function BackPill({ label, to, fallback = '/' }: { label: string; to?: string; fallback?: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="glass pill text-[16px]"
      onClick={() => {
        if (to) navigate(to)
        else if (window.history.state?.idx > 0) navigate(-1)
        else navigate(fallback)
      }}
    >
      <IconChevronLeft size={20} />
      {label}
    </button>
  )
}

export function TopRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">{left}</div>
      {right && <div className="min-w-0 shrink">{right}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  label,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="glass inline-flex gap-1 rounded-full p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full font-semibold whitespace-nowrap transition-colors ${size === 'sm' ? 'min-h-9 px-3.5 text-[14px]' : 'min-h-11 px-5 text-[16px]'} ${
              active ? 'bg-ink text-white' : 'text-ink-2'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressBar({ pct, color, className = '' }: { pct: number; color: string; className?: string }) {
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full ${className}`} style={{ background: 'rgba(21,23,43,0.08)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, background: color }} />
    </div>
  )
}

export function Ring({ pct, color, size = 140 }: { pct: number; color: string; size?: number }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(21,23,43,0.08) 0deg)` }}
    >
      <div className="absolute grid place-items-center rounded-full bg-white/80 text-center" style={{ inset: size * 0.1 }}>
        <div>
          <div className="text-[34px] leading-none font-extrabold" style={{ color }}>
            {pct}%
          </div>
          <div className="mt-1 text-[13px] font-semibold text-ink-2">mastered</div>
        </div>
      </div>
    </div>
  )
}

export function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full px-3 text-[14px] font-semibold" style={{ background: alpha(color, 0.1), color }}>
      {children}
    </span>
  )
}

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function Message({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="glass-flat flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-full bg-ink/5 text-ink">{icon}</div>}
      <h2 className="text-[22px] font-bold">{title}</h2>
      {body && <p className="max-w-md text-[16px] text-ink-2">{body}</p>}
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
          <button type="button" className="btn-dark mt-2 min-h-12 text-[16px]" onClick={retry}>
            Try again
          </button>
        )
      }
    />
  )
}

/** Fixed bottom sheet / centred modal with blurred glass. Portalled to <body>, because a
 * backdrop-filter on any ancestor would otherwise trap `position: fixed` inside it. */
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 wide:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="glass animate-fade-up m-3 flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden !bg-white/80"
        style={{ marginBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
