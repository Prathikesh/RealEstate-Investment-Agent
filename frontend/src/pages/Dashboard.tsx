import { useQuery } from '@tanstack/react-query'
import { displayAddress } from '../lib/address'
import { Link } from 'react-router-dom'
import {
  Home, Zap, TrendingUp, BarChart2, ArrowDownCircle, Activity, Globe,
  Clock, ChevronRight, Sparkles, Building2,
} from 'lucide-react'
import { fetchStats, fetchProperties } from '../api'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import PropertyCardGrid from '../components/PropertyCardGrid'

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
}

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return t('time_justNow')
  if (hours < 24) return `${hours}${t('time_hAgo')}`
  const days = Math.floor(hours / 24)
  return `${days}${t('time_dAgo')}`
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
  const { user } = useAuth()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 60_000,
  })

  // When the broker has set their own scoring criteria, the "top opportunities"
  // section ranks by THEIR metrics (Your Verdict) instead of the AI score — the
  // client's "analyze every property on their own numbers" request, surfaced on
  // the home screen. Falls back to the AI ranking for brokers on defaults.
  const rankMode: 'ai' | 'your' = user?.custom_score_weights ? 'your' : 'ai'
  const { data: topDeals, isLoading: dealsLoading } = useQuery({
    queryKey: ['properties', 'top-dashboard', rankMode],
    queryFn: () => fetchProperties(
      rankMode === 'your'
        ? { sort_by: 'your_verdict', page_size: 12, your_score_min: 60 }
        : { sort_by: 'score', page_size: 12, score_min: 60 },
    ),
  })

  const { data: newListings } = useQuery({
    queryKey: ['properties', 'newest-dashboard'],
    queryFn: () => fetchProperties({ sort_by: 'newest', page_size: 8 }),
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('dashboard')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('dash_subtitle')}</p>
        </div>
        <Link
          to="/properties?listed_within=24h"
          className="btn-primary shadow-md"
        >
          <Sparkles size={14} />
          {t('dash_newToday')}
        </Link>
      </div>

      {/* ── Metrics strip ──────────────────────────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-y sm:divide-y-0 divide-surface-border">
          <Metric
            label={t("dash_m_total")}
            value={stats?.total_properties.toLocaleString() ?? '—'}
            sublabel={t("dash_m_total_sub")}
            icon={<Home size={18} />}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            loading={statsLoading}
          />
          <Metric
            label={t("dash_m_new")}
            value={stats?.new_today ?? '—'}
            sublabel={t("dash_m_new_sub")}
            icon={<Zap size={18} />}
            iconColor="text-accent"
            iconBg="bg-accent/10"
            loading={statsLoading}
            to="/properties?listed_within=24h"
          />
          <Metric
            label={t("dash_m_great")}
            value={stats?.strong_opportunities ?? '—'}
            sublabel={t("dash_m_great_sub")}
            icon={<TrendingUp size={18} />}
            iconColor="text-score-strong"
            iconBg="bg-score-strong/10"
            loading={statsLoading}
            to="/properties?score_min=80&sort_by=score"
          />
          <Metric
            label={t("dash_m_worth")}
            value={stats?.worth_investigating ?? '—'}
            sublabel={t("dash_m_worth_sub")}
            icon={<BarChart2 size={18} />}
            iconColor="text-score-worth"
            iconBg="bg-score-worth/10"
            loading={statsLoading}
            to="/properties?score_min=60&score_max=79"
          />
          <Metric
            label={t("dash_m_drops")}
            value={stats?.price_drops_today ?? '—'}
            sublabel={t("dash_m_drops_sub")}
            icon={<ArrowDownCircle size={18} />}
            iconColor="text-red-500"
            iconBg="bg-red-50"
            loading={statsLoading}
            to="/properties?status=price_changed"
          />
          <Metric
            label={t("dash_m_avg")}
            value={stats?.avg_score != null ? `${stats.avg_score.toFixed(0)}` : '—'}
            sublabel={t("dash_m_avg_sub")}
            icon={<Activity size={18} />}
            iconColor="text-muted"
            iconBg="bg-surface-hover"
            loading={statsLoading}
          />
          <Metric
            label={t("dash_m_multi")}
            value={stats?.multi_site_properties ?? '—'}
            sublabel={t("dash_m_multi_sub")}
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
            <p className="text-xs text-muted">
              {rankMode === 'your' ? t('dash_rankedYour') : t('dash_bestNow')}
            </p>
          </div>
          <Link
            to={rankMode === 'your' ? '/properties?sort_by=your_verdict' : '/properties?sort_by=score&score_min=60'}
            className="flex items-center gap-1 text-sm text-accent hover:underline font-semibold"
          >
            {t('dash_viewAll')} <ChevronRight size={14} />
          </Link>
        </div>

        {dealsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : topDeals?.items.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {topDeals.items.map(p => (
              <PropertyCardGrid key={p.id} property={p} rankMode={rankMode} />
            ))}
          </div>
        ) : (
          <div className="card py-10 text-center">
            <p className="text-muted text-sm">{t('dash_noScored')}</p>
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
              <p className="text-xs text-muted">{t('dash_recentlyAdded')}</p>
            </div>
            <Link to="/properties?sort_by=newest" className="flex items-center gap-1 text-sm text-accent hover:underline font-semibold">
              {t('dash_viewAll')} <ChevronRight size={14} />
            </Link>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden shadow-card divide-y divide-surface-border">
            {newListings?.items.map(p => (
              <Link
                key={p.id}
                to={`/properties/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-all duration-150 group"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-xl bg-surface-hover shrink-0 overflow-hidden border border-surface-border flex items-center justify-center">
                  {p.photos.length > 0
                    ? <img src={p.photos[0]} referrerPolicy="no-referrer" alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : <Building2 size={14} className="text-surface-border" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink font-semibold truncate group-hover:text-accent transition-colors">{displayAddress(p)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted">{p.city} · {p.property_type.replace(/_/g, ' ')}</p>
                    {p.is_new && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-accent text-white">{t('newBadge')}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-bold text-ink tabular-nums">{fmtCAD(p.asking_price)}</p>
                  <p className="text-[10px] text-muted flex items-center gap-0.5 justify-end mt-0.5">
                    <Clock size={9} /> {timeAgo(p.first_seen_at, t)}
                  </p>
                </div>
              </Link>
            ))}
            {!newListings?.items.length && (
              <div className="px-5 py-8 text-center text-muted text-sm">{t('dash_noNewToday')}</div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Quick filters */}
          <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-border">
              <h2 className="font-bold text-ink text-sm">{t('dash_quickFilters')}</h2>
            </div>
            <div className="p-2 space-y-0.5">
              {[
                { label: t('dash_qf_new24'), to: '/properties?listed_within=24h',          color: 'text-accent',       bg: 'hover:bg-accent/8',       dot: 'bg-accent' },
                { label: t('dash_qf_best'),  to: '/properties?score_min=80&sort_by=score',  color: 'text-score-strong', bg: 'hover:bg-score-strong/8', dot: 'bg-score-strong' },
                { label: t('dash_qf_drops'), to: '/properties?sort_by=discount',            color: 'text-red-500',      bg: 'hover:bg-red-50',         dot: 'bg-red-500' },
                { label: t('dash_qf_multi'), to: '/properties?multi_site=true',             color: 'text-blue-600',     bg: 'hover:bg-blue-50',        dot: 'bg-blue-500' },
                { label: t('dash_qf_yield'), to: '/properties?sort_by=score&score_min=50',  color: 'text-score-market', bg: 'hover:bg-score-market/8', dot: 'bg-score-market' },
              ].map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${link.color} ${link.bg} transition-all duration-150 group`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${link.dot}`} />
                  <span className="flex-1">{link.label}</span>
                  <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Top cities — compact, capped at 8 */}
          {stats?.cities && stats.cities.length > 0 && (
            <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                <h2 className="font-bold text-ink text-sm">{t('dash_topCities')}</h2>
                <span className="text-[10px] text-muted font-medium">{stats.cities.length} {t('dash_covered')}</span>
              </div>
              <div className="p-2 grid grid-cols-2 gap-0.5">
                {stats.cities.slice(0, 8).map(city => (
                  <Link
                    key={city}
                    to={`/properties?city=${encodeURIComponent(city)}`}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs text-muted hover:text-accent hover:bg-accent/5 transition-all duration-150 font-medium group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-surface-border group-hover:bg-accent transition-colors shrink-0" />
                    <span className="truncate">{city}</span>
                  </Link>
                ))}
              </div>
              {stats.cities.length > 8 && (
                <Link
                  to="/properties"
                  className="flex items-center justify-center gap-1 py-2.5 text-xs text-accent font-semibold border-t border-surface-border hover:bg-accent/5 transition-colors"
                >
                  +{stats.cities.length - 8} {t('dash_moreCities')} <ChevronRight size={11} />
                </Link>
              )}
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
