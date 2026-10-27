import { NavLink, useLocation } from 'react-router-dom'
import { useFriends } from '../lib/queries'

// 24px stroke paths from the design handoff (Swaps is two arrows passing each other).
const ITEMS = [
  { to: '/', label: 'Home', d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', match: (p: string) => p === '/' },
  { to: '/sets', label: 'Sets', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', match: (p: string) => p === '/sets' || p.startsWith('/set/') || p.startsWith('/custom') },
  { to: '/add', label: 'Add', d: 'M12 5v14M5 12h14', match: (p: string) => p.startsWith('/add') || p.startsWith('/card/') },
  { to: '/value', label: 'Trends', d: 'M3 17l6-6 4 4 8-8M15 7h6v6', match: (p: string) => p.startsWith('/value') },
  { to: '/swaps', label: 'Swaps', d: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', match: (p: string) => p.startsWith('/swaps') },
]

const icon = (d: string) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

/** Floating pill tab bar, icons only. Add sits in the middle as a round gradient button. */
export function Nav() {
  const { pathname } = useLocation()
  const friends = useFriends()
  const requests = (friends.data ?? []).filter((f) => f.incoming && f.status === 'pending').length

  return (
    <nav
      aria-label="Main"
      className="fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5"
      style={{
        bottom: 'calc(22px + env(safe-area-inset-bottom))',
        background: 'rgba(24,19,36,.82)',
        border: '1px solid rgba(255,255,255,.1)',
        WebkitBackdropFilter: 'blur(18px)',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 12px 40px rgba(0,0,0,.35)',
      }}
    >
      {ITEMS.map(({ to, label, d, match }) => {
        const active = match(pathname)
        if (label === 'Add') {
          return (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="mx-1 grid h-[50px] w-[50px] place-items-center rounded-full text-[#1b1030] transition-transform active:scale-95"
              style={{
                background: 'linear-gradient(135deg,#fef3c7,#f9a8d4 50%,#a78bfa)',
                boxShadow: active ? '0 0 0 2px #fff, 0 0 26px rgba(244,114,182,.7)' : '0 0 18px rgba(244,114,182,.45)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
                <path d={d} />
              </svg>
            </NavLink>
          )
        }
        return (
          <NavLink
            key={to}
            to={to}
            aria-label={requests && label === 'Swaps' ? `${label}, ${requests} friend request${requests > 1 ? 's' : ''}` : label}
            aria-current={active ? 'page' : undefined}
            className="relative grid h-[50px] w-[54px] place-items-center rounded-full transition-all duration-[250ms]"
            style={
              active
                ? { color: '#fff', background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 0 24px rgba(139,92,246,.6)' }
                : { color: 'var(--color-nav-ink)' }
            }
          >
            {icon(d)}
            {label === 'Swaps' && requests > 0 && (
              <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-[#f472b6]" style={{ boxShadow: '0 0 0 2px rgba(24,19,36,.9), 0 0 8px #f472b6' }} />
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
