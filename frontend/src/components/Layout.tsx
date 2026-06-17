import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Bookmark, Settings,
  Bell, Search, FileBarChart2, TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'
import ScrapeProgressBar from './ScrapeProgressBar'

export default function Layout() {
  const { t, lang, setLang } = useLang()

  return (
    <div className="flex h-screen overflow-hidden bg-surface">

      {/* ── Sidebar (dark, sticky) ───────────────────────────────────────── */}
      <aside className="w-60 shrink-0 bg-sidebar flex flex-col shadow-sidebar overflow-y-auto z-20">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0 shadow-lg">
              <TrendingUp size={16} className="text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-wide">QUÉBEC RE</span>
              <p className="text-[10px] text-sidebar-text leading-tight">Investment Intelligence</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 pt-4">

          <NavSection label="Overview">
            <NavItem to="/dashboard"  icon={<LayoutDashboard size={15} />} label={t('dashboard')} />
            <NavItem to="/properties" icon={<Building2 size={15} />}       label={t('properties')} />
          </NavSection>

          <NavSection label="My Lists">
            <NavItem to="/watching"  icon={<Bookmark size={15} />}     label="Saved Properties" />
            <NavItem to="/alerts"    icon={<Bell size={15} />}         label="Market Alerts" />
            <NavItem to="/searches"  icon={<Search size={15} />}       label="Saved Searches" />
            <NavItem to="/reports"   icon={<FileBarChart2 size={15} />} label="Reports" />
          </NavSection>

          <NavSection label="Account">
            <NavItem to="/settings" icon={<Settings size={15} />} label={t('settings')} />
          </NavSection>
        </nav>

        {/* Footer: language toggle */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-1 p-0.5 bg-white/5 rounded-lg border border-white/10">
            {(['fr', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={clsx(
                  'flex-1 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all duration-150',
                  lang === l
                    ? 'bg-accent text-white shadow'
                    : 'text-sidebar-text hover:text-white',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main content (scrolls independently) ────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <ScrapeProgressBar />
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="px-3 text-[10px] font-semibold text-sidebar-heading uppercase tracking-widest mb-1.5">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-accent text-white shadow-md'
            : 'text-sidebar-text hover:text-white hover:bg-sidebar-hover',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
