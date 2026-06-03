import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search, LayoutGrid, List, ChevronLeft, ChevronRight, SlidersHorizontal,
} from 'lucide-react'
import clsx from 'clsx'
import { fetchProperties, fetchStats, type PropertyFilters } from '../api'
import { useLang } from '../context/LanguageContext'
import ScoreBadge from '../components/ScoreBadge'
import PropertyCardGrid from '../components/PropertyCardGrid'

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'duplex',          label: 'Duplex' },
  { value: 'triplex',         label: 'Triplex' },
  { value: 'quadruplex',      label: 'Quadruplex' },
  { value: 'quintuplex_plus', label: 'Quintuplex+' },
  { value: 'single_family',   label: 'Single Family' },
  { value: 'condo',           label: 'Condo' },
]

const SCORE_OPTIONS = [
  { value: '',   labelKey: 'anyScore' as const },
  { value: '80', label: '80+ Strong' },
  { value: '60', label: '60+ Worth it' },
  { value: '40', label: '40+ Any' },
]

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list'

export default function Properties() {
  const { t } = useLang()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('grid')
  const [showFilters, setShowFilters] = useState(false)

  const filters: PropertyFilters = {
    city:          params.get('city') ?? undefined,
    property_type: params.get('property_type') ?? undefined,
    sort_by:       (params.get('sort_by') as PropertyFilters['sort_by']) ?? 'score',
    score_min:     params.get('score_min') ? Number(params.get('score_min')) : undefined,
    page:          params.get('page') ? Number(params.get('page')) : 1,
    page_size:     view === 'grid' ? 24 : 30,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['properties', filters],
    queryFn: () => fetchProperties(filters),
  })

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })

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

  const SORT_OPTIONS = [
    { value: 'score',    label: t('sortBy') + ': Score' },
    { value: 'discount', label: t('sortBy') + ': Discount' },
    { value: 'price',    label: t('sortBy') + ': Price' },
    { value: 'newest',   label: t('sortBy') + ': Newest' },
  ]

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{t('properties')}</h1>
          <p className="text-sm text-muted">
            {data?.total != null ? `${data.total.toLocaleString()} listings` : ''}
          </p>
        </div>

        {/* Grid / List toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors',
              showFilters
                ? 'border-accent/50 text-accent bg-accent/10'
                : 'border-surface-border text-muted hover:text-slate-200 hover:bg-surface-hover',
            )}
          >
            <SlidersHorizontal size={13} />
            {t('filters')}
          </button>

          <div className="flex items-center gap-0.5 p-0.5 bg-surface-card border border-surface-border rounded-lg">
            <button
              onClick={() => setView('grid')}
              title={t('gridView')}
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                view === 'grid' ? 'bg-accent text-white' : 'text-muted hover:text-slate-300',
              )}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView('list')}
              title={t('listView')}
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                view === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-slate-300',
              )}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Search + Sort bar ──────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="City…"
            value={filters.city ?? ''}
            onChange={e => setFilter('city', e.target.value)}
            className="input pl-9"
          />
        </div>

        <select
          value={filters.sort_by ?? 'score'}
          onChange={e => setFilter('sort_by', e.target.value)}
          className="select"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Expanded filters ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="card flex flex-wrap gap-4 items-end">
          {/* Property type */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('allTypes')}</span>
            <select
              value={filters.property_type ?? ''}
              onChange={e => setFilter('property_type', e.target.value)}
              className="select"
            >
              <option value="">{t('allTypes')}</option>
              {PROPERTY_TYPES.map(tp => (
                <option key={tp.value} value={tp.value}>{tp.label}</option>
              ))}
            </select>
          </label>

          {/* Min score */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('minScore')}</span>
            <select
              value={filters.score_min ?? ''}
              onChange={e => setFilter('score_min', e.target.value)}
              className="select"
            >
              {SCORE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label ?? t(o.labelKey!)}
                </option>
              ))}
            </select>
          </label>

          {/* City dropdown (from API) */}
          {stats?.cities && stats.cities.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t('allCities')}</span>
              <select
                value={filters.city ?? ''}
                onChange={e => setFilter('city', e.target.value)}
                className="select"
              >
                <option value="">{t('allCities')}</option>
                {stats.cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          {/* Clear filters */}
          {(filters.city || filters.property_type || filters.score_min) && (
            <button
              onClick={() => setParams(new URLSearchParams())}
              className="text-xs text-score-notrecommended hover:underline self-end pb-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      {view === 'grid' ? (
        <GridView data={data?.items} isLoading={isLoading} />
      ) : (
        <ListView data={data?.items} isLoading={isLoading} t={t} />
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!isLoading && data?.items.length === 0 && (
        <div className="card py-12 text-center space-y-2">
          <p className="text-slate-300 font-medium">{t('noResults')}</p>
          <p className="text-sm text-muted">{t('noResultsHint')}</p>
          <button
            onClick={() => setParams(new URLSearchParams())}
            className="mt-4 text-sm text-accent hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            Page {data.page} of {data.pages} · {data.total.toLocaleString()} listings
          </p>
          <div className="flex gap-2">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className="p-2 rounded-lg border border-surface-border text-muted hover:text-slate-200 hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {/* Page numbers (show up to 5 around current) */}
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
                      ? 'bg-accent text-white'
                      : 'border border-surface-border text-muted hover:text-slate-200 hover:bg-surface-hover',
                  )}
                >
                  {p}
                </button>
              )
            )}
            <button
              disabled={data.page >= data.pages}
              onClick={() => setPage(data.page + 1)}
              className="p-2 rounded-lg border border-surface-border text-muted hover:text-slate-200 hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
          <div key={i} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden animate-pulse">
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
  data, isLoading, t,
}: {
  data?: { id: string; full_address: string; city: string; property_type: string; unit_count: number | null; asking_price: number | null; score: number | null; score_category: string | null; cap_rate: number | null; monthly_cash_flow: number | null; discount_pct: number | null; primary_source: string | null }[]
  isLoading: boolean
  t: (k: string) => string
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-xs text-muted uppercase tracking-wider">
              <th className="text-left px-5 py-3">Score</th>
              <th className="text-left px-5 py-3">Address</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">{t('capRate')}</th>
              <th className="text-right px-4 py-3">{t('cashFlow')}</th>
              <th className="text-right px-4 py-3">{t('discount')}</th>
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
                      <Link to={`/properties/${p.id}`} className="text-slate-200 hover:text-white hover:underline">
                        {p.full_address}
                      </Link>
                      <p className="text-xs text-muted">{p.city}</p>
                    </td>
                    <td className="px-4 py-3 text-muted capitalize">
                      {p.property_type.replace(/_/g, ' ')}
                      {p.unit_count ? <span className="text-surface-border ml-1">({p.unit_count}u)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {fmtCAD(p.asking_price)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {p.cap_rate != null
                        ? <span className={p.cap_rate >= 5 ? 'text-score-strong' : 'text-muted'}>{p.cap_rate.toFixed(2)}%</span>
                        : <span className="text-surface-border">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {p.monthly_cash_flow != null
                        ? <span className={p.monthly_cash_flow >= 0 ? 'text-score-strong' : 'text-score-notrecommended'}>
                            {fmtCAD(p.monthly_cash_flow)}/mo
                          </span>
                        : <span className="text-surface-border">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {p.discount_pct != null && p.discount_pct !== 0
                        ? <span className={p.discount_pct > 0 ? 'text-score-strong' : 'text-score-notrecommended'}>
                            {p.discount_pct > 0 ? '-' : '+'}{Math.abs(p.discount_pct).toFixed(1)}%
                          </span>
                        : <span className="text-surface-border">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-hover text-muted capitalize">
                        {p.primary_source ?? '—'}
                      </span>
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
