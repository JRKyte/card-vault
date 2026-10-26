import { NavLink, useLocation } from 'react-router-dom'

// 24px stroke paths from the design handoff.
const ITEMS = [
  { to: '/', label: 'Home', d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', match: (p: string) => p === '/' },
  { to: '/sets', label: 'Sets', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', match: (p: string) => p === '/sets' || p.startsWith('/set/') || p.startsWith('/custom') },
  { to: '/add', label: 'Add', d: 'M12 5v14M5 12h14', match: (p: string) => p.startsWith('/add') || p.startsWith('/card/') },
  { to: '/value', label: 'Trends', d: 'M3 17l6-6 4 4 8-8M15 7h6v6', match: (p: string) => p.startsWith('/value') },
]

/** Floating pill tab bar, on every device size. */
export function Nav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Main"
      className="fixed left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full p-1.5"
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
        return (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className="flex h-[50px] items-center gap-2 rounded-full text-[14px] font-semibold transition-all duration-[250ms]"
            style={
              active
                ? { padding: '0 20px', color: '#fff', background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 0 24px rgba(139,92,246,.6)' }
                : { padding: '0 16px', color: 'var(--color-nav-ink)' }
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={d} />
            </svg>
            {active && <span>{label}</span>}
          </NavLink>
        )
      })}
    </nav>
  )
}
