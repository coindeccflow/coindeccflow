import { CirclePlus, LayoutDashboard, Layers, ListChecks, Activity, Settings, X, type LucideIcon } from 'lucide-react'
import { Link } from '@/components/Link'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Route } from '@/hooks/useRoute'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  match: Route['name'][]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, match: ['dashboard'] },
  { to: '/agreements', label: 'Agreements', icon: Layers, match: ['agreements', 'agreement'] },
  { to: '/create', label: 'Create Agreement', icon: CirclePlus, match: ['create'] },
  { to: '/milestones', label: 'Milestones', icon: ListChecks, match: ['milestones'] },
  { to: '/activity', label: 'Activity', icon: Activity, match: ['activity'] },
  { to: '/settings', label: 'Settings', icon: Settings, match: ['settings'] },
]

export function Logo({ hideNameOnTiny = false }: { hideNameOnTiny?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="CoindeccFlow overview">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-mint shadow-glow">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 8c3 0 3-3 6-3s3 3 6 3 3-3 6-3M3 14c3 0 3-3 6-3s3 3 6 3 3-3 6-3M3 20c3 0 3-3 6-3s3 3 6 3 3-3 6-3"
            stroke="#050B18"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className={`font-display text-[20px] font-bold leading-none tracking-tight text-fg ${hideNameOnTiny ? 'max-[419px]:hidden' : ''}`}>CoindeccFlow</span>
    </Link>
  )
}

/** Sidebar content, shared by the desktop rail and the mobile drawer. */
export function SidebarContent({ route, onNavigate, onClose }: { route: Route; onNavigate?: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2 pb-6 pt-1">
        <Logo />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-raised hover:text-fg"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, match }) => {
          const active = match.includes(route.name)
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex min-h-[46px] items-center gap-3 rounded-xl px-3.5 text-[14.5px] font-medium transition ${
                active ? 'bg-brand/10 text-fg' : 'text-muted hover:bg-raised hover:text-fg'
              }`}
            >
              {active ? <span className="absolute -left-3 top-2.5 h-[calc(100%-20px)] w-1 rounded-full bg-brand" aria-hidden /> : null}
              <Icon size={18} className={active ? 'text-brand' : 'transition group-hover:text-fg'} aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-4 pt-8">
        <ThemeToggle />
        <p className="px-1 text-center text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Powered by CoindeccPay</p>
      </div>
    </div>
  )
}

/** Fixed desktop rail. */
export function DesktopSidebar({ route }: { route: Route }) {
  return (
    <aside className="fixed inset-y-3 left-3 z-30 hidden w-[264px] rounded-[24px] border border-line bg-sidebar p-4 pl-5 shadow-card lg:block">
      <SidebarContent route={route} />
    </aside>
  )
}

/** Slide-out drawer for small screens, with a blurred backdrop. */
export function MobileDrawer({ route, open, onClose }: { route: Route; open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close menu"
        onClick={onClose}
        className={`absolute inset-0 bg-ink/60 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`absolute inset-y-0 left-0 w-[min(300px,86vw)] rounded-r-[24px] border-r border-line bg-sidebar p-4 pl-5 shadow-card transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent route={route} onNavigate={onClose} onClose={onClose} />
      </aside>
    </div>
  )
}
