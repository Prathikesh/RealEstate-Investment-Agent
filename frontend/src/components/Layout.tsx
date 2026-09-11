import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Bookmark, Settings,
  Bell, Search, FileBarChart2, Menu, X, LogOut, ShieldCheck, Sun, Moon,
} from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { useLang } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../auth/AuthContext'
import PageViewTracker from '../analytics/PageViewTracker'
import ScrapeProgressBar from './ScrapeProgressBar'
import CompareBar from './CompareBar'
import { AppWordmark } from './QuartisLogo'

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
        clsx(
          'group relative flex items-center gap-3 mx-3 px-3 h-11 rounded-xl transition-colors',
          isActive ? 'bg-accent/10 text-accent font-semibold' : 'text-muted hover:text-ink hover:bg-surface-hover',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-accent" />}
          <Icon size={19} className="shrink-0" />
          <span className="text-sm leading-tight flex-1 min-w-0">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { lang, setLang, t } = useLang()
  const { theme, toggle: toggleTheme } = useTheme()
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
                        bg-surface-card border-r border-surface-border shadow-sm overflow-hidden">

          {/* Logo */}
          <Link to="/" className="flex items-center h-16 shrink-0 pl-5" title="PlexAi">
            <AppWordmark iconSize={40} />
          </Link>

          {/* Primary nav */}
          <nav className="flex-1 py-2 space-y-1 overflow-y-auto">
            {NAV.map(item => <SideLink key={item.to} to={item.to} Icon={item.Icon} label={t(item.labelKey)} />)}
            <div className="my-2 mx-5 border-t border-surface-border" />
            <SideLink to="/watching" Icon={Bookmark} label={t('nav_savedProperties')} />
            {user?.role === 'admin' && <SideLink to="/admin" Icon={ShieldCheck} label={t('nav_adminDashboard')} />}
            <SideLink to="/settings" Icon={Settings} label={t('settings')} />
          </nav>

          {/* Account */}
          <div className="border-t border-surface-border p-3 space-y-2">
            {/* User card */}
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-indigo-500 text-white text-xs font-bold grid place-items-center shrink-0">{initials}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-ink truncate">{user?.name ?? 'Investor'}</p>
                <p className="text-[10px] text-muted truncate">{user?.email}</p>
              </div>
            </div>

            {/* Controls: theme · language · logout */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? t('theme_light') : t('theme_dark')}
                className="grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-ink hover:bg-surface-hover transition-colors"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-hover">
                {(['fr', 'en'] as const).map(l => (
                  <button key={l} onClick={() => setLang(l)}
                    className={clsx('px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors',
                      lang === l ? 'bg-surface-card text-accent shadow-sm' : 'text-muted hover:text-ink')}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={handleLogout} title={t('logout')}
                className="grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-score-market hover:bg-score-market/10 transition-colors">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="md:hidden print:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-surface-card border-b border-surface-border flex items-center px-4 gap-2 shadow-sm">
        <AppWordmark iconSize={28} />
        <div className="flex-1" />
        <button onClick={toggleTheme} className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surface-hover transition-all">
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
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
        <div className="md:hidden print:hidden fixed inset-0 z-30 pt-14">
          <div className="absolute inset-0 bg-black/20" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-surface-card w-56 h-full shadow-xl p-3 space-y-0.5">
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
      <main className="flex-1 overflow-y-auto min-w-0 md:pt-0 pt-14 print:pt-0 print:overflow-visible">
        <PageViewTracker />
        <ScrapeProgressBar />
        {/* Content zoom on desktop — dialled to ~1.125 (was 1.25) so the UI
            reads a notch smaller/denser, matching the preferred "90%" feel.
            Applied here (not on the shell) so the sidebar keeps native height. */}
        <div className="animate-fade-in md:[zoom:1.125]">
          <Outlet />
        </div>
      </main>

      <CompareBar />
    </div>
  )
}
