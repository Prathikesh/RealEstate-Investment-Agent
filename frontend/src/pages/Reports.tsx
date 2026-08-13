import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  TrendingUp, MapPin, ChevronRight, Home, Building2,
  Zap, Activity, ArrowDownCircle, BarChart2, ArrowRight,
} from 'lucide-react'
import { fetchStats, fetchProperties } from '../api'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import PropertyCardGrid from '../components/PropertyCardGrid'

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

// ── Shared metric card (matches Dashboard style) ──────────────────────────────

interface MetricProps {
  label: string
  value: string | number
  sublabel: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  to?: string
}

function Metric({ label, value, sublabel, icon, iconColor, iconBg, to }: MetricProps) {
  const inner = (
    <div className="flex items-center gap-3 py-4 px-5 min-w-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-ink font-mono tabular-nums leading-tight">{value}</p>
        <p className="text-xs text-muted mt-0.5 leading-tight">{sublabel}</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const { t } = useLang()
  const { user } = useAuth()
  // "Best deals" ranks by the broker's own criteria once they've set them.
  const rankMode: 'ai' | 'your' = user?.custom_score_weights ? 'your' : 'ai'
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: bestDeals } = useQuery({
    queryKey: ['properties', 'reports-best', rankMode],
    queryFn: () => fetchProperties(
      rankMode === 'your'
        ? { sort_by: 'your_verdict', your_score_min: 50, page_size: 8 }
        : { sort_by: 'score', score_min: 50, page_size: 8 },
    ),
  })
  const { data: newest } = useQuery({
    queryKey: ['properties', 'reports-newest'],
    queryFn: () => fetchProperties({ sort_by: 'newest', page_size: 6 }),
  })
  const { data: priceDrops } = useQuery({
    queryKey: ['properties', 'reports-drops'],
    queryFn: () => fetchProperties({ sort_by: 'discount', page_size: 6 }),
  })

  const total = stats?.total_properties ?? 0

  const dist = [
    { label: 'Strong Buy',     count: stats?.strong_opportunities ?? 0, color: '#059669', bg: 'bg-score-strong',           textColor: 'text-score-strong',           badgeBg: 'bg-score-strong/10' },
    { label: 'Worth Checking', count: stats?.worth_investigating   ?? 0, color: '#2563EB', bg: 'bg-score-worth',            textColor: 'text-score-worth',            badgeBg: 'bg-score-worth/10' },
    { label: 'Fair Price',     count: stats?.market_price          ?? 0, color: '#D97706', bg: 'bg-score-market',           textColor: 'text-score-market',           badgeBg: 'bg-score-market/10' },
    { label: 'Not Recommended',count: stats?.not_recommended       ?? 0, color: '#DC2626', bg: 'bg-score-notrecommended',   textColor: 'text-score-notrecommended',   badgeBg: 'bg-score-notrecommended/10' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-slide-up">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('nav_reports')}</h1>
          <p className="text-sm text-muted mt-0.5">
            Market summary · {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link to="/properties" className="btn-primary shadow-md">
          <ArrowRight size={14} /> Browse all
        </Link>
      </div>

      {/* ── Metric strip ────────────────────────────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-surface-border">
          <Metric label="Total listings"    value={total.toLocaleString()}                                sublabel="across Quebec"     icon={<Home size={18} />}          iconColor="text-blue-600"        iconBg="bg-blue-50" />
          <Metric label="New today"         value={stats?.new_today ?? 0}                                 sublabel="added today"     icon={<Zap size={18} />}           iconColor="text-accent"          iconBg="bg-accent/10"        to="/properties?listed_within=24h" />
          <Metric label="Great deals"       value={stats?.strong_opportunities ?? 0}                      sublabel="score 80+"       icon={<TrendingUp size={18} />}    iconColor="text-score-strong"    iconBg="bg-score-strong/10"  to="/properties?score_min=80&sort_by=score" />
          <Metric label="Worth checking"    value={stats?.worth_investigating ?? 0}                       sublabel="score 60–79"     icon={<BarChart2 size={18} />}     iconColor="text-score-worth"     iconBg="bg-score-worth/10"   to="/properties?score_min=60&sort_by=score" />
          <Metric label="Price drops"       value={stats?.price_drops_today ?? 0}                        sublabel="since yesterday" icon={<ArrowDownCircle size={18} />} iconColor="text-red-500"       iconBg="bg-red-50"           to="/properties?status=price_changed" />
          <Metric label="Avg deal score"    value={stats?.avg_score != null ? `${Math.round(stats.avg_score)}` : '—'} sublabel="out of 100" icon={<Activity size={18} />} iconColor="text-muted" iconBg="bg-surface-hover" />
        </div>
      </div>

      {/* ── Score distribution ─────────────────────────────────────────── */}
      {stats && total > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">{t('rep_scoreDistribution')}</h3>
            <span className="text-xs text-muted">{total.toLocaleString()} properties scored</span>
          </div>

          {/* Stacked bar */}
          <div className="rounded-full overflow-hidden h-3 flex gap-px bg-surface-border">
            {dist.map(s => {
              const pct = total > 0 ? (s.count / total) * 100 : 0
              return pct > 0 ? (
                <div
                  key={s.label}
                  title={`${s.label}: ${s.count}`}
                  style={{ width: `${pct}%`, background: s.color }}
                  className="transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                />
              ) : null
            })}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {dist.map(s => {
              const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : '0'
              return (
                <Link
                  key={s.label}
                  to={`/properties?sort_by=score&score_min=${
                    s.label === 'Strong Buy' ? 80 :
                    s.label === 'Worth Checking' ? 60 :
                    s.label === 'Fair Price' ? 40 : 0
                  }`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-surface-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                >
                  <div style={{ background: s.color }} className="w-3 h-3 rounded-full shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{s.label}</p>
                    <p className="text-lg font-black font-mono tabular-nums leading-tight" style={{ color: s.color }}>
                      {s.count.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted">{pct}%</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Best Deals ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-score-strong" />
            <h2 className="font-bold text-ink text-base">{t('rep_bestDeals')}</h2>
            <span className="text-xs px-2 py-0.5 bg-score-strong/10 text-score-strong rounded-full font-semibold">
              {rankMode === 'your' ? 'Your score 50+' : 'Score 50+'}
            </span>
          </div>
          <Link
            to={rankMode === 'your' ? '/properties?sort_by=your_verdict' : '/properties?sort_by=score&score_min=50'}
            className="flex items-center gap-1 text-sm text-accent hover:underline font-semibold"
          >
            View all <ChevronRight size={14} />
          </Link>
        </div>

        {bestDeals?.items && bestDeals.items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {bestDeals.items.map(p => <PropertyCardGrid key={p.id} property={p} rankMode={rankMode} />)}
          </div>
        ) : (
          <div className="card py-12 text-center space-y-2">
            <BarChart2 size={28} className="text-muted mx-auto" />
            <p className="text-sm text-muted">No deals found yet — run the pipeline after scraping.</p>
          </div>
        )}
      </div>

      {/* ── New Listings + Biggest Discounts ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ListPanel
          title={t('newListings')}
          icon={<Home size={13} className="text-accent" />}
          iconBg="bg-accent/10"
          to="/properties?sort_by=newest"
          items={(newest?.items ?? []).map(p => ({
            id: p.id,
            photo: p.photos[0] ?? null,
            address: p.full_address,
            city: p.city,
            price: p.asking_price,
            badge: p.is_new ? { label: 'NEW', cls: 'text-accent' } : null,
          }))}
        />
        <ListPanel
          title={t('rep_biggestDiscounts')}
          icon={<ArrowDownCircle size={13} className="text-red-500" />}
          iconBg="bg-red-50"
          to="/properties?sort_by=discount"
          items={(priceDrops?.items ?? []).map(p => ({
            id: p.id,
            photo: p.photos[0] ?? null,
            address: p.full_address,
            city: p.city,
            price: p.asking_price,
            badge: p.discount_pct != null && p.discount_pct > 0
              ? { label: `-${p.discount_pct.toFixed(1)}% below`, cls: 'text-score-strong' }
              : null,
          }))}
        />
      </div>

      {/* ── Active Markets ─────────────────────────────────────────────── */}
      {stats?.cities && stats.cities.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-muted" />
              <h3 className="font-bold text-sm text-ink">{t('rep_activeMarkets')}</h3>
            </div>
            <Link to="/properties" className="text-xs text-accent hover:underline font-medium flex items-center gap-0.5">
              {stats.cities.length} cities <ChevronRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {stats.cities.slice(0, 20).map(city => (
              <Link
                key={city}
                to={`/properties?city=${encodeURIComponent(city)}`}
                className="flex items-center gap-2 px-3 py-2.5 bg-surface border border-surface-border rounded-xl text-xs font-medium text-muted hover:text-accent hover:border-accent/40 hover:bg-accent/5 hover:shadow-sm transition-all duration-200 group"
              >
                <MapPin size={9} className="shrink-0 group-hover:text-accent transition-colors" />
                <span className="truncate">{city}</span>
              </Link>
            ))}
          </div>
          {stats.cities.length > 20 && (
            <Link to="/properties" className="block text-center text-xs text-muted hover:text-accent transition-colors pt-1">
              +{stats.cities.length - 20} more cities →
            </Link>
          )}
        </div>
      )}

      <p className="text-xs text-muted text-center pb-2">
        Data sourced from Realtor.ca, Centris, and ReMax Quebec. For informational purposes only.
      </p>
    </div>
  )
}

// ── Shared list panel ─────────────────────────────────────────────────────────

interface ListItem {
  id: string
  photo: string | null
  address: string
  city: string
  price: number | null
  badge: { label: string; cls: string } | null
}

function ListPanel({
  title, icon, iconBg, to, items,
}: {
  title: string
  icon: React.ReactNode
  iconBg: string
  to: string
  items: ListItem[]
}) {
  const { t } = useLang()
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
          <h3 className="font-bold text-sm text-ink">{title}</h3>
        </div>
        <Link to={to} className="text-xs text-accent hover:underline flex items-center gap-0.5 font-medium">
          All <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-surface-border">
        {items.length === 0 ? (
          <p className="text-xs text-muted py-8 text-center">{t('rep_noData')}</p>
        ) : items.map(p => (
          <Link
            key={p.id}
            to={`/properties/${p.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-all duration-150 group"
          >
            <div className="w-12 h-12 rounded-xl bg-surface-hover shrink-0 overflow-hidden border border-surface-border flex items-center justify-center">
              {p.photo
                ? <img src={p.photo} referrerPolicy="no-referrer" alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                : <Building2 size={14} className="text-surface-border" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate group-hover:text-accent transition-colors">{p.address}</p>
              <p className="text-xs text-muted">{p.city}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono font-bold text-ink tabular-nums">{fmtCAD(p.price)}</p>
              {p.badge && <p className={`text-[10px] font-bold ${p.badge.cls}`}>{p.badge.label}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
