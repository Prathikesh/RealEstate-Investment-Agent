import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileBarChart2, TrendingUp, BarChart2, MapPin, ChevronRight, Home } from 'lucide-react'
import { fetchStats, fetchProperties } from '../api'

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

export default function Reports() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: bestDeals } = useQuery({
    queryKey: ['properties', 'reports-best'],
    queryFn: () => fetchProperties({ sort_by: 'score', score_min: 70, page_size: 5 }),
  })
  const { data: priceDrops } = useQuery({
    queryKey: ['properties', 'reports-drops'],
    queryFn: () => fetchProperties({ status: 'price_changed', page_size: 5 }),
  })
  const { data: newest } = useQuery({
    queryKey: ['properties', 'reports-newest'],
    queryFn: () => fetchProperties({ sort_by: 'newest', page_size: 5 }),
  })

  return (
    <div className="p-6 space-y-6 max-w-4xl animate-slide-up">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <p className="text-sm text-muted mt-0.5">Market summary and deal highlights</p>
      </div>

      {/* Market summary */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <FileBarChart2 size={16} className="text-accent" />
          <h2 className="font-bold text-ink">Market Summary</h2>
          <span className="text-xs text-muted ml-auto">
            {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-surface-border">
          <Stat label="Total listings" value={stats?.total_properties.toLocaleString() ?? '—'} />
          <Stat label="New today"      value={String(stats?.new_today ?? '—')} />
          <Stat label="Great deals"    value={String(stats?.strong_opportunities ?? '—')} accent="text-score-strong" />
          <Stat label="Avg AI score"   value={stats?.avg_score != null ? `${stats.avg_score.toFixed(0)}/100` : '—'} />
        </div>

        {stats?.cities && stats.cities.length > 0 && (
          <div className="pt-2 border-t border-surface-border">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Active markets</p>
            <div className="flex flex-wrap gap-2">
              {stats.cities.map(city => (
                <Link
                  key={city}
                  to={`/properties?city=${encodeURIComponent(city)}`}
                  className="flex items-center gap-1 px-3 py-1.5 bg-surface border border-surface-border rounded-full text-xs text-muted hover:text-accent hover:border-accent/40 transition-all font-medium"
                >
                  <MapPin size={10} />
                  {city}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Three report sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Best deals */}
        <ReportSection
          title="Best Deals This Week"
          icon={<TrendingUp size={15} className="text-score-strong" />}
          iconBg="bg-score-strong/10"
          viewAllTo="/properties?sort_by=score&score_min=70"
          items={bestDeals?.items ?? []}
          renderItem={p => (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink font-semibold truncate">{p.full_address}</p>
                <p className="text-[10px] text-muted">{p.city}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono font-bold text-ink">{fmtCAD(p.asking_price)}</p>
                <p className="text-[10px] text-score-strong font-semibold">Score {p.score}</p>
              </div>
            </div>
          )}
        />

        {/* Price drops */}
        <ReportSection
          title="Recent Price Drops"
          icon={<BarChart2 size={15} className="text-red-500" />}
          iconBg="bg-red-50"
          viewAllTo="/properties?status=price_changed"
          items={priceDrops?.items ?? []}
          renderItem={p => (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink font-semibold truncate">{p.full_address}</p>
                <p className="text-[10px] text-muted">{p.city}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono font-bold text-ink">{fmtCAD(p.asking_price)}</p>
                {p.discount_pct != null && (
                  <p className="text-[10px] text-red-500 font-semibold">
                    -{p.discount_pct.toFixed(1)}% below
                  </p>
                )}
              </div>
            </div>
          )}
        />

        {/* Newest */}
        <ReportSection
          title="New Listings"
          icon={<Home size={15} className="text-accent" />}
          iconBg="bg-accent/10"
          viewAllTo="/properties?sort_by=newest"
          items={newest?.items ?? []}
          renderItem={p => (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink font-semibold truncate">{p.full_address}</p>
                <p className="text-[10px] text-muted">{p.city}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono font-bold text-ink">{fmtCAD(p.asking_price)}</p>
                {p.is_new && (
                  <span className="text-[10px] font-bold text-accent">NEW</span>
                )}
              </div>
            </div>
          )}
        />
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted text-center">
        Data sourced from Realtor.ca, Centris, and ReMax. Updated daily. For informational purposes only.
      </p>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-xs text-muted mb-0.5">{label}</p>
      <p className={`text-xl font-bold font-mono ${accent ?? 'text-ink'}`}>{value}</p>
    </div>
  )
}

function ReportSection<T extends { id: string }>({
  title, icon, iconBg, viewAllTo, items, renderItem,
}: {
  title: string
  icon: React.ReactNode
  iconBg: string
  viewAllTo: string
  items: T[]
  renderItem: (item: T) => React.ReactNode
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        </div>
        <Link to={viewAllTo} className="text-xs text-accent hover:underline flex items-center gap-0.5 font-medium">
          All <ChevronRight size={11} />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted py-4 text-center">No data yet</p>
      ) : (
        <div className="divide-y divide-surface-border">
          {items.map(item => (
            <Link key={item.id} to={`/properties/${item.id}`} className="block py-2.5 hover:bg-surface-hover -mx-5 px-5 transition-all duration-150">
              {renderItem(item)}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
