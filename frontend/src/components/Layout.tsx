import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Bookmark, Settings, LogOut } from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'

export default function Layout() {
  const { t, lang, setLang } = useLang()

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-surface-card border-r border-surface-border flex flex-col">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-black">QR</span>
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-wide">QUÉBEC RE</span>
              <p className="text-[10px] text-muted leading-tight">Investment Intelligence</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <NavItem to="/dashboard"   icon={<LayoutDashboard size={15} />} label={t('dashboard')} />
          <NavItem to="/properties"  icon={<Building2 size={15} />}       label={t('properties')} />
          <NavItem to="/watching"    icon={<Bookmark size={15} />}         label={t('watching')} />

          <div className="pt-3 pb-1">
            <p className="px-3 text-[10px] font-semibold text-muted uppercase tracking-widest">
              Account
            </p>
          </div>
          <NavItem to="/settings" icon={<Settings size={15} />} label={t('settings')} />
        </nav>

        {/* Footer: language + logout */}
        <div className="p-3 border-t border-surface-border space-y-2">
          {/* Language toggle */}
          <div className="flex items-center gap-1 p-0.5 bg-surface rounded-lg">
            {(['fr', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={clsx(
                  'flex-1 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors',
                  lang === l
                    ? 'bg-accent text-white shadow'
                    : 'text-muted hover:text-slate-300',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-slate-200 hover:bg-surface-hover transition-colors">
            <LogOut size={13} />
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive
            ? 'bg-accent/15 text-accent font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
