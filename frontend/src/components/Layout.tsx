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
  { to: '/dashboard',  Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/properties', Icon: Building2,        label: 'Properties' },
  { to: '/alerts',     Icon: Bell,             label: 'Market Alerts' },
  { to: '/searches',   Icon: Search,           label: 'Saved Searches' },
  { to: '/reports',    Icon: FileBarChart2,    label: 'Reports' },
]

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex justify-center w-full">
      {children}
      <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-50
                      opacity-0 group-hover/tip:opacity-100 translate-x-1 group-hover/tip:translate-x-0
                      transition-all duration-150">
        <div className="bg-ink text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
          {label}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ink" />
        </div>
      </div>
    </div>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { lang, setLang } = useLang()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">

      {/* ── Icon sidebar (desktop) ─────────────────────────────────────── */}
      <aside className="hidden md:flex w-[64px] shrink-0 bg-white border-r border-surface-border flex-col items-center py-4 gap-1 z-30 shadow-sm">

        {/* Quartis logo mark */}
        <Link to="/" className="mb-5 group/logo" title="Arpent">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-md
                          group-hover/logo:shadow-lg group-hover/logo:scale-105 transition-all duration-200">
            <QuartisIcon size={18} className="text-white" />
          </div>
        </Link>

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1 flex-1 w-full">
          {NAV.map(({ to, Icon, label }) => (
            <Tip key={to} label={label}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150',
                    isActive
                      ? 'bg-accent text-white shadow-md'
                      : 'text-muted hover:text-ink hover:bg-surface-hover',
                  )
                }
              >
                <Icon size={18} />
              </NavLink>
            </Tip>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-1 mt-auto w-full">
          {/* Saved Properties */}
          <Tip label="Saved Properties">
            <NavLink
              to="/watching"
              className={({ isActive }) =>
                clsx(
                  'w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150',
                  isActive ? 'bg-accent text-white shadow-md' : 'text-muted hover:text-ink hover:bg-surface-hover',
                )
              }
            >
              <Bookmark size={18} />
            </NavLink>
          </Tip>

          {/* Admin dashboard — admins only */}
          {user?.role === 'admin' && (
            <Tip label="Admin Dashboard">
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  clsx(
                    'w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150',
                    isActive ? 'bg-accent text-white shadow-md' : 'text-muted hover:text-ink hover:bg-surface-hover',
                  )
                }
              >
                <ShieldCheck size={18} />
              </NavLink>
            </Tip>
          )}

          {/* Settings */}
          <Tip label="Settings">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                clsx(
                  'w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150',
                  isActive ? 'bg-accent text-white shadow-md' : 'text-muted hover:text-ink hover:bg-surface-hover',
                )
              }
            >
              <Settings size={18} />
            </NavLink>
          </Tip>

          {/* Logout */}
          <Tip label="Logout">
            <button
              onClick={handleLogout}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:text-ink hover:bg-surface-hover transition-all duration-150"
            >
              <LogOut size={18} />
            </button>
          </Tip>

          {/* Language toggle */}
          <div className="mt-2 flex flex-col gap-0.5 items-center w-full px-3">
            {(['fr', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={clsx(
                  'w-full py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all duration-150 text-center',
                  lang === l ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink hover:bg-surface-hover',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-surface-border flex items-center px-4 gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-md">
          <QuartisIcon size={14} className="text-white" />
        </div>
        <span className="font-black text-sm text-ink tracking-wide flex-1">Arpent</span>
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
            {NAV.map(({ to, Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')
                }
              >
                <Icon size={16} />{label}
              </NavLink>
            ))}
            <div className="pt-3 border-t border-surface-border mt-3 space-y-0.5">
              <NavLink to="/watching" onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}
              >
                <Bookmark size={16} /> Saved Properties
              </NavLink>
              <NavLink to="/settings" onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}
              >
                <Settings size={16} /> Settings
              </NavLink>
              {user?.role === 'admin' && (
                <NavLink to="/admin" onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'bg-accent text-white' : 'text-muted hover:text-ink hover:bg-surface-hover')}
                >
                  <ShieldCheck size={16} /> Admin Dashboard
                </NavLink>
              )}
              <button
                onClick={() => { setMobileOpen(false); handleLogout() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-ink hover:bg-surface-hover transition-all"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0 md:pt-0 pt-14">
        <PageViewTracker />
        <ScrapeProgressBar />
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>

      <CompareBar />
    </div>
  )
}
