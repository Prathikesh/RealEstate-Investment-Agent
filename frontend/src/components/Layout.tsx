import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Bookmark, Settings,
  Bell, Search, FileBarChart2, Menu, X, LogOut, ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import PageViewTracker from '../analytics/PageViewTracker'
import ScrapeProgressBar from './ScrapeProgressBar'
import CompareBar from './CompareBar'
import { QuartisIcon } from './QuartisLogo'

const NAV = [
  { to: '/dashboard',  Icon: LayoutDashboard, labelKey: 'dashboard' },
  { to: '/properties', Icon: Building2,        labelKey: 'properties' },
  { to: '/alerts',     Icon: Bell,             labelKey: 'nav_marketAlerts' },
  { to: '/searches',   Icon: Search,           labelKey: 'nav_savedSearches' },
  { to: '/reports',    Icon: FileBarChart2,    labelKey: 'nav_reports' },
]

// ── Sidebar link (icon + label; label reveals when the rail expands) ──────────

function SideLink({ to, Icon, label }: { to: string; Icon: typeof Bookmark; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx('group relative flex items-center h-11 transition-colors', isActive ? 'text-accent' : 'text-muted hover:text-ink')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-accent" />}
          <span className="grid place-items-center w-[76px] shrink-0">
            <span className={clsx('grid place-items-center w-10 h-10 rounded-xl transition-colors', isActive ? 'bg-accent/10' : 'group-hover:bg-surface-hover')}>
              <Icon size={20} />
            </span>
          </span>
          {/* flex-1 + min-w-0 so long FR labels ("Recherches enregistrées") wrap
              within the rail instead of clipping under overflow-hidden. */}
          <span className="text-sm font-semibold leading-tight flex-1 min-w-0 pr-4">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { lang, setLang, t } = useLang()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = user?.name
    ? user.name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">

      {/* ── Sidebar (desktop): always-expanded rail ─────────────────────── */}
      <aside className="hidden md:block relative w-[240px] shrink-0 z-30">
        <div className="absolute inset-y-0 left-0 flex flex-col w-[240px]
                        bg-white border-r border-surface-border shadow-sm overflow-hidden">

          {/* Logo */}
          <Link to="/" className="flex items-center h-16 shrink-0" title="PlexAI">
            <span className="grid place-items-center w-[76px] shrink-0">
              <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-md">
                <QuartisIcon size={20} className="text-white" />
              </span>
            </span>
            <span className="font-black text-lg text-ink tracking-tight whitespace-nowrap">PlexAI</span>
          </Link>

          {/* Primary nav */}
          <nav className="flex-1 py-2 space-y-1">
            {NAV.map(item => <SideLink key={item.to} to={item.to} Icon={item.Icon} label={t(item.labelKey)} />)}
          </nav>

          {/* Utility nav */}
          <div className="py-2 space-y-1 border-t border-surface-border">
            <SideLink to="/watching" Icon={Bookmark} label={t('nav_savedProperties')} />
            {user?.role === 'admin' && <SideLink to="/admin" Icon={ShieldCheck} label={t('nav_adminDashboard')} />}
            <SideLink to="/settings" Icon={Settings} label={t('settings')} />
          </div>

          {/* Account */}
          <div className="border-t border-surface-border py-3 space-y-2">
            <div className="flex items-center">
              <span className="grid place-items-center w-[76px] shrink-0">
                <span className="w-9 h-9 rounded-full bg-accent/10 text-accent text-xs font-bold grid place-items-center">{initials}</span>
              </span>
              <div className="min-w-0 pr-3">
                <p className="text-xs font-semibold text-ink truncate">{user?.name ?? 'Investor'}</p>
                <p className="text-[10px] text-muted truncate">{user?.email}</p>
              </div>
            </div>

            <button onClick={handleLogout}
              className="w-full flex items-center h-10 text-muted hover:text-ink hover:bg-surface-hover transition-colors">
              <span className="grid place-items-center w-[76px] shrink-0"><LogOut size={20} /></span>
              <span className="text-sm font-semibold whitespace-nowrap">{t('logout')}</span>
            </button>

            <div className="flex items-center">
              <span className="w-[76px] shrink-0" />
              <div className="flex gap-1">
                {(['fr', 'en'] as const).map(l => (
                  <button key={l} onClick={() => setLang(l)}
                    className={clsx('px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors',
                      lang === l ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-surface-border flex items-center px-4 gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-md">
          <QuartisIcon size={14} className="text-white" />
        </div>
        <span className="font-black text-sm text-ink tracking-wide flex-1">PlexAI</span>
        <div className="flex items-center gap-1 p-0.5 bg-surface rounded-lg border border-surface-border">
          {(['fr', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={clsx('px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all', lang === l ? 'bg-accent text-white' : 'text-muted')}
            >
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surface-hover transition-all">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-14">
          <div className="absolute inset-0 bg-black/20" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-white w-56 h-full shadow-xl p-3 space-y-0.5">
            {NAV.map(({ to, Icon, labelKey }) => (
              <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')
                }
              >
                <Icon size={16} />{t(labelKey)}
              </NavLink>
            ))}
            <div className="pt-3 border-t border-surface-border mt-3 space-y-0.5">
              <NavLink to="/watching" onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}
              >
                <Bookmark size={16} /> {t('nav_savedProperties')}
              </NavLink>
              <NavLink to="/settings" onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}
              >
                <Settings size={16} /> {t('settings')}
              </NavLink>
              {user?.role === 'admin' && (
                <NavLink to="/admin" onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}
                >
                  <ShieldCheck size={16} /> {t('nav_adminDashboard')}
                </NavLink>
              )}
              <button
                onClick={() => { setMobileOpen(false); handleLogout() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-surface-hover transition-all"
              >
                <LogOut size={16} /> {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0 md:pt-0 pt-14">
        <PageViewTracker />
        <ScrapeProgressBar />
        {/* Content scaled to the calibrated 125% on desktop. Applied here (not
            on the shell) so the sidebar/app-shell keep native viewport height
            and the sidebar stays fixed instead of scrolling. */}
        <div className="animate-fade-in md:[zoom:1.25]">
          <Outlet />
        </div>
      </main>

      <CompareBar />
    </div>
  )
}
