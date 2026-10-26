import { NavLink, useLocation } from 'react-router-dom'
import { IconPlus, IconSets, IconValue } from './icons'

const ITEMS = [
  { to: '/', label: 'Sets', icon: IconSets, match: (p: string) => p === '/' || p.startsWith('/set/') || p.startsWith('/custom') },
  { to: '/add', label: 'Add', icon: IconPlus, match: (p: string) => p.startsWith('/add') },
  { to: '/value', label: 'Value', icon: IconValue, match: (p: string) => p.startsWith('/value') },
]

export function Nav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Main"
      className="fixed left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full p-2"
      style={{
        bottom: 'calc(28px + env(safe-area-inset-bottom))',
        background: 'rgba(21,23,43,0.92)',
        WebkitBackdropFilter: 'blur(24px)',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 14px 40px rgba(21,23,43,0.28)',
      }}
    >
      {ITEMS.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`flex h-14 items-center justify-center gap-2 rounded-full transition-all ${active ? 'bg-white/16 px-6 text-white' : 'w-16 text-nav-idle'}`}
          >
            <Icon size={26} />
            {active && <span className="text-[17px] font-bold">{label}</span>}
          </NavLink>
        )
      })}
    </nav>
  )
}
