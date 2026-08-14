import { useState, useEffect, lazy, Suspense } from 'react'
import { displayAddress } from '../lib/address'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, LayoutGrid, List, Map, ChevronLeft, ChevronRight, SlidersHorizontal, Hash, X,
  Zap, Clock, TrendingUp, ArrowDownCircle, DollarSign, Globe,
} from 'lucide-react'
import clsx from 'clsx'
import {
  fetchProperties, fetchStats, fetchMapProperties, fetchPropertySuggestions,
  type PropertyFilters,
} from '../api'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import { loadBuyBox, cleanBuyBox, BUYBOX_KEYS, BUYBOX_FIELDS, type BuyBox } from '../lib/buybox'
import { ValueSlider } from '../components/ValueSlider'
import { Sparkles, SlidersHorizontal as SlidersIcon } from 'lucide-react'
import ScoreBadge from '../components/ScoreBadge'
import PropertyCardGrid from '../components/PropertyCardGrid'

const PropertyMapView = lazy(() => import('../components/PropertyMapView'))

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: 'duplex',          labelKey: 'ptype_duplex' },
  { value: 'triplex',         labelKey: 'ptype_triplex' },
  { value: 'quadruplex',      labelKey: 'ptype_quadruplex' },
  { value: 'quintuplex_plus', labelKey: 'ptype_quintuplex' },
  { value: 'single_family',   labelKey: 'ptype_single' },
  { value: 'condo',           labelKey: 'ptype_condo' },
]

const SCORE_OPTIONS = [
  { value: '',   labelKey: 'pf_quality_any' },
  { value: '80', labelKey: 'pf_quality_great' },
  { value: '60', labelKey: 'pf_quality_worth' },
  { value: '40', labelKey: 'pf_quality_all' },
]

const LISTED_WITHIN_OPTIONS = [
  { value: '',    labelKey: 'pf_time_any' },
  { value: '24h', labelKey: 'pf_time_24h' },
  { value: '48h', labelKey: 'pf_time_48h' },
  { value: '7d',  labelKey: 'pf_time_7d' },
  { value: '30d', labelKey: 'pf_time_30d' },
]

const SORT_OPTIONS = [
  { value: 'score',      labelKey: 'pf_sort_best' },
  { value: 'discount',   labelKey: 'pf_sort_discount' },
  { value: 'price_asc',  labelKey: 'pf_sort_priceasc' },
  { value: 'price_desc', labelKey: 'pf_sort_pricedesc' },
  { value: 'newest',     labelKey: 'pf_sort_newest' },
  { value: 'days_listed', labelKey: 'pf_sort_longest' },
]

// Buy-box field → translation keys (shared factor_*/fdesc_* keys), so the filter
// panel's buy box localizes just like the Settings one.
const PF_BUYBOX_LABEL: Record<string, string> = {
  cash_flow_min: 'factor_cash_flow', cap_rate_min: 'factor_cap_rate', discount_min: 'factor_discount',
  days_on_market_min: 'factor_dom_bonus', price_drop_min: 'factor_price_cut',
}
const PF_BUYBOX_DESC: Record<string, string> = {
  cash_flow_min: 'fdesc_cash_flow', cap_rate_min: 'fdesc_cap_rate', discount_min: 'fdesc_discount',
  days_on_market_min: 'fdesc_dom_bonus', price_drop_min: 'fdesc_price_cut',
}

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
  const { lang, t } = useLang()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('grid')
  const [showFilters, setShowFilters] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [debouncedAddress, setDebouncedAddress] = useState('')

  // Seed the buy-box targets (set on Settings → My Scoring Criteria) into the
  // filters ONCE on first mount — only when the URL carries no buy-box params
  // yet, so it never fights a link the user followed or filters they cleared.
  useEffect(() => {
    const hasBuyBoxParam = BUYBOX_KEYS.some(k => params.has(k))
    if (hasBuyBoxParam) return
    // Account is the source of truth (syncs across devices); fall back to the
    // localStorage cache before `user` has loaded.
    // cleanBuyBox keeps 0 / negatives for allow-negative fields (cash flow) and
    // drops null / NaN / zero elsewhere — same "is this a real target?" rule the
    // rest of the app uses, so a cash-flow floor of $0 seeds too.
    const bb = cleanBuyBox((user?.custom_buy_box ?? loadBuyBox()) as BuyBox)
    const entries = BUYBOX_KEYS
      .filter(k => bb[k] != null)
      .map(k => [k, String(bb[k])] as [string, string])
    if (entries.length === 0) return
    const next = new URLSearchParams(params)
    entries.forEach(([k, v]) => next.set(k, v))
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const filters: PropertyFilters = {
    city:          params.get('city') ?? undefined,
    address:       params.get('address') ?? undefined,
    mls_number:    params.get('mls_number') ?? undefined,
    property_type: params.get('property_type') ?? undefined,
    listing_type:  params.get('listing_type') ?? undefined,
    sort_by:       (params.get('sort_by') as PropertyFilters['sort_by']) ?? 'score',
    listed_within: (params.get('listed_within') as PropertyFilters['listed_within']) ?? undefined,
    score_min:     params.get('score_min') ? Number(params.get('score_min')) : undefined,
    price_min:     params.get('price_min') ? Number(params.get('price_min')) : undefined,
    price_max:     params.get('price_max') ? Number(params.get('price_max')) : undefined,
    // Real-number "buy box" targets — the client's "in numbers" request.
    cash_flow_min:      params.get('cash_flow_min') ? Number(params.get('cash_flow_min')) : undefined,
    cap_rate_min:       params.get('cap_rate_min') ? Number(params.get('cap_rate_min')) : undefined,
    discount_min:       params.get('discount_min') ? Number(params.get('discount_min')) : undefined,
    days_on_market_min: params.get('days_on_market_min') ? Number(params.get('days_on_market_min')) : undefined,
    price_drop_min:     params.get('price_drop_min') ? Number(params.get('price_drop_min')) : undefined,
    price_drop_pct_min: params.get('price_drop_pct_min') ? Number(params.get('price_drop_pct_min')) : undefined,
    page:          params.get('page') ? Number(params.get('page')) : 1,
    page_size:     view === 'grid' ? 24 : 30,
    multi_site:    params.get('multi_site') === 'true' ? true : undefined,
    has_sqft:      params.get('has_sqft') === 'true' ? true : undefined,
    flood_zone:    params.get('flood_zone') === 'true' ? true : undefined,
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

  // Debounce the address-search box before hitting the suggestion endpoint —
  // avoids firing a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedAddress(filters.address ?? ''), 250)
    return () => clearTimeout(id)
  }, [filters.address])

  const { data: suggestions } = useQuery({
    queryKey: ['property-suggest', debouncedAddress],
    queryFn: () => fetchPropertySuggestions(debouncedAddress),
    enabled: debouncedAddress.trim().length >= 2,
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
    filters.city || filters.address || filters.mls_number || filters.property_type ||
    filters.listing_type || filters.score_min || filters.multi_site || filters.has_sqft || filters.flood_zone ||
    filters.listed_within || filters.price_min || filters.price_max ||
    filters.cash_flow_min || filters.cap_rate_min || filters.discount_min || filters.days_on_market_min ||
    filters.price_drop_min || filters.price_drop_pct_min
  )

  // Rank-by mode: "your" ranks the whole set by the broker's own metrics
  // (sort_by=your_verdict), "ai" by the platform score. Only offered to logged-in
  // brokers — anonymous visitors always see the AI ranking.
  const rankMode: 'ai' | 'your' = filters.sort_by === 'your_verdict' ? 'your' : 'ai'
  const hasCustomWeights = !!user?.custom_score_weights

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{lang === 'fr' ? 'Propriétés' : 'Properties'}</h1>
          <p className="text-sm text-muted">
            {data?.total != null ? (
              hasActiveFilters
                ? `${data.total.toLocaleString()} ${t('pf_of')} ${(stats?.total_properties ?? data.total).toLocaleString()} ${t('pf_listingsMatch')}`
                : `${data.total.toLocaleString()} ${t('pf_listingsFound')}`
            ) : t('pf_loading')}
            {rankMode === 'your' && (
              <span className="text-accent font-semibold">
                {' · '}{lang === 'fr' ? 'classées selon vos critères' : 'ranked by your metrics'}
              </span>
            )}
          </p>
        </div>
        {/* View toggle + Filters */}
        <div className="flex items-center gap-2">
          {/* Rank-by: AI vs My Metrics — the core "analyze every property on your
              own numbers" control. Logged-in brokers only. */}
          {user && (
            <div className="flex items-center gap-0.5 p-0.5 bg-white border border-surface-border rounded-xl shadow-sm">
              <button
                onClick={() => setFilter('sort_by', 'score')}
                title={lang === 'fr' ? 'Classer par score IA' : 'Rank by the AI score'}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                  rankMode === 'ai' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                <Sparkles size={12} /> {lang === 'fr' ? 'IA' : 'AI'}
              </button>
              <button
                onClick={() => setFilter('sort_by', 'your_verdict')}
                title={hasCustomWeights
                  ? (lang === 'fr' ? 'Classer selon vos critères' : 'Rank by your own metrics')
                  : (lang === 'fr' ? 'Définissez vos critères dans Réglages' : 'Set your metrics in Settings first')}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                  rankMode === 'your' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                <SlidersIcon size={12} /> {lang === 'fr' ? 'Mes critères' : 'My Metrics'}
              </button>
            </div>
          )}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all duration-150',
              showFilters
                ? 'border-accent bg-accent text-white shadow-md'
                : 'border-surface-border text-muted bg-white hover:text-ink hover:bg-surface-hover',
            )}
          >
            <SlidersHorizontal size={13} />
            {t('filters')}
            {hasActiveFilters && (
              <span className={clsx('w-1.5 h-1.5 rounded-full', showFilters ? 'bg-white' : 'bg-accent')} />
            )}
          </button>
          <div className="flex items-center gap-0.5 p-0.5 bg-white border border-surface-border rounded-xl shadow-sm">
            {([
              { key: 'grid', icon: <LayoutGrid size={14} /> },
              { key: 'list', icon: <List size={14} /> },
              { key: 'map',  icon: <Map size={14} /> },
            ] as { key: ViewMode; icon: React.ReactNode }[]).map(v => (
              <button key={v.key} onClick={() => setView(v.key)} title={`${v.key} view`}
                className={clsx('p-2 rounded-lg transition-all duration-150', view === v.key ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink')}
              >
                {v.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Prompt to personalize when ranking by "My Metrics" on strategy defaults */}
      {rankMode === 'your' && !hasCustomWeights && (
        <div className="flex items-center gap-2 text-xs bg-accent/5 border border-accent/20 text-ink rounded-xl px-3 py-2">
          <Sparkles size={13} className="text-accent shrink-0" />
          <span className="text-muted">
            {lang === 'fr'
              ? 'Classement selon les pondérations par défaut de votre stratégie. '
              : 'Ranking on your strategy default weights. '}
            <Link to="/settings" className="text-accent font-semibold hover:underline">
              {lang === 'fr' ? 'Définissez vos propres critères' : 'Set your own criteria'}
            </Link>
            {lang === 'fr' ? ' pour un classement personnalisé.' : ' for a fully personalized ranking.'}
          </span>
        </div>
      )}

      {/* ── Unified search + sort bar ─────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center bg-white border border-surface-border rounded-2xl px-3 py-2 shadow-sm">
        <div className="relative flex-1 min-w-[140px] flex items-center gap-2">
          <Search size={15} className="text-muted shrink-0" />
          <input
            type="text"
            placeholder={t('pf_searchPlaceholder')}
            value={filters.address ?? ''}
            onChange={e => setFilter('address', e.target.value)}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            className="w-full text-sm text-ink placeholder:text-muted bg-transparent focus:outline-none"
          />
          {suggestOpen && debouncedAddress.trim().length >= 2 && !!suggestions?.length && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-surface-border rounded-xl shadow-lg z-30 max-h-80 overflow-y-auto">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => { navigate(`/properties/${s.id}`); setSuggestOpen(false) }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-surface-hover transition-colors flex items-center justify-between gap-3 border-b border-surface-border last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink font-medium truncate">{s.full_address}</p>
                    {s.city && <p className="text-xs text-muted truncate">{s.city}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {s.asking_price != null && <p className="text-xs font-semibold text-ink">{fmtCAD(s.asking_price)}</p>}
                    {s.score != null && <p className="text-[10px] text-muted">Score {s.score}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-5 bg-surface-border shrink-0" />
        <Hash size={13} className="text-muted shrink-0" />
        <input
          type="text"
          placeholder={t('pf_mlsPlaceholder')}
          value={filters.mls_number ?? ''}
          onChange={e => setFilter('mls_number', e.target.value)}
          className="w-32 text-sm text-ink placeholder:text-muted bg-transparent focus:outline-none"
        />
        <div className="w-px h-5 bg-surface-border shrink-0" />
        <select
          value={filters.sort_by ?? 'score'}
          onChange={e => setFilter('sort_by', e.target.value)}
          className="text-sm text-ink bg-transparent focus:outline-none cursor-pointer font-medium pr-1"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
        </select>
        {hasActiveFilters && (
          <>
            <div className="w-px h-5 bg-surface-border shrink-0" />
            <button
              onClick={() => setParams(new URLSearchParams())}
              className="flex items-center gap-1 text-xs text-red-500 font-semibold hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
            >
              <X size={11} /> {t('pf_clear')}
            </button>
          </>
        )}
      </div>

      {/* ── Quick filter chips ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Time chips */}
        {[
          { value: '24h',  label: t('pf_chip_24h'), icon: <Zap size={11} /> },
          { value: '48h',  label: t('pf_chip_48h'), icon: <Zap size={11} /> },
          { value: '7d',   label: t('pf_chip_7d'),  icon: <Clock size={11} /> },
          { value: '30d',  label: t('pf_chip_30d'), icon: <Clock size={11} /> },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter('listed_within', filters.listed_within === opt.value ? '' : opt.value)}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150',
              filters.listed_within === opt.value
                ? 'bg-accent text-white border-accent shadow-sm'
                : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-accent hover:bg-accent/5',
            )}
          >
            {opt.icon}{opt.label}
          </button>
        ))}

        <div className="w-px h-4 bg-surface-border mx-0.5" />

        {/* Sort chips */}
        {[
          { value: 'score',      label: t('pf_chip_best'),     icon: <TrendingUp size={11} />,    active: 'bg-score-strong/10 text-score-strong border-score-strong/30',    inactive: 'hover:text-score-strong hover:border-score-strong/30 hover:bg-score-strong/5' },
          { value: 'discount',   label: t('pf_chip_discount'), icon: <ArrowDownCircle size={11} />, active: 'bg-red-50 text-red-600 border-red-200',                           inactive: 'hover:text-red-500 hover:border-red-200 hover:bg-red-50' },
          { value: 'price_asc',  label: t('pf_chip_lowest'),   icon: <DollarSign size={11} />,    active: 'bg-score-worth/10 text-score-worth border-score-worth/30',        inactive: 'hover:text-score-worth hover:border-score-worth/30 hover:bg-score-worth/5' },
          { value: 'price_desc', label: t('pf_chip_highest'),  icon: <TrendingUp size={11} />,    active: 'bg-score-market/10 text-score-market border-score-market/30',     inactive: 'hover:text-score-market hover:border-score-market/30 hover:bg-score-market/5' },
          { value: 'multi',      label: t('multiSite'),        icon: <Globe size={11} />,         active: 'bg-blue-50 text-blue-600 border-blue-200',                        inactive: 'hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50', filter: 'multi_site' },
        ].map(opt => {
          const isSort = opt.value !== 'multi'
          const isActive = isSort
            ? (filters.sort_by === opt.value || (opt.value === 'score' && !filters.sort_by))
            : filters.multi_site === true
          return (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value === 'multi') setFilter('multi_site', filters.multi_site ? '' : 'true')
                else setFilter('sort_by', opt.value)
              }}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150',
                isActive ? opt.active : `bg-white text-muted border-surface-border ${opt.inactive}`,
              )}
            >
              {opt.icon}{opt.label}
            </button>
          )
        })}

        {hasActiveFilters && (
          <button
            onClick={() => setParams(new URLSearchParams())}
            className="flex items-center gap-1 ml-1 text-xs text-red-500 font-semibold hover:bg-red-50 px-2.5 py-1.5 rounded-full border border-red-200 transition-all"
          >
            <X size={10} /> {t('pf_clearAll')}
          </button>
        )}
      </div>

      {/* ── Expanded filters ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="card flex flex-wrap gap-4 items-end">
          {/* Property type */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_propertyType')}</span>
            <select
              value={filters.property_type ?? ''}
              onChange={e => setFilter('property_type', e.target.value)}
              className="select"
            >
              <option value="">{t('allTypes')}</option>
              {PROPERTY_TYPES.map(tp => (
                <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>
              ))}
            </select>
          </label>

          {/* Listing type — for-sale vs for-rent (rentals have no score/cap-rate) */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Listing Type</span>
            <select
              value={filters.listing_type ?? ''}
              onChange={e => setFilter('listing_type', e.target.value)}
              className="select"
            >
              <option value="">For sale &amp; for rent</option>
              <option value="for_sale">For sale</option>
              <option value="for_rent">For rent</option>
            </select>
          </label>

          {/* Quality / Score */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_minQuality')}</span>
            <select
              value={filters.score_min ?? ''}
              onChange={e => setFilter('score_min', e.target.value)}
              className="select"
            >
              {SCORE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </label>

          {/* Listed within */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_listedWithin')}</span>
            <select
              value={filters.listed_within ?? ''}
              onChange={e => setFilter('listed_within', e.target.value)}
              className="select"
            >
              {LISTED_WITHIN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </label>

          {/* City dropdown */}
          {stats?.cities && stats.cities.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">{t('pf_city')}</span>
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

          {/* Price range */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_minPrice')}</span>
            <input
              type="number"
              step="50000"
              placeholder={t('pf_egMin')}
              value={filters.price_min ?? ''}
              onChange={e => setFilter('price_min', e.target.value)}
              className="input w-36"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_maxPrice')}</span>
            <input
              type="number"
              step="50000"
              placeholder={t('pf_egMax')}
              value={filters.price_max ?? ''}
              onChange={e => setFilter('price_max', e.target.value)}
              className="input w-36"
            />
          </label>

          {/* ── Buy-box targets (real numbers) — same control as Settings ───── */}
          <div className="w-full border-t border-surface-border pt-4 mt-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-ink uppercase tracking-wider">{t('pf_buyBoxTitle')}</span>
              <span className="text-[11px] text-muted">{t('pf_buyBoxHint')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
              {BUYBOX_FIELDS.map(cfg => (
                <ValueSlider
                  key={cfg.key}
                  label={t(PF_BUYBOX_LABEL[cfg.key])}
                  desc={t(PF_BUYBOX_DESC[cfg.key])}
                  color={cfg.color}
                  value={filters[cfg.key]}
                  onChange={v => setFilter(cfg.key, v == null ? '' : String(v))}
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  prefix={cfg.prefix}
                  suffix={cfg.suffix}
                  allowNegative={cfg.allowNegative}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted/70 mt-1.5">{t('pf_daysNote')}</p>
          </div>

          {/* Multi-site only */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_multiOnly')}</span>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input
                type="checkbox"
                checked={filters.multi_site === true}
                onChange={e => setFilter('multi_site', e.target.checked ? 'true' : '')}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-sm text-ink">{t('multiSiteFilter')}</span>
            </label>
          </label>

          {/* Has sqft */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_sizeData')}</span>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input
                type="checkbox"
                checked={filters.has_sqft === true}
                onChange={e => setFilter('has_sqft', e.target.checked ? 'true' : '')}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-sm text-ink">{t('pf_hasSqft')}</span>
            </label>
          </label>

          {/* Flood zone */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('pf_floodRisk')}</span>
            <label className="flex items-center gap-2 cursor-pointer h-[38px]">
              <input
                type="checkbox"
                checked={filters.flood_zone === true}
                onChange={e => setFilter('flood_zone', e.target.checked ? 'true' : '')}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-sm text-ink">{t('pf_floodOnly')}</span>
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
                {t('pf_loading')}
              </div>
            </div>
          )}
          {view === 'grid' ? (
            <GridView data={data?.items} isLoading={isLoading} rankMode={rankMode} />
          ) : (
            <ListView data={data?.items} isLoading={isLoading} rankMode={rankMode} />
          )}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {view !== 'map' && !isLoading && data?.items.length === 0 && (
        <div className="card py-12 text-center space-y-2">
          <p className="text-ink font-medium">{t('pf_noResults')}</p>
          <p className="text-sm text-muted">{t('pf_noResultsHint')}</p>
          <button
            onClick={() => setParams(new URLSearchParams())}
            className="mt-4 text-sm text-accent hover:underline"
          >
            {t('pf_clearAllFilters')}
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

function GridView({ data, isLoading, rankMode }: { data?: import('../api').PropertyCard[]; isLoading: boolean; rankMode: 'ai' | 'your' }) {
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
        <PropertyCardGrid key={p.id} property={p} rankMode={rankMode} />
      ))}
    </div>
  )
}

// ── List view (table) ─────────────────────────────────────────────────────────

function ListView({
  data, isLoading, rankMode,
}: {
  data?: import('../api').PropertyCard[]
  isLoading: boolean
  rankMode: 'ai' | 'your'
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
                      {rankMode === 'your' && p.your_score != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black tracking-wider uppercase text-accent">You</span>
                          <ScoreBadge score={p.your_score} category={p.your_score_category ?? null} size="sm" />
                        </div>
                      ) : (
                        <ScoreBadge score={p.score} category={p.score_category} size="sm" />
                      )}
                    </td>
                    <td className="px-5 py-3 max-w-xs">
                      <Link to={`/properties/${p.id}`} className="text-ink hover:text-accent hover:underline font-medium">
                        {displayAddress(p)}
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
