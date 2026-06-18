import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FileBarChart2, TrendingUp, BarChart2, MapPin,
  ChevronRight, Home, Building2, ArrowRight,
} from 'lucide-react'
import { fetchStats, fetchProperties } from '../api'
import ScoreBadge from '../components/ScoreBadge'

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

export default function Reports() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: bestDeals } = useQuery({
    queryKey: ['properties', 'reports-best'],
    queryFn: () => fetchProperties({ sort_by: 'score', score_min: 50, page_size: 6 }),
  })
  const { data: newest } = useQuery({
    queryKey: ['properties', 'reports-newest'],
    queryFn: () => fetchProperties({ sort_by: 'newest', page_size: 5 }),
  })
  const { data: priceDrops } = useQuery({
    queryKey: ['properties', 'reports-drops'],
    queryFn: () => fetchProperties({ sort_by: 'discount', page_size: 5 }),
  })

  return (
    <div className="p-6 space-y-8 animate-slide-up">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <p className="text-sm text-muted mt-0.5">Market summary and deal highlights</p>
      </div>

      {/* ── Market Summary hero ─────────────────────────────────────────── */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-5 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <FileBarChart2 size={15} className="text-accent" />
            </div>
            <div>
              <h2 className="font-bold text-ink">Market Summary</h2>
              <p className="text-xs text-muted">
                {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
          <Link to="/properties" className="btn-ghost text-xs">
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-surface-border">
          <HeroStat label="Total Listings"   value={stats?.total_properties?.toLocaleString() ?? '—'} />
          <HeroStat label="New Today"        value={String(stats?.new_today ?? 0)} />
          <HeroStat label="Great Deals"      value={String(stats?.strong_opportunities ?? 0)} accent="text-score-strong" />
          <HeroStat label="Avg AI Score"     value={stats?.avg_score != null ? `${Math.round(stats.avg_score)}/100` : '—'} />
        </div>

        {/* Score distribution */}
        {stats && (
          <div className="px-6 py-4 border-t border-surface-border bg-surface/50">
            <div className="flex items-center gap-6 flex-wrap">
              <ScoreBar label="Strong" count={stats.strong_opportunities ?? 0} total={stats.total_properties} color="bg-score-strong" />
              <ScoreBar label="Worth Investigating" count={stats.worth_investigating ?? 0} total={stats.total_properties} color="bg-score-worth" />
              <ScoreBar label="Market Price" count={stats.market_price ?? 0} total={stats.total_properties} color="bg-score-market" />
              <ScoreBar label="Not Recommended" count={stats.not_recommended ?? 0} total={stats.total_properties} color="bg-score-notrecommended" />
            </div>
          </div>
        )}
      </div>

      {/* ── Best Deals (featured) ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-score-strong" />
            <h2 className="font-bold text-ink">Best Deals</h2>
            <span className="text-xs text-muted px-2 py-0.5 bg-score-strong/10 text-score-strong rounded-full font-medium">
              Score 50+
            </span>
          </div>
          <Link to="/properties?sort_by=score&score_min=50" className="text-xs text-accent hover:underline flex items-center gap-1 font-medium">
            View all <ChevronRight size={12} />
          </Link>
        </div>

        {bestDeals?.items && bestDeals.items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {bestDeals.items.map(p => (
              <Link key={p.id} to={`/properties/${p.id}`}
                className="card card-hover p-0 overflow-hidden group block"
              >
                <div className="aspect-video bg-surface-hover overflow-hidden relative">
                  {p.photos?.[0] ? (
                    <img src={p.photos[0]} alt="" referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 size={28} className="text-surface-border" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    {p.score != null && <ScoreBadge score={p.score} category={p.score_category} size="sm" />}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div>
                    <p className="text-xs text-muted capitalize">{p.property_type.replace(/_/g, ' ')}</p>
                    <p className="font-semibold text-ink text-sm line-clamp-1 mt-0.5">{p.full_address}</p>
                    <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><MapPin size={10} />{p.city}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-mono text-ink">{fmtCAD(p.asking_price)}</p>
                    <div className="text-right">
                      {p.cap_rate != null && <p className="text-xs text-score-strong font-semibold">{p.cap_rate.toFixed(1)}% cap</p>}
                      {p.monthly_cash_flow != null && <p className="text-xs text-muted">{fmtCAD(p.monthly_cash_flow)}/mo</p>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card py-10 text-center text-muted text-sm">No deals found yet — run the pipeline after scraping.</div>
        )}
      </div>

      {/* ── Two column: Newest + Price Drops ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Newest listings */}
        <div className="card space-y-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                <Home size={13} className="text-accent" />
              </div>
              <h3 className="font-bold text-sm text-ink">New Listings</h3>
            </div>
            <Link to="/properties?sort_by=newest" className="text-xs text-accent hover:underline flex items-center gap-0.5 font-medium">
              All <ChevronRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-surface-border">
            {(newest?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted py-6 text-center">No data yet</p>
            ) : newest?.items.map(p => (
              <Link key={p.id} to={`/properties/${p.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-surface-hover shrink-0 overflow-hidden">
                  {p.photos?.[0]
                    ? <img src={p.photos[0]} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                    : <Building2 size={16} className="text-surface-border m-auto mt-2.5" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{p.full_address}</p>
                  <p className="text-xs text-muted">{p.city}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-ink">{fmtCAD(p.asking_price)}</p>
                  {p.is_new && <span className="text-[10px] font-bold text-accent">NEW</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Price drops / best discount */}
        <div className="card space-y-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                <BarChart2 size={13} className="text-red-500" />
              </div>
              <h3 className="font-bold text-sm text-ink">Biggest Discounts</h3>
            </div>
            <Link to="/properties?sort_by=discount" className="text-xs text-accent hover:underline flex items-center gap-0.5 font-medium">
              All <ChevronRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-surface-border">
            {(priceDrops?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted py-6 text-center">No data yet</p>
            ) : priceDrops?.items.map(p => (
              <Link key={p.id} to={`/properties/${p.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-surface-hover shrink-0 overflow-hidden">
                  {p.photos?.[0]
                    ? <img src={p.photos[0]} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                    : <Building2 size={16} className="text-surface-border m-auto mt-2.5" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{p.full_address}</p>
                  <p className="text-xs text-muted">{p.city}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-ink">{fmtCAD(p.asking_price)}</p>
                  {p.discount_pct != null && p.discount_pct > 0 && (
                    <p className="text-[10px] font-semibold text-score-strong">-{p.discount_pct.toFixed(1)}% below</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active markets ──────────────────────────────────────────────── */}
      {stats?.cities && stats.cities.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-muted" />
            <h3 className="font-bold text-sm text-ink">Active Markets</h3>
            <span className="text-xs text-muted ml-auto">{stats.cities.length} cities</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.cities.map(city => (
              <Link key={city} to={`/properties?city=${encodeURIComponent(city)}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-surface-border rounded-full text-xs text-muted hover:text-accent hover:border-accent/40 transition-all font-medium"
              >
                <MapPin size={9} />{city}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted text-center pb-2">
        Data sourced from Realtor.ca, Centris, and ReMax Quebec. For informational purposes only.
      </p>
    </div>
  )
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="px-6 py-5 space-y-1">
      <p className="text-xs text-muted font-medium">{label}</p>
      <p className={`text-3xl font-bold ${accent ?? 'text-ink'}`}>{value}</p>
    </div>
  )
}

function ScoreBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
      <span className="text-xs text-muted whitespace-nowrap">{label}</span>
      <span className="text-xs font-bold text-ink">{count}</span>
      <span className="text-xs text-muted">({pct}%)</span>
    </div>
  )
}
