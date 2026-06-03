import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Home, Zap, TrendingUp, BarChart2, ArrowDownCircle, Activity } from 'lucide-react'
import { fetchStats, fetchProperties } from '../api'
import { useLang } from '../context/LanguageContext'
import PropertyCardGrid from '../components/PropertyCardGrid'

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:      string
  value:      string | number
  icon:       React.ReactNode
  iconColor:  string
  borderClass:string
  loading?:   boolean
}

function StatCard({ label, value, icon, iconColor, borderClass, loading }: StatCardProps) {
  return (
    <div className={`card flex flex-col gap-3 ${borderClass}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-20 bg-surface-border rounded animate-pulse" />
          <div className="h-3 w-24 bg-surface-border/60 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums">{value}</p>
          <p className="text-xs text-muted mt-0.5">{label}</p>
        </div>
      )}
    </div>
  )
}

// ── New listings sidebar ──────────────────────────────────────────────────────

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
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
    queryFn: () => fetchProperties({ sort_by: 'newest', page_size: 6 }),
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">{t('dashboard')}</h1>
        <p className="text-sm text-muted mt-0.5">Quebec real estate investment overview</p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label={t('propertiesInArea')}
          value={stats?.total_properties.toLocaleString() ?? '—'}
          icon={<Home size={16} className="text-blue-400" />}
          iconColor="bg-blue-400/15"
          borderClass="stat-border-blue"
          loading={statsLoading}
        />
        <StatCard
          label={t('newToday')}
          value={stats?.new_today ?? '—'}
          icon={<Zap size={16} className="text-accent" />}
          iconColor="bg-accent/15"
          borderClass="stat-border-purple"
          loading={statsLoading}
        />
        <StatCard
          label={t('strongOpps')}
          value={stats?.strong_opportunities ?? '—'}
          icon={<TrendingUp size={16} className="text-score-strong" />}
          iconColor="bg-score-strong/15"
          borderClass="stat-border-green"
          loading={statsLoading}
        />
        <StatCard
          label={t('worthInvest')}
          value={stats?.worth_investigating ?? '—'}
          icon={<BarChart2 size={16} className="text-score-worth" />}
          iconColor="bg-score-worth/15"
          borderClass="stat-border-purple"
          loading={statsLoading}
        />
        <StatCard
          label={t('priceDrops')}
          value={stats?.price_drops_today ?? '—'}
          icon={<ArrowDownCircle size={16} className="text-score-notrecommended" />}
          iconColor="bg-score-notrecommended/15"
          borderClass="stat-border-red"
          loading={statsLoading}
        />
        <StatCard
          label={t('avgScore')}
          value={stats?.avg_score != null ? `${stats.avg_score}/100` : '—'}
          icon={<Activity size={16} className="text-muted" />}
          iconColor="bg-surface-hover"
          borderClass="stat-border-muted"
          loading={statsLoading}
        />
      </div>

      {/* ── Top opportunities (grid) ────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">{t('topOpps')}</h2>
          <Link
            to="/properties?sort_by=score&score_min=60"
            className="text-xs text-accent hover:underline"
          >
            {t('viewAll')}
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
            <p className="text-xs text-surface-border mt-1">
              uvicorn app.main:app → APScheduler will trigger automatically.
            </p>
          </div>
        )}
      </div>

      {/* ── New listings ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">{t('newListings')}</h2>
          <Link to="/properties?sort_by=newest" className="text-xs text-accent hover:underline">
            {t('viewAll')}
          </Link>
        </div>
        <div className="card p-0 divide-y divide-surface-border">
          {newListings?.items.map(p => (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-300 truncate hover:text-white">{p.full_address}</p>
                <p className="text-xs text-muted">{p.city} · {p.property_type.replace(/_/g, ' ')}</p>
              </div>
              <p className="text-sm font-mono font-semibold text-slate-200 shrink-0 ml-4 tabular-nums">
                {fmtCAD(p.asking_price)}
              </p>
            </Link>
          ))}
          {!newListings?.items.length && (
            <div className="px-5 py-8 text-center text-muted text-sm">
              No new listings recorded today.
            </div>
          )}
        </div>
      </div>

      {/* ── Coverage ────────────────────────────────────────────────────── */}
      {stats?.cities && stats.cities.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-200">{t('coverage')}</h2>
          <div className="flex flex-wrap gap-2">
            {stats.cities.map(city => (
              <Link
                key={city}
                to={`/properties?city=${encodeURIComponent(city)}`}
                className="px-3 py-1 bg-surface-card border border-surface-border rounded-full text-xs text-muted hover:text-slate-200 hover:border-accent/40 transition-colors"
              >
                {city}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden animate-pulse">
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
