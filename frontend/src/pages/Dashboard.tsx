import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Home, Zap, TrendingUp, BarChart2, ArrowDownCircle, Activity, Globe,
  Clock, ChevronRight, Sparkles,
} from 'lucide-react'
import { fetchStats, fetchProperties } from '../api'
import { useLang } from '../context/LanguageContext'
import PropertyCardGrid from '../components/PropertyCardGrid'

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Metric strip item ─────────────────────────────────────────────────────────

interface MetricProps {
  label: string
  value: string | number
  sublabel: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  loading?: boolean
  to?: string
}

function Metric({ label, value, sublabel, icon, iconColor, iconBg, loading, to }: MetricProps) {
  const inner = (
    <div className="flex items-center gap-3 py-4 px-5 min-w-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0">
        {loading ? (
          <>
            <div className="h-6 w-14 bg-surface-border rounded animate-pulse mb-1" />
            <div className="h-3 w-20 bg-surface-border/60 rounded animate-pulse" />
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-ink font-mono tabular-nums leading-tight">{value}</p>
            <p className="text-xs text-muted mt-0.5 leading-tight">{sublabel}</p>
          </>
        )}
      </div>
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block hover:bg-surface-hover rounded-xl transition-all duration-150 group">
        {inner}
        <p className="text-[10px] text-muted/60 px-5 pb-2 font-medium group-hover:text-accent transition-colors">{label}</p>
      </Link>
    )
  }

  return (
    <div>
      {inner}
      <p className="text-[10px] text-muted/60 px-5 pb-2 font-medium">{label}</p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useLang()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 60_000,
  })

  const { data: topDeals, isLoading: dealsLoading } = useQuery({
    queryKey: ['properties', 'top-dashboard'],
    queryFn: () => fetchProperties({ sort_by: 'score', page_size: 6, score_min: 60 }),
  })

  const { data: newListings } = useQuery({
    queryKey: ['properties', 'newest-dashboard'],
    queryFn: () => fetchProperties({ sort_by: 'newest', page_size: 8 }),
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px] animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('dashboard')}</h1>
          <p className="text-sm text-muted mt-0.5">Quebec real estate investment overview</p>
        </div>
        <Link
          to="/properties?listed_within=24h"
          className="btn-primary shadow-md"
        >
          <Sparkles size={14} />
          New today
        </Link>
      </div>

      {/* ── Metrics strip ──────────────────────────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-y sm:divide-y-0 divide-surface-border">
          <Metric
            label="Total properties"
            value={stats?.total_properties.toLocaleString() ?? '—'}
            sublabel="in database"
            icon={<Home size={18} />}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            loading={statsLoading}
          />
          <Metric
            label="New listings"
            value={stats?.new_today ?? '—'}
            sublabel="added today"
            icon={<Zap size={18} />}
            iconColor="text-accent"
            iconBg="bg-accent/10"
            loading={statsLoading}
            to="/properties?listed_within=24h"
          />
          <Metric
            label="Great deals"
            value={stats?.strong_opportunities ?? '—'}
            sublabel="score 80+"
            icon={<TrendingUp size={18} />}
            iconColor="text-score-strong"
            iconBg="bg-score-strong/10"
            loading={statsLoading}
            to="/properties?score_min=80&sort_by=score"
          />
          <Metric
            label="Worth checking"
            value={stats?.worth_investigating ?? '—'}
            sublabel="score 60–79"
            icon={<BarChart2 size={18} />}
            iconColor="text-score-worth"
            iconBg="bg-score-worth/10"
            loading={statsLoading}
            to="/properties?score_min=60&score_max=79"
          />
          <Metric
            label="Price drops"
            value={stats?.price_drops_today ?? '—'}
            sublabel="since yesterday"
            icon={<ArrowDownCircle size={18} />}
            iconColor="text-red-500"
            iconBg="bg-red-50"
            loading={statsLoading}
            to="/properties?status=price_changed"
          />
          <Metric
            label="Avg deal score"
            value={stats?.avg_score != null ? `${stats.avg_score.toFixed(0)}` : '—'}
            sublabel="out of 100"
            icon={<Activity size={18} />}
            iconColor="text-muted"
            iconBg="bg-surface-hover"
            loading={statsLoading}
          />
          <Metric
            label="Multi-site listings"
            value={stats?.multi_site_properties ?? '—'}
            sublabel="compare prices"
            icon={<Globe size={18} />}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            loading={statsLoading}
            to="/properties?multi_site=true"
          />
        </div>
      </div>

      {/* ── Top opportunities ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-ink text-base">{t('topOpps')}</h2>
            <p className="text-xs text-muted">Best investment opportunities right now</p>
          </div>
          <Link
            to="/properties?sort_by=score&score_min=60"
            className="flex items-center gap-1 text-sm text-accent hover:underline font-semibold"
          >
            View all <ChevronRight size={14} />
          </Link>
        </div>

        {dealsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : topDeals?.items.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {topDeals.items.map(p => (
              <PropertyCardGrid key={p.id} property={p} />
            ))}
          </div>
        ) : (
          <div className="card py-10 text-center">
            <p className="text-muted text-sm">
              No scored properties yet — run the AI pipeline to generate scores.
            </p>
          </div>
        )}
      </div>

      {/* ── New listings + Quick filters ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* New listings — 2/3 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-ink text-base">{t('newListings')}</h2>
              <p className="text-xs text-muted">Recently added to database</p>
            </div>
            <Link to="/properties?sort_by=newest" className="flex items-center gap-1 text-sm text-accent hover:underline font-semibold">
              View all <ChevronRight size={14} />
            </Link>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden shadow-card divide-y divide-surface-border">
            {newListings?.items.map(p => (
              <Link
                key={p.id}
                to={`/properties/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-all duration-150 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink font-semibold truncate group-hover:text-accent transition-colors">{p.full_address}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted">{p.city} · {p.property_type.replace(/_/g, ' ')}</p>
                    {p.is_new && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-accent text-white">NEW</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-mono font-bold text-ink tabular-nums">
                    {fmtCAD(p.asking_price)}
                  </p>
                  <p className="text-[10px] text-muted flex items-center gap-0.5 justify-end mt-0.5">
                    <Clock size={9} /> {timeAgo(p.first_seen_at)}
                  </p>
                </div>
              </Link>
            ))}
            {!newListings?.items.length && (
              <div className="px-5 py-8 text-center text-muted text-sm">
                No new listings recorded today.
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: coverage + quick filters */}
        <div className="space-y-4">
          {/* Quick filters */}
          <div>
            <h2 className="font-bold text-ink text-base mb-3">Quick Filters</h2>
            <div className="bg-surface-card border border-surface-border rounded-2xl p-4 shadow-card space-y-1">
              {[
                { label: 'New last 24h',       to: '/properties?listed_within=24h',               color: 'text-accent',                  bg: 'bg-accent/8' },
                { label: 'Best deals (80+)',   to: '/properties?score_min=80&sort_by=score',       color: 'text-score-strong',            bg: 'bg-score-strong/8' },
                { label: 'Price drops',        to: '/properties?status=price_changed',             color: 'text-red-500',                 bg: 'bg-red-50' },
                { label: 'On multiple sites',  to: '/properties?multi_site=true',                  color: 'text-blue-600',                bg: 'bg-blue-50' },
                { label: 'Highest yield',      to: '/properties?sort_by=score&score_min=50',       color: 'text-score-market',            bg: 'bg-score-market/8' },
              ].map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold ${link.color} ${link.bg} hover:opacity-80 transition-all duration-150`}
                >
                  {link.label}
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          </div>

          {/* Cities coverage */}
          {stats?.cities && stats.cities.length > 0 && (
            <div>
              <h2 className="font-bold text-ink text-base mb-3">{t('coverage')}</h2>
              <div className="bg-surface-card border border-surface-border rounded-2xl p-4 shadow-card">
                <div className="flex flex-wrap gap-2">
                  {stats.cities.map(city => (
                    <Link
                      key={city}
                      to={`/properties?city=${encodeURIComponent(city)}`}
                      className="px-3 py-1.5 bg-surface border border-surface-border rounded-full text-xs text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-all duration-150 font-medium"
                    >
                      {city}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden animate-pulse shadow-card">
      <div className="aspect-video bg-surface-hover" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-24 bg-surface-border rounded" />
        <div className="h-4 w-48 bg-surface-border rounded" />
        <div className="h-6 w-32 bg-surface-border rounded" />
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map(i => <div key={i} className="h-10 bg-surface-border rounded" />)}
        </div>
      </div>
    </div>
  )
}
