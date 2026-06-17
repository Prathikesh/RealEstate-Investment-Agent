import { useState, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search, LayoutGrid, List, Map, ChevronLeft, ChevronRight, SlidersHorizontal, Hash, X,
} from 'lucide-react'
import clsx from 'clsx'
import { fetchProperties, fetchStats, fetchMapProperties, type PropertyFilters } from '../api'
import { useLang } from '../context/LanguageContext'
import ScoreBadge from '../components/ScoreBadge'
import PropertyCardGrid from '../components/PropertyCardGrid'

const PropertyMapView = lazy(() => import('../components/PropertyMapView'))

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'duplex',          label: 'Duplex (2 units)' },
  { value: 'triplex',         label: 'Triplex (3 units)' },
  { value: 'quadruplex',      label: 'Quadruplex (4 units)' },
  { value: 'quintuplex_plus', label: 'Quintuplex+ (5+ units)' },
  { value: 'single_family',   label: 'Single Family Home' },
  { value: 'condo',           label: 'Condo' },
]

const SCORE_OPTIONS = [
  { value: '',   label: 'Any quality' },
  { value: '80', label: 'Great deals only (80+)' },
  { value: '60', label: 'Worth checking (60+)' },
  { value: '40', label: 'Show everything (40+)' },
]

const LISTED_WITHIN_OPTIONS = [
  { value: '',    label: 'Any time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '48h', label: 'Last 48 hours' },
  { value: '7d',  label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const SORT_OPTIONS = [
  { value: 'score',      label: 'Best deals first' },
  { value: 'discount',   label: 'Biggest discount first' },
  { value: 'price_asc',  label: 'Lowest price first' },
  { value: 'price_desc', label: 'Highest price first' },
  { value: 'newest',     label: 'Newest listings first' },
]

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list' | 'map'

export default function Properties() {
  const { lang } = useLang()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('grid')
  const [showFilters, setShowFilters] = useState(false)

  const filters: PropertyFilters = {
    city:          params.get('city') ?? undefined,
    mls_number:    params.get('mls_number') ?? undefined,
    property_type: params.get('property_type') ?? undefined,
    sort_by:       (params.get('sort_by') as PropertyFilters['sort_by']) ?? 'score',
    listed_within: (params.get('listed_within') as PropertyFilters['listed_within']) ?? undefined,
    score_min:     params.get('score_min') ? Number(params.get('score_min')) : undefined,
    price_min:     params.get('price_min') ? Number(params.get('price_min')) : undefined,
    price_max:     params.get('price_max') ? Number(params.get('price_max')) : undefined,
    page:          params.get('page') ? Number(params.get('page')) : 1,
    page_size:     view === 'grid' ? 24 : 30,
    multi_site:    params.get('multi_site') === 'true' ? true : undefined,
    has_sqft:      params.get('has_sqft') === 'true' ? true : undefined,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['properties', filters],
    queryFn: () => fetchProperties(filters),
  })

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })

  const { data: mapData, isLoading: mapLoading } = useQuery({
    queryKey: ['properties-map'],
    queryFn: fetchMapProperties,
    enabled: view === 'map',
    staleTime: 5 * 60 * 1000,
  })

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next)
  }

  function setPage(p: number) {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const hasActiveFilters = !!(
    filters.city || filters.mls_number || filters.property_type ||
    filters.score_min || filters.multi_site || filters.has_sqft ||
    filters.listed_within || filters.price_min || filters.price_max
  )

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{lang === 'fr' ? 'Propriétés' : 'Properties'}</h1>
          <p className="text-sm text-muted">
            {data?.total != null ? `${data.total.toLocaleString()} listings found` : 'Loading…'}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
              showFilters
                ? 'border-accent/50 text-accent bg-accent/10'
                : 'border-surface-border text-muted bg-white hover:text-ink hover:bg-surface-hover',
            )}
          >
            <SlidersHorizontal size={13} />
            Filters {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
          </button>

          <div className="flex items-center gap-0.5 p-0.5 bg-white border border-surface-border rounded-lg shadow-sm">
            <button
              onClick={() => setView('grid')}
              title="Grid view"
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                view === 'grid' ? 'bg-accent text-white' : 'text-muted hover:text-ink',
              )}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView('list')}
              title="List view"
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                view === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-ink',
              )}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView('map')}
              title="Map view"
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                view === 'map' ? 'bg-accent text-white' : 'text-muted hover:text-ink',
              )}
            >
              <Map size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick filter chips (new listings) ────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted font-medium">Quick filter:</span>
        {LISTED_WITHIN_OPTIONS.filter(o => o.value).map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter('listed_within', filters.listed_within === opt.value ? '' : opt.value)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              filters.listed_within === opt.value
                ? 'bg-accent text-white border-accent'
                : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-accent',
            )}
          >
            {opt.label}
          </button>
        ))}
        <div className="w-px h-4 bg-surface-border mx-1" />
        <button
          onClick={() => setFilter('sort_by', 'score')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            (filters.sort_by === 'score' || !filters.sort_by)
              ? 'bg-score-strong/10 text-score-strong border-score-strong/30'
              : 'bg-white text-muted border-surface-border hover:border-score-strong/40 hover:text-score-strong',
          )}
        >
          Best deals
        </button>
        <button
          onClick={() => setFilter('sort_by', 'discount')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filters.sort_by === 'discount'
              ? 'bg-score-strong/10 text-score-strong border-score-strong/30'
              : 'bg-white text-muted border-surface-border hover:border-score-strong/40 hover:text-score-strong',
          )}
        >
          Biggest discount
        </button>
        <button
          onClick={() => setFilter('sort_by', 'price_asc')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filters.sort_by === 'price_asc'
              ? 'bg-score-worth/10 text-score-worth border-score-worth/30'
              : 'bg-white text-muted border-surface-border hover:border-score-worth/40 hover:text-score-worth',
          )}
        >
          Lowest price
        </button>
        <button
          onClick={() => setFilter('sort_by', 'price_desc')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filters.sort_by === 'price_desc'
              ? 'bg-score-market/10 text-score-market border-score-market/30'
              : 'bg-white text-muted border-surface-border hover:border-score-market/40 hover:text-score-market',
          )}
        >
          Highest price
        </button>
      </div>

      {/* ── Search + Sort bar ──────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        {/* City search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search city…"
            value={filters.city ?? ''}
            onChange={e => setFilter('city', e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* MLS number search */}
        <div className="relative min-w-[160px]">
          <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="MLS number…"
            value={filters.mls_number ?? ''}
            onChange={e => setFilter('mls_number', e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* Sort */}
        <select
          value={filters.sort_by ?? 'score'}
          onChange={e => setFilter('sort_by', e.target.value)}
          className="select"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={() => setParams(new URLSearchParams())}
            className="flex items-center gap-1 px-3 py-2 text-sm text-score-notrecommended hover:bg-score-notrecommended/10 rounded-lg border border-score-notrecommended/30 transition-colors"
          >
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* ── Expanded filters ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="card flex flex-wrap gap-4 items-end">
          {/* Property type */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Property Type</span>
            <select
              value={filters.property_type ?? ''}
              onChange={e => setFilter('property_type', e.target.value)}
              className="select"
            >
              <option value="">All types</option>
              {PROPERTY_TYPES.map(tp => (
                <option key={tp.value} value={tp.value}>{tp.label}</option>
              ))}
            </select>
          </label>

          {/* Quality / Score */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Minimum quality</span>
            <select
              value={filters.score_min ?? ''}
              onChange={e => setFilter('score_min', e.target.value)}
              className="select"
            >
              {SCORE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {/* Listed within */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Listed within</span>
            <select
              value={filters.listed_within ?? ''}
              onChange={e => setFilter('listed_within', e.target.value)}
              className="select"
            >
              {LISTED_WITHIN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {/* City dropdown */}
          {stats?.cities && stats.cities.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">City</span>
              <select
                value={filters.city ?? ''}
                onChange={e => setFilter('city', e.target.value)}
                className="select"
              >
                <option value="">All cities</option>
                {stats.cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          {/* Price range */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Min price ($)</span>
            <input
              type="number"
              step="50000"
              placeholder="e.g. 300000"
              value={filters.price_min ?? ''}
              onChange={e => setFilter('price_min', e.target.value)}
              className="input w-36"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Max price ($)</span>
            <input
              type="number"
              step="50000"
              placeholder="e.g. 1000000"
              value={filters.price_max ?? ''}
              onChange={e => setFilter('price_max', e.target.value)}
              className="input w-36"
            />
          </label>

          {/* Multi-site only */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Listed on multiple sites</span>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input
                type="checkbox"
                checked={filters.multi_site === true}
                onChange={e => setFilter('multi_site', e.target.checked ? 'true' : '')}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-sm text-ink">Multi-site only</span>
            </label>
          </label>

          {/* Has sqft */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Size data</span>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input
                type="checkbox"
                checked={filters.has_sqft === true}
                onChange={e => setFilter('has_sqft', e.target.checked ? 'true' : '')}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-sm text-ink">Has sqft only</span>
            </label>
          </label>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      {view === 'map' ? (
        <Suspense fallback={<div className="rounded-2xl border border-surface-border bg-surface-card animate-pulse" style={{ height: 600 }} />}>
          <PropertyMapView properties={mapData ?? []} isLoading={mapLoading} />
        </Suspense>
      ) : (
        <div className="relative">
          {isFetching && !isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-start justify-center pt-12 rounded-xl">
              <div className="flex items-center gap-2 bg-white shadow-card border border-surface-border px-4 py-2 rounded-full text-sm text-muted font-medium">
                <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
                </svg>
                Filtering…
              </div>
            </div>
          )}
          {view === 'grid' ? (
            <GridView data={data?.items} isLoading={isLoading} />
          ) : (
            <ListView data={data?.items} isLoading={isLoading} />
          )}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {view !== 'map' && !isLoading && data?.items.length === 0 && (
        <div className="card py-12 text-center space-y-2">
          <p className="text-ink font-medium">No properties found</p>
          <p className="text-sm text-muted">Try adjusting your filters or expanding the search area.</p>
          <button
            onClick={() => setParams(new URLSearchParams())}
            className="mt-4 text-sm text-accent hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {view !== 'map' && data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            Page {data.page} of {data.pages} · {data.total.toLocaleString()} listings
          </p>
          <div className="flex gap-2">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className="p-2 rounded-lg border border-surface-border bg-white text-muted hover:text-ink hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers(data.page, data.pages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-muted self-center">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(Number(p))}
                  className={clsx(
                    'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                    Number(p) === data.page
                      ? 'bg-accent text-white shadow'
                      : 'border border-surface-border bg-white text-muted hover:text-ink hover:bg-surface-hover',
                  )}
                >
                  {p}
                </button>
              )
            )}
            <button
              disabled={data.page >= data.pages}
              onClick={() => setPage(data.page + 1)}
              className="p-2 rounded-lg border border-surface-border bg-white text-muted hover:text-ink hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grid view ─────────────────────────────────────────────────────────────────

function GridView({ data, isLoading }: { data?: import('../api').PropertyCard[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bg-white border border-surface-border rounded-xl overflow-hidden animate-pulse shadow-sm">
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
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {(data ?? []).map(p => (
        <PropertyCardGrid key={p.id} property={p} />
      ))}
    </div>
  )
}

// ── List view (table) ─────────────────────────────────────────────────────────

function ListView({
  data, isLoading,
}: {
  data?: import('../api').PropertyCard[]
  isLoading: boolean
}) {
  return (
    <div className="bg-white border border-surface-border rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-xs text-muted uppercase tracking-wider">
              <th className="text-left px-5 py-3">Score</th>
              <th className="text-left px-5 py-3">Address</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Yearly Return</th>
              <th className="text-right px-4 py-3">Monthly Profit</th>
              <th className="text-right px-4 py-3">Below Market</th>
              <th className="text-left px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-surface-border rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : (data ?? []).map(p => (
                  <tr key={p.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-5 py-3">
                      <ScoreBadge score={p.score} category={p.score_category} size="sm" />
                    </td>
                    <td className="px-5 py-3 max-w-xs">
                      <Link to={`/properties/${p.id}`} className="text-ink hover:text-accent hover:underline font-medium">
                        {p.full_address}
                      </Link>
                      <p className="text-xs text-muted">{p.city}</p>
                    </td>
                    <td className="px-4 py-3 text-muted capitalize">
                      {p.property_type.replace(/_/g, ' ')}
                      {p.unit_count ? <span className="text-surface-border ml-1">({p.unit_count} units)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-ink font-semibold">
                      {fmtCAD(p.asking_price)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {p.cap_rate != null
                        ? <span className={p.cap_rate >= 5 ? 'text-score-strong font-semibold' : 'text-muted'}>{p.cap_rate.toFixed(2)}%</span>
                        : <span className="text-surface-border">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {p.monthly_cash_flow != null
                        ? <span className={p.monthly_cash_flow >= 0 ? 'text-score-strong font-semibold' : 'text-score-notrecommended'}>
                            {fmtCAD(p.monthly_cash_flow)}/mo
                          </span>
                        : <span className="text-surface-border">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {p.discount_pct != null && p.discount_pct !== 0
                        ? <span className={p.discount_pct > 0 ? 'text-score-strong font-semibold' : 'text-score-notrecommended'}>
                            {p.discount_pct > 0 ? '-' : '+'}{Math.abs(p.discount_pct).toFixed(1)}%
                          </span>
                        : <span className="text-surface-border">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-hover text-muted capitalize border border-surface-border">
                        {p.primary_source ?? '—'}
                      </span>
                      {p.multi_site_count != null && p.multi_site_count > 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200">
                          +{p.multi_site_count - 1} sites
                        </span>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page number helper ────────────────────────────────────────────────────────

function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = []
  pages.push(1)
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}
