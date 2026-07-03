import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, RefreshCw, MapPin, Calendar,
  Building2, Ruler, AlertCircle, TrendingUp,
  Clock, BarChart2, Bookmark, BookmarkCheck,
  ChevronLeft, ChevronRight, Sparkles, CircleDollarSign,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LabelList,
} from 'recharts'
import clsx from 'clsx'
import { API_BASE, fetchProperty, type PropertyDetail } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import { useLang } from '../context/LanguageContext'
import FinancingWorkbench from '../components/FinancingWorkbench'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCAD(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD',
    maximumFractionDigits: dec, minimumFractionDigits: dec,
  }).format(v)
}

function fmtPct(v: number | null | undefined, dec = 2): string {
  if (v == null) return '—'
  return `${v.toFixed(dec)}%`
}

function statusLabel(s: string, t: (k: string) => string): string {
  if (s === 'price_changed') return t('priceDrop')
  if (s === 'active') return t('active')
  return s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Price per sqft — compute from fields if null
function derivedPricePerSqft(prop: PropertyDetail): number | null {
  if (prop.price_per_sqft != null) return prop.price_per_sqft
  if (prop.asking_price && prop.sqft_total && prop.sqft_total > 0) {
    return prop.asking_price / prop.sqft_total
  }
  return null
}

// ── Saved properties (localStorage) ──────────────────────────────────────────

const SAVED_KEY = 'qre_saved_props'

function useSaved(prop: PropertyDetail | undefined) {
  const id = prop?.id
  const [saved, setSaved] = useState<boolean>(() => {
    if (!id) return false
    try {
      const s = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, unknown>
      return id in s
    } catch { return false }
  })

  const toggle = () => {
    if (!id || !prop) return
    try {
      const s = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, unknown>
      if (saved) {
        delete s[id]
      } else {
        s[id] = {
          id: prop.id,
          full_address: prop.full_address,
          city: prop.city,
          asking_price: prop.asking_price,
          property_type: prop.property_type,
          score: prop.score,
          score_category: prop.score_category,
          photos: prop.photos,
          cap_rate: prop.cap_rate,
          monthly_cash_flow: prop.monthly_cash_flow,
          bedrooms_total: prop.bedrooms_total,
          sqft_total: prop.sqft_total,
          discount_pct: prop.discount_pct,
          primary_source: prop.primary_source,
          savedAt: new Date().toISOString(),
        }
      }
      localStorage.setItem(SAVED_KEY, JSON.stringify(s))
      setSaved(!saved)
    } catch { /* ignore */ }
  }

  return { saved, toggle }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['aiBrief', 'financials', 'comparables', 'priceHistory'] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  aiBrief:      'AI Verdict',
  financials:   'Financials',
  comparables:  'Comparable Sales',
  priceHistory: 'Price History',
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState<TabKey>('aiBrief')
  const queryClient = useQueryClient()
  const { data: prop, isLoading, error } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetchProperty(id!),
    enabled: !!id,
  })

  const { saved, toggle: toggleSaved } = useSaved(prop)
  const [photoIdx, setPhotoIdx] = useState(0)

  const reanalyze = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/properties/${id}/analyze`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string }).detail ?? 'Analysis failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] })
    },
  })

  if (isLoading) return <PropertySkeleton />
  if (error || !prop) return <NotFound t={t} />

  const pricePerSqft = derivedPricePerSqft(prop)

  return (
    <div className="p-6 space-y-5 max-w-[1400px] animate-slide-up">

      {/* Back */}
      <Link
        to="/properties"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} />
        Back to properties
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-ink">{prop.full_address}</h1>
              <span className={clsx(
                'px-2 py-0.5 rounded-lg text-xs font-semibold',
                prop.status === 'active'        ? 'bg-score-strong/10 text-score-strong border border-score-strong/25' :
                prop.status === 'price_changed' ? 'bg-score-market/10 text-score-market border border-score-market/25'  :
                                                   'bg-surface-hover text-muted border border-surface-border',
              )}>
                {statusLabel(prop.status, t)}
              </span>
              {prop.is_new && (
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-accent text-white">
                  NEW
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {[prop.neighborhood, prop.city, prop.province].filter(Boolean).join(', ')}
              </span>
              {prop.postal_code && <span>{prop.postal_code}</span>}
              {prop.days_on_market != null && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {prop.days_on_market} days on market
                </span>
              )}
              {prop.mls_number && (
                <span className="text-muted font-mono text-xs bg-surface px-2 py-0.5 rounded-lg border border-surface-border">
                  MLS# {prop.mls_number}
                </span>
              )}
            </div>
          </div>

          <ScoreBadge score={prop.score} category={prop.score_category} size="lg" />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <KeyMetric label="Asking price"               value={fmtCAD(prop.asking_price)} prominent />
          <KeyMetric
            label="Below market"
            value={prop.discount_pct != null
              ? `${prop.discount_pct > 0 ? '-' : '+'}${Math.abs(prop.discount_pct).toFixed(1)}%`
              : '—'}
            valueClass={
              prop.discount_pct != null && prop.discount_pct > 5 ? 'text-score-strong' :
              prop.discount_pct != null && prop.discount_pct < 0 ? 'text-score-notrecommended' : undefined
            }
          />
          <KeyMetric
            label="Yearly return (cap rate)"
            value={fmtPct(prop.cap_rate)}
            valueClass={prop.cap_rate != null && prop.cap_rate >= 5 ? 'text-score-strong' : undefined}
          />
          <KeyMetric
            label="Monthly profit (cash flow)"
            value={prop.monthly_cash_flow != null ? `${fmtCAD(prop.monthly_cash_flow)}/mo` : '—'}
            valueClass={
              prop.monthly_cash_flow != null && prop.monthly_cash_flow >= 0
                ? 'text-score-strong' : 'text-score-notrecommended'
            }
          />
        </div>

        {/* Cross-site price comparison */}
        {prop.cross_site_prices && prop.cross_site_prices.length > 1 && (
          <div className="pt-1 border-t border-surface-border">
            <p className="text-xs text-muted font-medium mb-2">Same property listed on multiple sites</p>
            <div className="flex flex-wrap gap-2">
              {prop.cross_site_prices.map(s => (
                <a
                  key={s.source}
                  href={s.source_url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                    s.is_lowest
                      ? 'bg-score-strong/10 border-score-strong/30 text-score-strong hover:bg-score-strong/20'
                      : 'bg-surface border-surface-border text-ink hover:border-accent/40',
                  )}
                >
                  <span className="capitalize">{s.source}</span>
                  <span className="font-mono">{fmtCAD(s.price)}</span>
                  {s.is_lowest && (
                    <span className="px-1.5 py-0.5 rounded-full bg-score-strong text-white text-[10px] font-bold">
                      LOWEST
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Spec chips */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted pt-1 border-t border-surface-border">
          <SpecChip icon={<Building2 size={12} />} label={prop.property_type.replace(/_/g, ' ')} />
          {prop.unit_count && <SpecChip icon={null} label={`${prop.unit_count} ${t('units')}`} />}
          {prop.sqft_total && (
            <SpecChip icon={<Ruler size={12} />} label={`${prop.sqft_total.toLocaleString()} ${t('sqft')}`} />
          )}
          {prop.year_built && (
            <SpecChip icon={<Calendar size={12} />} label={`${t('built')} ${prop.year_built}`} />
          )}
          {prop.bedrooms_total && <SpecChip icon={null} label={`${prop.bedrooms_total} bed`} />}
          {prop.bathrooms_total && <SpecChip icon={null} label={`${prop.bathrooms_total} bath`} />}
          {pricePerSqft != null && (
            <SpecChip icon={null} label={`${fmtCAD(pricePerSqft)}/${t('sqft')}`} />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {prop.listing_url && (
            <a
              href={prop.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <ExternalLink size={13} />
              View on {prop.primary_source ?? 'listing'}
            </a>
          )}
          <Link
            to={`/analyze/${prop.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-95"
          >
            <BarChart2 size={13} />
            Deep Analysis
          </Link>
          <button
            onClick={() => reanalyze.mutate()}
            disabled={reanalyze.isPending}
            className="btn-ghost disabled:opacity-50"
          >
            <RefreshCw size={13} className={reanalyze.isPending ? 'animate-spin' : ''} />
            {reanalyze.isPending ? 'Analyzing…' : reanalyze.isError ? 'Failed — Retry' : t('reanalyze')}
          </button>
          {/* Save / Bookmark */}
          <button
            onClick={toggleSaved}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border transition-all duration-150 active:scale-95',
              saved
                ? 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20'
                : 'border-surface-border text-muted hover:text-ink hover:bg-surface-hover',
            )}
          >
            {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Photo carousel */}
      {prop.photos && prop.photos.length > 0 && (
        <div className="relative rounded-2xl overflow-hidden border border-surface-border aspect-video bg-surface-card shadow-card group">
          {/* Main photo */}
          <img
            src={prop.photos[Math.min(photoIdx, prop.photos.length - 1)]}
            alt={`${prop.full_address} — photo ${photoIdx + 1}`}
            className="w-full h-full object-cover transition-opacity duration-300"
            referrerPolicy="no-referrer"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />

          {/* Prev / Next buttons — only when >1 photo */}
          {prop.photos.length > 1 && (
            <>
              <button
                onClick={() => setPhotoIdx(i => (i - 1 + prop.photos.length) % prop.photos.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 active:scale-95 backdrop-blur-sm"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPhotoIdx(i => (i + 1) % prop.photos.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 active:scale-95 backdrop-blur-sm"
              >
                <ChevronRight size={18} />
              </button>

              {/* Counter */}
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-semibold">
                {photoIdx + 1} / {prop.photos.length}
              </div>

              {/* Dot indicators */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                {prop.photos.slice(0, 12).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={clsx(
                      'rounded-full transition-all duration-200',
                      i === photoIdx
                        ? 'w-4 h-1.5 bg-white'
                        : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80',
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-surface-border rounded-2xl overflow-hidden shadow-card">
        <nav className="flex overflow-x-auto bg-surface/50 p-1.5 gap-1">
          {TAB_KEYS.map(key => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all duration-200',
                activeTab === key
                  ? 'bg-white text-accent shadow-sm border border-surface-border'
                  : 'text-muted hover:text-ink hover:bg-white/60',
              )}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div key={activeTab} className="tab-enter">
        {activeTab === 'aiBrief'      && <BriefTab      prop={prop} />}
        {activeTab === 'financials'   && <FinancialsTab prop={prop} t={t} pricePerSqft={pricePerSqft} />}
        {activeTab === 'comparables'  && <ComparablesTab prop={prop} t={t} />}
        {activeTab === 'priceHistory' && <PriceHistoryTab prop={prop} t={t} />}
      </div>
    </div>
  )
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function KeyMetric({ label, value, valueClass, prominent }: {
  label: string; value: string; valueClass?: string; prominent?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted mb-0.5">{label}</p>
      <p className={clsx(
        'font-mono tabular-nums',
        prominent ? 'text-xl text-ink' : 'text-base',
        valueClass ?? 'text-ink',
      )}>
        {value}
      </p>
    </div>
  )
}

function SpecChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 capitalize">{icon}{label}</span>
  )
}

function ConfidencePill({ confidence, t }: { confidence: string; t: (k: string) => string }) {
  const cls =
    confidence === 'high'   ? 'bg-score-strong/15 text-score-strong border-score-strong/25' :
    confidence === 'medium' ? 'bg-score-market/15 text-score-market border-score-market/25'  :
                              'bg-surface-hover text-muted border-surface-border'
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold border', cls)}>
      {confidence.toUpperCase()} {t('confidencePill')}
    </span>
  )
}


// ── Verdict Banner ────────────────────────────────────────────────────────────

function VerdictBanner({ prop }: { prop: PropertyDetail }) {
  const category = prop.score_category
  const score = prop.score
  if (!category || score == null) return null

  const config: Record<string, {
    label: string; headline: string
    bg: string; text: string; border: string; accent: string
    badgeBg: string; badgeText: string; badgeBorder: string
  }> = {
    strong_opportunity: {
      label: 'Strong Buy',
      headline: 'This property merits serious consideration by investor clients.',
      bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',
      accent: '#059669', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700', badgeBorder: 'border-emerald-200',
    },
    worth_investigating: {
      label: 'Worth Investigating',
      headline: 'Good potential — thorough due diligence is recommended before committing.',
      bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200',
      accent: '#2563EB', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', badgeBorder: 'border-blue-200',
    },
    market_price: {
      label: 'Fairly Priced',
      headline: 'Priced at market value — limited discount, limited upside at this price.',
      bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200',
      accent: '#D97706', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', badgeBorder: 'border-amber-200',
    },
    not_recommended: {
      label: 'Not Recommended',
      headline: 'Challenges outweigh the opportunity at the current asking price.',
      bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200',
      accent: '#DC2626', badgeBg: 'bg-red-100', badgeText: 'text-red-700', badgeBorder: 'border-red-200',
    },
  }

  const c = config[category]
  if (!c) return null

  const [activeMetric, setActiveMetric] = useState<string | null>(null)

  // SVG score ring gauge
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference

  return (
    <div className={clsx('rounded-2xl border p-6 space-y-5', c.bg, c.border)}>

      {/* Header: score ring + verdict */}
      <div className="flex items-start gap-5">
        <div className="relative shrink-0 w-20 h-20">
          <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
            <circle cx="40" cy="40" r={radius} strokeWidth="6" fill="none" stroke="rgba(0,0,0,0.08)" />
            <circle
              cx="40" cy="40" r={radius}
              strokeWidth="6" fill="none"
              stroke={c.accent}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black font-mono text-ink leading-none">{score}</span>
            <span className="text-[9px] text-muted font-semibold tracking-wide">/100</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 pt-1">
          <p className={clsx('text-xl font-black tracking-tight', c.text)}>{c.label}</p>
          <p className="text-sm text-muted mt-1 leading-snug">{c.headline}</p>
          {prop.analysis_confidence && (
            <span className={clsx(
              'inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold border',
              c.badgeBg, c.badgeText, c.badgeBorder,
            )}>
              {prop.analysis_confidence.toUpperCase()} CONFIDENCE
            </span>
          )}
        </div>
      </div>

      {/* Key metric cards — tap any card to see how the math works */}
      <p className="text-xs text-muted">Tap a card to see how it's calculated</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(() => {
          const price = prop.asking_price ?? 0
          const compMedian = prop.comparable_median_price ?? 0
          const rent = prop.rental_income_monthly ?? 0
          const mortgage = prop.monthly_mortgage ?? 0
          const muniTax = (prop.municipal_taxes_annual ?? 0) / 12
          const schoolTax = (prop.school_taxes_annual ?? 0) / 12
          const maint = (price * 0.01) / 12
          const noi = prop.noi_annual ?? 0

          type StatusKey = 'great' | 'ok' | 'neutral' | 'bad' | 'null'
          const colors: Record<StatusKey, { bg: string; border: string; val: string; badge: string; ring: string }> = {
            great:   { bg: 'bg-emerald-50', border: 'border-emerald-200', val: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-400' },
            ok:      { bg: 'bg-blue-50',    border: 'border-blue-200',    val: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700',    ring: 'ring-blue-400' },
            neutral: { bg: 'bg-amber-50',   border: 'border-amber-200',   val: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700',  ring: 'ring-amber-400' },
            bad:     { bg: 'bg-red-50',     border: 'border-red-200',     val: 'text-red-700',     badge: 'bg-red-100 text-red-700',     ring: 'ring-red-400' },
            null:    { bg: 'bg-surface',    border: 'border-surface-border', val: 'text-ink',     badge: 'bg-gray-100 text-muted',       ring: 'ring-gray-300' },
          }

          const metrics: {
            label: string; value: string; status: StatusKey; sub: string
            formula: string; breakdown: string; meaning: string
          }[] = [
            {
              label: 'Cap Rate',
              value: prop.cap_rate != null ? `${prop.cap_rate.toFixed(2)}%` : '—',
              status: prop.cap_rate == null ? 'null' : prop.cap_rate >= 6 ? 'great' : prop.cap_rate >= 4.5 ? 'ok' : 'bad',
              sub: prop.cap_rate == null ? '' : prop.cap_rate >= 6 ? 'Above benchmark' : prop.cap_rate >= 4.5 ? 'Acceptable' : 'Below floor',
              formula: 'NOI ÷ Asking Price × 100',
              breakdown: price > 0 && noi !== 0
                ? `${fmtCAD(noi)} NOI ÷ ${fmtCAD(price)} = ${prop.cap_rate?.toFixed(2) ?? '—'}%`
                : 'No data yet — run analysis first',
              meaning: 'Target: ≥6% strong buy · ≥4.5% acceptable · <4.5% below floor',
            },
            {
              label: 'Below Market',
              value: prop.discount_pct != null ? `${prop.discount_pct > 0 ? '-' : '+'}${Math.abs(prop.discount_pct).toFixed(1)}%` : '—',
              status: prop.discount_pct == null ? 'null' : prop.discount_pct >= 10 ? 'great' : prop.discount_pct >= 3 ? 'ok' : prop.discount_pct >= -2 ? 'neutral' : 'bad',
              sub: prop.discount_pct == null ? '' : prop.discount_pct >= 10 ? 'Big discount' : prop.discount_pct >= 3 ? 'Modest discount' : prop.discount_pct >= -2 ? 'Market price' : 'Above market',
              formula: '(Comp Median − Asking Price) ÷ Comp Median × 100',
              breakdown: compMedian > 0 && price > 0
                ? `(${fmtCAD(compMedian)} − ${fmtCAD(price)}) ÷ ${fmtCAD(compMedian)} = ${prop.discount_pct?.toFixed(1) ?? '—'}%`
                : 'Not enough comparable sales yet',
              meaning: '≥10% = big discount · ≥3% = modest · negative = priced above market',
            },
            {
              label: 'Monthly Cash Flow',
              value: prop.monthly_cash_flow != null ? `${fmtCAD(prop.monthly_cash_flow)}/mo` : '—',
              status: prop.monthly_cash_flow == null ? 'null' : prop.monthly_cash_flow > 500 ? 'great' : prop.monthly_cash_flow > 0 ? 'ok' : prop.monthly_cash_flow > -300 ? 'neutral' : 'bad',
              sub: prop.monthly_cash_flow == null ? '' : prop.monthly_cash_flow > 500 ? 'Strong surplus' : prop.monthly_cash_flow > 0 ? 'Break-even' : prop.monthly_cash_flow > -300 ? 'Manageable' : 'Top-up needed',
              formula: 'Monthly Rent − Mortgage − Taxes − Maintenance',
              breakdown: rent > 0
                ? `${fmtCAD(rent)} − ${fmtCAD(mortgage)} − ${fmtCAD(muniTax + schoolTax)} − ${fmtCAD(maint)} = ${fmtCAD(prop.monthly_cash_flow ?? 0)}/mo`
                : 'No rental income data yet',
              meaning: 'Positive = rent pays itself. Negative = you cover the gap monthly',
            },
            {
              label: 'GRM',
              value: prop.grm != null ? `${prop.grm.toFixed(1)}x` : '—',
              status: prop.grm == null ? 'null' : prop.grm <= 12 ? 'great' : prop.grm <= 15 ? 'ok' : 'bad',
              sub: prop.grm == null ? '' : prop.grm <= 12 ? 'Excellent' : prop.grm <= 15 ? 'Acceptable' : 'Elevated',
              formula: 'Asking Price ÷ Annual Gross Rent',
              breakdown: rent > 0 && price > 0
                ? `${fmtCAD(price)} ÷ ${fmtCAD(rent * 12)} = ${prop.grm?.toFixed(1) ?? '—'}x`
                : 'No rental income data yet',
              meaning: '≤12x excellent · ≤15x acceptable · >15x you overpay per rent dollar',
            },
            {
              label: 'Annual NOI',
              value: prop.noi_annual != null ? fmtCAD(prop.noi_annual) : '—',
              status: prop.noi_annual == null ? 'null' : prop.noi_annual > 40000 ? 'great' : prop.noi_annual > 20000 ? 'ok' : prop.noi_annual > 0 ? 'neutral' : 'bad',
              sub: prop.noi_annual == null ? '' : prop.noi_annual > 40000 ? 'Strong income' : prop.noi_annual > 20000 ? 'Moderate' : prop.noi_annual > 0 ? 'Thin margin' : 'Negative',
              formula: 'Annual Rent − Taxes − Maintenance (before mortgage)',
              breakdown: rent > 0
                ? `${fmtCAD(rent * 12)} − ${fmtCAD((prop.municipal_taxes_annual ?? 0) + (prop.school_taxes_annual ?? 0))} − ${fmtCAD(price * 0.01)} = ${fmtCAD(noi)}`
                : 'No rental income data yet',
              meaning: 'Net operating income — what the property earns before your loan payment',
            },
            {
              label: 'Comparables',
              value: prop.comparable_count != null ? `${prop.comparable_count} sales` : '—',
              status: prop.comparable_count == null ? 'null' : prop.comparable_count >= 7 ? 'great' : prop.comparable_count >= 3 ? 'ok' : 'bad',
              sub: prop.comparable_count == null ? '' : prop.comparable_count >= 7 ? 'High confidence' : prop.comparable_count >= 3 ? 'Moderate' : 'Low confidence',
              formula: 'Similar properties sold within 1.5km, past 12 months',
              breakdown: compMedian > 0
                ? `${prop.comparable_count ?? 0} matched → Median sale price: ${fmtCAD(compMedian)}`
                : 'No comparable sales found in area',
              meaning: 'More comps = more reliable market value estimate',
            },
          ]

          return metrics.map(m => {
            const col = colors[m.status]
            const isActive = activeMetric === m.label
            return (
              <button
                key={m.label}
                onClick={() => setActiveMetric(isActive ? null : m.label)}
                className={clsx(
                  'rounded-xl border p-3.5 text-left space-y-1 transition-all duration-150 hover:shadow-sm active:scale-[0.98]',
                  col.bg, col.border,
                  isActive && `ring-2 ${col.ring}`,
                )}
              >
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">{m.label}</p>
                <p className={clsx('text-2xl font-black font-mono leading-none', col.val)}>{m.value}</p>
                {m.sub && (
                  <span className={clsx('inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full', col.badge)}>
                    {m.sub}
                  </span>
                )}
              </button>
            )
          })
        })()}
      </div>

      {/* Math explanation panel — shown when a card is tapped */}
      {activeMetric && (() => {
        const price = prop.asking_price ?? 0
        const compMedian = prop.comparable_median_price ?? 0
        const rent = prop.rental_income_monthly ?? 0
        const mortgage = prop.monthly_mortgage ?? 0
        const muniTax = (prop.municipal_taxes_annual ?? 0) / 12
        const schoolTax = (prop.school_taxes_annual ?? 0) / 12
        const maint = (price * 0.01) / 12
        const noi = prop.noi_annual ?? 0
        const explanations: Record<string, { formula: string; breakdown: string; meaning: string }> = {
          'Cap Rate':          { formula: 'NOI ÷ Asking Price × 100', breakdown: price > 0 && noi !== 0 ? `${fmtCAD(noi)} NOI ÷ ${fmtCAD(price)} = ${prop.cap_rate?.toFixed(2) ?? '—'}%` : 'No data yet', meaning: 'Target: ≥6% strong buy · ≥4.5% acceptable · <4.5% below floor' },
          'Below Market':      { formula: '(Comp Median − Asking Price) ÷ Comp Median × 100', breakdown: compMedian > 0 ? `(${fmtCAD(compMedian)} − ${fmtCAD(price)}) ÷ ${fmtCAD(compMedian)} = ${prop.discount_pct?.toFixed(1) ?? '—'}%` : 'Not enough comparable sales', meaning: '≥10% = big discount · ≥3% = modest · negative = above market' },
          'Monthly Cash Flow': { formula: 'Monthly Rent − Mortgage − Taxes − Maintenance', breakdown: rent > 0 ? `${fmtCAD(rent)} − ${fmtCAD(mortgage)} − ${fmtCAD(muniTax + schoolTax)} − ${fmtCAD(maint)} = ${fmtCAD(prop.monthly_cash_flow ?? 0)}/mo` : 'No rental income data', meaning: 'Positive = self-sustaining · Negative = you top up monthly' },
          'GRM':               { formula: 'Asking Price ÷ Annual Gross Rent', breakdown: rent > 0 ? `${fmtCAD(price)} ÷ ${fmtCAD(rent * 12)} = ${prop.grm?.toFixed(1) ?? '—'}x` : 'No rental income data', meaning: '≤12x excellent · ≤15x acceptable · >15x expensive per rent dollar' },
          'Annual NOI':        { formula: 'Annual Rent − Taxes − Maintenance (before mortgage)', breakdown: rent > 0 ? `${fmtCAD(rent * 12)} − ${fmtCAD((prop.municipal_taxes_annual ?? 0) + (prop.school_taxes_annual ?? 0))} − ${fmtCAD(price * 0.01)} = ${fmtCAD(noi)}` : 'No rental income data', meaning: 'Net operating income — what the building earns before your loan payment' },
          'Comparables':       { formula: 'Similar properties sold within 1.5km, past 12 months', breakdown: compMedian > 0 ? `${prop.comparable_count ?? 0} matched → Median sale: ${fmtCAD(compMedian)}` : 'No comparable sales found', meaning: 'More comps = higher confidence in the market value' },
        }
        const ex = explanations[activeMetric]
        if (!ex) return null
        return (
          <div className="rounded-xl border border-surface-border bg-white p-4 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">{activeMetric} — How it's calculated</p>
              <button onClick={() => setActiveMetric(null)} className="text-muted hover:text-ink text-lg leading-none">×</button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wide pt-0.5 shrink-0 w-20">Formula</span>
                <span className="text-sm font-mono text-blue-700 font-semibold">{ex.formula}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wide pt-0.5 shrink-0 w-20">This property</span>
                <span className="text-sm font-mono text-ink">{ex.breakdown}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wide pt-0.5 shrink-0 w-20">Benchmarks</span>
                <span className="text-sm text-muted">{ex.meaning}</span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Investment Report helpers ─────────────────────────────────────────────────

function buildProjection(prop: PropertyDetail) {
  const price  = prop.asking_price ?? 0
  const down   = prop.down_payment_20pct ?? price * 0.20
  const loan   = price - down
  const r      = 0.045 / 12
  const terms  = 25 * 12
  const P      = prop.monthly_mortgage ??
    (loan * r * Math.pow(1 + r, terms)) / (Math.pow(1 + r, terms) - 1)
  const appRate  = 0.03
  const annualCF = (prop.monthly_cash_flow ?? 0) * 12

  // raw (unrounded) balance at any year — used to compute principal paydown
  const rawBalance = (yr: number) => {
    const n = yr * 12
    if (n <= 0) return loan
    return loan * Math.pow(1 + r, n) - P * ((Math.pow(1 + r, n) - 1) / r)
  }

  return [0, 1, 2, 3, 4, 5].map(yr => {
    const value          = Math.round(price * Math.pow(1 + appRate, yr))
    const balance        = Math.round(rawBalance(yr))
    const equity         = value - balance
    const cumCF          = Math.round(annualCF * yr)
    // Capitalization = principal repaid this year (equity built via mortgage paydown)
    const capitalization = yr > 0 ? Math.round(rawBalance(yr - 1) - rawBalance(yr)) : 0
    // Appreciation = property value gain this year
    const appreciation   = yr > 0 ? value - Math.round(price * Math.pow(1 + appRate, yr - 1)) : 0
    // Cash flow component (annual net, with 1% annual rent growth each year)
    const cashflow       = yr > 0 ? Math.round(annualCF * Math.pow(1.01, yr - 1)) : 0
    const returnTotal    = cashflow + capitalization + appreciation

    return {
      year: yr === 0 ? 'Now' : `Year ${yr}`,
      value,
      equity,
      annualCF: Math.round(annualCF),
      cumCF,
      totalWealth: equity + cumCF,
      cashflow,
      capitalization,
      appreciation,
      returnTotal,
    }
  })
}

function buildPieData(prop: PropertyDetail) {
  const mortgage    = Math.round((prop.monthly_mortgage ?? 0) * 12)
  const municipal   = Math.round(prop.municipal_taxes_annual ?? 0)
  const school      = Math.round(prop.school_taxes_annual ?? 0)
  const maintenance = Math.round((prop.asking_price ?? 0) * 0.01)
  const rental      = Math.round((prop.rental_income_monthly ?? 0) * 12)

  const totalOut = mortgage + municipal + school + maintenance
  const net      = rental > 0 ? rental - totalOut : null

  const slices = [
    { name: 'Mortgage',     value: mortgage,    color: '#3B82F6' },
    { name: 'Muni. Tax',    value: municipal,   color: '#F59E0B' },
    { name: 'School Tax',   value: school,      color: '#EF4444' },
    { name: 'Maintenance',  value: maintenance, color: '#8B5CF6' },
    ...(net !== null && net > 0
      ? [{ name: 'Net Income', value: net, color: '#10B981' }]
      : []),
  ]
  return slices.filter(s => s.value > 0)
}

function buildScoreFactors(prop: PropertyDetail) {
  const norm = (val: number, bad: number, good: number) =>
    Math.round(Math.min(100, Math.max(0, ((val - bad) / (good - bad)) * 100)))

  const discount = prop.discount_pct ?? 0
  const capRate  = prop.cap_rate ?? 0
  const cf       = prop.monthly_cash_flow ?? 0
  const grm      = prop.grm ?? 15
  const comps    = prop.comparable_count ?? 0
  const dom      = prop.days_on_market ?? 30
  const price    = prop.asking_price ?? 1

  return [
    { label: 'Price Discount', weight: 28, score: norm(discount, 0, 20),               value: `${discount.toFixed(1)}%` },
    { label: 'Cap Rate',       weight: 18, score: norm(capRate, 0, 8),                 value: `${capRate.toFixed(2)}%` },
    { label: 'Cash Flow',      weight: 17, score: norm((cf / price) * 100, -0.5, 1.0), value: `${fmtCAD(cf)}/mo` },
    { label: 'Days Listed',    weight: 13, score: norm(dom, 7, 90),                    value: `${dom}d` },
    { label: 'Confidence',     weight: 10, score: norm(comps, 0, 10),                  value: `${comps} comps` },
    { label: 'GRM',            weight:  7, score: norm(-(grm), -18, -10),              value: `${grm.toFixed(1)}x` },
    { label: 'Price Trend',    weight:  7, score: 50,                                   value: '—' },
  ]
}

// ── Investment Report (main data-driven section) ──────────────────────────────

function InvestmentReport({ prop }: { prop: PropertyDetail }) {
  const projection = buildProjection(prop)
  const pieData    = buildPieData(prop)
  const factors    = buildScoreFactors(prop)

  const projYrs = projection.slice(1)   // Year 1–5
  const down    = prop.down_payment_20pct ?? (prop.asking_price ?? 0) * 0.20

  const totalReturn$ = projYrs.reduce((s, r) => s + r.returnTotal, 0)
  const roi5yrPct    = down > 0 ? (totalReturn$ / down) * 100 : 0
  const roiAvg$      = Math.round(totalReturn$ / 5)
  const roiAvgPct    = roi5yrPct / 5

  const fmtK = (v: number) =>
    Math.abs(v) >= 1_000_000
      ? `${v < 0 ? '-' : ''}$${(Math.abs(v) / 1_000_000).toFixed(2)}M`
      : `${v < 0 ? '-' : ''}$${(Math.abs(v) / 1_000).toFixed(0)}K`

  const GREEN = '#10B981'
  const RED   = '#EF4444'

  // Totals for pie legend percentage
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0)

  // PropPulse colour palette for stacked bars
  const CF_COLOR  = '#1E3A8A'   // dark blue  — cashflow
  const CAP_COLOR = '#3B82F6'   // medium blue — capitalization (principal paydown)
  const APP_COLOR = '#93C5FD'   // light blue  — appreciation

  return (
    <div className="space-y-6">

      {/* ── 5-YEAR FINANCIAL PROJECTION (PropPulse style) ─────────────────── */}
      <div className="card p-6 space-y-5">

        {/* Title */}
        <div className="border-b-2 border-amber-400 pb-3">
          <h3 className="text-lg font-black text-ink uppercase tracking-wide text-center">5-Year Financial Projection</h3>
          <p className="text-xs text-muted text-center mt-1">3% annual appreciation · 4.5% rate · 25-yr amortization · 1% rent growth/yr</p>
        </div>

        {/* ROI headline cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-surface-border p-5 text-center space-y-1">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">ROI Total 5 Years</p>
            <p className="text-4xl font-black font-mono text-ink">{roi5yrPct.toFixed(2)}%</p>
            <p className="text-sm font-semibold text-muted">{fmtCAD(totalReturn$)}</p>
          </div>
          <div className="rounded-xl border border-surface-border p-5 text-center space-y-1">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">Annual Average ROI</p>
            <p className="text-4xl font-black font-mono text-ink">{roiAvgPct.toFixed(2)}%</p>
            <p className="text-sm font-semibold text-muted">{fmtCAD(roiAvg$)}/yr</p>
          </div>
        </div>

        {/* Stacked bar chart — cashflow clamped ≥0 so bars never go below zero */}
        {(() => {
          const hasCFNeg = projYrs.some(r => r.cashflow < 0)
          const chartData = projYrs.map(r => ({
            ...r,
            cashflowBar: Math.max(0, r.cashflow),
            stackTotal:  Math.max(0, r.cashflow) + r.capitalization + r.appreciation,
          }))
          return (
            <div className="space-y-2">
              {hasCFNeg && (
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  <p className="text-xs text-red-600 font-medium">
                    Cash flow is negative ({fmtCAD(projYrs[0].cashflow)}/yr) — shown as $0 in the chart. Appreciation &amp; principal paydown still build wealth.
                  </p>
                </div>
              )}
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 32, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 13, fontWeight: 700, fill: '#374151' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtK}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={54} axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => {
                      const label = (name as string) === 'cashflowBar' ? 'Cashflow' : name as string
                      return [fmtCAD(v as number), label]
                    }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Legend
                    formatter={v => v === 'cashflowBar' ? 'Cashflow' : v as string}
                    wrapperStyle={{ fontSize: 13, paddingTop: 10 }}
                  />
                  <Bar dataKey="cashflowBar"    name="cashflowBar"    fill={CF_COLOR}  stackId="s" />
                  <Bar dataKey="capitalization" name="Capitalization" fill={CAP_COLOR} stackId="s" />
                  <Bar dataKey="appreciation"   name="Appreciation"   fill={APP_COLOR} stackId="s" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="stackTotal"
                      position="top"
                      formatter={(v: unknown) => fmtK(v as number)}
                      style={{ fontSize: 12, fontWeight: 800, fill: '#1E293B' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })()}

        {/* Transposed table: metrics as rows, years as columns */}
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border" style={{ backgroundColor: '#1E3A8A' }}>
                <th className="px-4 py-3 text-left font-bold text-white text-xs uppercase tracking-wide">Metric</th>
                {projYrs.map(r => (
                  <th key={r.year} className="px-4 py-3 text-right font-bold text-white text-xs">{r.year}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {([
                { label: 'Cashflow',       key: 'cashflow'       as const, color: CF_COLOR  },
                { label: 'Appreciation',   key: 'appreciation'   as const, color: APP_COLOR },
                { label: 'Capitalization', key: 'capitalization' as const, color: CAP_COLOR },
              ] as const).map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-surface/40'}>
                  <td className="px-4 py-3 font-bold text-ink flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </td>
                  {projYrs.map(yr => (
                    <td key={yr.year} className="px-4 py-3 text-right font-mono tabular-nums text-ink">{fmtCAD(yr[row.key])}</td>
                  ))}
                </tr>
              ))}
              <tr className="font-bold" style={{ backgroundColor: '#F8FAFC' }}>
                <td className="px-4 py-3 font-bold text-ink border-t-2 border-surface-border">Total</td>
                {projYrs.map(yr => (
                  <td key={yr.year} className="px-4 py-3 text-right font-mono tabular-nums font-bold text-ink border-t-2 border-surface-border">{fmtCAD(yr.returnTotal)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cost Breakdown Pie + Score Factors ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Annual cost breakdown pie */}
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-ink">Annual Cost Breakdown</h3>
            <p className="text-sm text-muted mt-0.5">Where each rental dollar goes</p>
          </div>
          {pieData.length > 0 ? (
            <>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData} cx="50%" cy="50%"
                      innerRadius={60} outerRadius={95}
                      dataKey="value" paddingAngle={3}
                      startAngle={90} endAngle={-270}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => [fmtCAD(v as number), '']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {pieData.map(d => {
                  const pct = pieTotal > 0 ? Math.round((d.value / pieTotal) * 100) : 0
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-ink">{d.name}</span>
                          <span className="text-sm font-mono font-bold text-ink">{fmtCAD(d.value)}/yr</span>
                        </div>
                        <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                        </div>
                      </div>
                      <span className="text-xs text-muted w-8 text-right shrink-0">{pct}%</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted border-t border-surface-border pt-3">
                Maintenance estimated at 1% of property value annually.
              </p>
            </>
          ) : (
            <div className="py-12 text-center">
              <p className="text-muted text-sm">Financial data not available — click Reanalyze to generate.</p>
            </div>
          )}
        </div>

        {/* Score factor breakdown */}
        <div className="card p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-ink">Score Breakdown</h3>
              <p className="text-sm text-muted mt-0.5">How each signal contributes to the score</p>
            </div>
            {prop.score != null && (
              <div className="text-right">
                <p className="text-4xl font-black font-mono text-ink leading-none">{prop.score}</p>
                <p className="text-sm text-muted">out of 100</p>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {factors.map(f => (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm font-semibold text-ink">{f.label}</span>
                    <span className="text-xs text-muted ml-1.5">{f.weight}% weight</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted">{f.value}</span>
                    <span className={clsx(
                      'text-sm font-black font-mono w-8 text-right',
                      f.score >= 70 ? 'text-emerald-700' : f.score >= 40 ? 'text-amber-600' : 'text-red-600',
                    )}>{f.score}</span>
                  </div>
                </div>
                <div className="h-2.5 bg-surface-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${f.score}%`,
                      backgroundColor: f.score >= 70 ? GREEN : f.score >= 40 ? '#F59E0B' : RED,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {prop.analysis_confidence && (
            <div className="pt-3 border-t border-surface-border flex items-center justify-between text-xs text-muted">
              <span>{prop.comparable_count ?? 0} comparable sales · {prop.analysis_confidence} confidence</span>
              {prop.last_analyzed_at && (
                <span>{new Date(prop.last_analyzed_at).toLocaleDateString('en-CA')}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AI Brief expandable section ───────────────────────────────────────────────

// ── Rule-based Investment Insights (no API required) ─────────────────────────

function InvestmentInsights({ prop }: { prop: PropertyDetail }) {
  type Insight = { text: string; good: boolean | null }
  const insights: Insight[] = []

  // Cap rate signal
  if (prop.cap_rate != null) {
    if (prop.cap_rate >= 6)        insights.push({ text: `Cap rate ${prop.cap_rate.toFixed(2)}% — exceeds Quebec's 6% strong-buy threshold`, good: true })
    else if (prop.cap_rate >= 4.5) insights.push({ text: `Cap rate ${prop.cap_rate.toFixed(2)}% — within the acceptable 4.5%–6% Quebec range`, good: null })
    else                           insights.push({ text: `Cap rate ${prop.cap_rate.toFixed(2)}% — below Quebec's 4.5% minimum floor`, good: false })
  }

  // Discount vs market
  if (prop.discount_pct != null) {
    if (prop.discount_pct >= 10)      insights.push({ text: `Listed ${prop.discount_pct.toFixed(1)}% below comparable sales — strong buying opportunity`, good: true })
    else if (prop.discount_pct >= 3)  insights.push({ text: `Listed ${prop.discount_pct.toFixed(1)}% below comparable median — modest discount`, good: null })
    else if (prop.discount_pct >= -2) insights.push({ text: `Priced at market value (${Math.abs(prop.discount_pct).toFixed(1)}% vs comparables)`, good: null })
    else                              insights.push({ text: `Listed ${Math.abs(prop.discount_pct).toFixed(1)}% above comparable sales — paying a premium`, good: false })
  }

  // Cash flow
  if (prop.monthly_cash_flow != null) {
    const cf = prop.monthly_cash_flow
    if (cf > 500)       insights.push({ text: `Cash flow ${fmtCAD(cf)}/mo — rent covers all costs with surplus`, good: true })
    else if (cf > 0)    insights.push({ text: `Cash flow ${fmtCAD(cf)}/mo — barely break-even after all costs`, good: null })
    else if (cf > -400) insights.push({ text: `Cash flow ${fmtCAD(cf)}/mo — you cover the shortfall monthly`, good: null })
    else                insights.push({ text: `Cash flow ${fmtCAD(cf)}/mo — significant monthly top-up required`, good: false })
  }

  // GRM
  if (prop.grm != null) {
    if (prop.grm <= 12)      insights.push({ text: `GRM ${prop.grm.toFixed(1)}x — excellent value per rent dollar`, good: true })
    else if (prop.grm <= 15) insights.push({ text: `GRM ${prop.grm.toFixed(1)}x — acceptable within Quebec's 13–15x range`, good: null })
    else                     insights.push({ text: `GRM ${prop.grm.toFixed(1)}x — above 15x, paying premium per rent dollar`, good: false })
  }

  // Price history drops
  const hist = prop.price_history
  if (hist && hist.length >= 2) {
    const sorted = [...hist].filter(h => h.price > 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const drops = sorted.slice(1).filter((h, i) => h.price < sorted[i].price).length
    if (drops >= 2)     insights.push({ text: `${drops} price reductions on record — seller is motivated to close`, good: true })
    else if (drops === 1) insights.push({ text: `1 price reduction on record — some negotiation room likely`, good: null })
  }

  // Comparable confidence
  if (prop.comparable_count != null) {
    if (prop.comparable_count >= 7)      insights.push({ text: `${prop.comparable_count} comparable sales — market value estimate is high confidence`, good: true })
    else if (prop.comparable_count >= 3) insights.push({ text: `${prop.comparable_count} comparable sales — moderate confidence in market value`, good: null })
    else                                 insights.push({ text: `${prop.comparable_count ?? 0} comparable sales — low confidence, limited market data`, good: false })
  }

  // Welcome tax warning
  if (prop.welcome_tax != null && prop.welcome_tax > 0) {
    insights.push({ text: `Quebec welcome tax ${fmtCAD(prop.welcome_tax)} due at closing — budget accordingly`, good: null })
  }

  const icon = (good: boolean | null) =>
    good === true ? '↑' : good === false ? '↓' : '→'

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-ink">Investment Signals</h3>
        {prop.last_analyzed_at && (
          <span className="text-xs text-muted">Updated {new Date(prop.last_analyzed_at).toLocaleDateString('en-CA')}</span>
        )}
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">Run analysis first to see investment signals.</p>
      ) : (
        <div className="divide-y divide-surface-border">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <span className={clsx(
                'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black',
                ins.good === true  ? 'bg-emerald-100 text-emerald-700' :
                ins.good === false ? 'bg-red-100 text-red-600' :
                                    'bg-gray-100 text-muted',
              )}>{icon(ins.good)}</span>
              <span className="text-sm text-ink leading-snug">{ins.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stored analysis section (shows existing DB brief, zero API calls) ─────────

type BriefLine = { type: 'text' | 'bullet' | 'risk'; text: string; severity?: string }
type BriefSection = { heading: string; lines: BriefLine[] }

function parseBriefSections(text: string): BriefSection[] {
  const sections: BriefSection[] = []
  let current: BriefSection | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line === '---') continue
    if (line.startsWith('|')) continue  // skip markdown tables entirely

    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { heading: line.replace(/^##\s*\d*\.?\s*/, '').trim(), lines: [] }
    } else if (line.startsWith('# ')) {
      // skip top-level heading (just the property name)
    } else if (current) {
      // Strip all markdown formatting
      const clean = line
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/^[-•]\s*/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
      if (!clean) continue

      // Detect risk severity labels [HIGH], [MEDIUM], [CRITICAL], [LOW]
      const riskMatch = clean.match(/^\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*(.+)$/)
      if (riskMatch) {
        current.lines.push({ type: 'risk', severity: riskMatch[1], text: riskMatch[2] })
      } else if (line.match(/^[-•*]\s/)) {
        current.lines.push({ type: 'bullet', text: clean })
      } else {
        current.lines.push({ type: 'text', text: clean })
      }
    }
  }
  if (current) sections.push(current)
  return sections.filter(s => s.lines.length > 0)
}

function StoredAnalysisSection({ prop }: { prop: PropertyDetail }) {
  const [open, setOpen]   = useState(false)
  const [lang, setLang]   = useState<'en' | 'fr'>('en')

  const hasBrief = !!(prop.ai_brief_en || prop.ai_brief_fr)
  const hasFr    = !!prop.ai_brief_fr
  const brief    = lang === 'fr' ? (prop.ai_brief_fr ?? prop.ai_brief_en) : prop.ai_brief_en
  const sections = brief ? parseBriefSections(brief) : []

  const riskColors: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
    HIGH:     'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM:   'bg-amber-100 text-amber-700 border-amber-200',
    LOW:      'bg-blue-100 text-blue-700 border-blue-200',
  }

  return (
    <div className="card overflow-hidden">

      {/* Clickable header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
            hasBrief ? 'bg-accent/10 text-accent' : 'bg-surface-border text-muted',
          )}>
            {hasBrief ? '✦' : '+'}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-ink">
              {hasBrief ? 'View Property Analysis' : 'Generate Property Analysis'}
            </p>
            <p className="text-xs text-muted">
              {hasBrief
                ? `AI-written summary${prop.last_analyzed_at ? ' · ' + new Date(prop.last_analyzed_at).toLocaleDateString('en-CA') : ''}`
                : 'Click Reanalyze at the top to generate'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasFr && open && (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              {(['en', 'fr'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={clsx(
                    'px-2 py-0.5 rounded text-xs font-bold border transition-all',
                    lang === l ? 'bg-accent text-white border-accent' : 'text-muted border-surface-border',
                  )}
                >{l.toUpperCase()}</button>
              ))}
            </div>
          )}
          <span className={clsx(
            'text-muted text-xl leading-none transition-transform duration-200',
            open && 'rotate-180',
          )}>⌄</span>
        </div>
      </button>

      {/* Expandable content */}
      {open && (
        <div className="border-t border-surface-border">
          {!hasBrief ? (
            <div className="px-5 py-8 text-center space-y-2">
              <p className="text-sm text-muted">No analysis generated yet.</p>
              <p className="text-xs text-muted">Click the <span className="font-semibold text-ink">Reanalyze</span> button at the top of the page to generate one.</p>
            </div>
          ) : sections.length === 0 ? (
            <div className="px-5 py-4">
              <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{brief}</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {sections.map((sec, i) => (
                <div key={i} className="px-5 py-4 space-y-3">
                  {sec.heading && (
                    <p className="text-xs font-black text-muted uppercase tracking-widest">{sec.heading}</p>
                  )}
                  <div className="space-y-2">
                    {sec.lines.map((ln, j) => {
                      if (ln.type === 'risk') {
                        const col = riskColors[ln.severity ?? 'LOW'] ?? riskColors.LOW
                        return (
                          <div key={j} className="flex items-start gap-2.5">
                            <span className={clsx('shrink-0 mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-black uppercase', col)}>
                              {ln.severity}
                            </span>
                            <span className="text-sm text-ink leading-snug">{ln.text}</span>
                          </div>
                        )
                      }
                      if (ln.type === 'bullet') {
                        return (
                          <div key={j} className="flex items-start gap-2">
                            <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-accent/60" />
                            <span className="text-sm text-ink leading-relaxed">{ln.text}</span>
                          </div>
                        )
                      }
                      return <p key={j} className="text-sm text-ink leading-relaxed">{ln.text}</p>
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Investment Verdict tab ────────────────────────────────────────────────────

function BriefTab({ prop }: { prop: PropertyDetail }) {
  const hasFinancials = prop.asking_price != null

  return (
    <div className="space-y-5 animate-slide-up">
      <VerdictBanner prop={prop} />
      <InvestmentInsights prop={prop} />

      {hasFinancials ? (
        <InvestmentReport prop={prop} />
      ) : (
        <div className="card py-10 text-center space-y-3">
          <BarChart2 className="mx-auto text-muted" size={28} />
          <p className="text-sm text-muted">Financial data not available for this property.</p>
        </div>
      )}

      <StoredAnalysisSection prop={prop} />
    </div>
  )
}

// ── Financials tab ────────────────────────────────────────────────────────────

function FinancialsTab({ prop, t, pricePerSqft }: { prop: PropertyDetail; t: (k: string) => string; pricePerSqft: number | null }) {
  return (
    <div className="space-y-5">

      {/* ── Financing Workbench — single source for all financial values ── */}
      <FinancingWorkbench prop={prop} pricePerSqft={pricePerSqft} />

      {/* ── Market comparison bar ── */}
      {prop.asking_price != null && prop.comparable_median_price != null && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Price vs Comparable Market</h3>
            {prop.analysis_confidence && <ConfidencePill confidence={prop.analysis_confidence} t={t} />}
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>This property</span>
                <span className="font-mono font-bold text-ink">{fmtCAD(prop.asking_price)}</span>
              </div>
              <div className="h-3 bg-surface-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${Math.min(100, (prop.asking_price / (prop.comparable_median_price * 1.3)) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>Comparable median ({prop.comparable_count ?? 0} properties)</span>
                <span className="font-mono font-bold text-muted">{fmtCAD(prop.comparable_median_price)}</span>
              </div>
              <div className="h-3 bg-surface-border rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-surface-border/80" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm pt-1 border-t border-surface-border">
            <span className={clsx(
              'font-bold',
              prop.value_gap != null && prop.value_gap > 0 ? 'text-emerald-600' : 'text-red-500',
            )}>
              {prop.value_gap != null ? (prop.value_gap > 0 ? `You save ${fmtCAD(prop.value_gap)}` : `You pay ${fmtCAD(Math.abs(prop.value_gap))} extra`) : '—'}
            </span>
            <span className="text-muted text-xs">vs comparable median</span>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Comparables tab ───────────────────────────────────────────────────────────

type ComparableProp = {
  id: string
  mls_number: string | null
  full_address: string
  city: string
  asking_price: number | null
  sqft_total: number | null
  unit_count: number | null
  year_built: number | null
  property_type: string
  cap_rate: number | null
  listing_url: string | null
  photos: string[] | null
  distance_km: number | null
}

type CompareMode = 'match' | 'distance' | 'price' | 'sqft' | 'type'

const COMPARE_MODES: { key: CompareMode; label: string; icon: typeof Sparkles; hint: string }[] = [
  { key: 'match',    label: 'Best match', icon: Sparkles,         hint: 'Same type nearby, price ±40%, ranked by similarity' },
  { key: 'distance', label: 'Distance',   icon: MapPin,           hint: 'Nearest active listings, any type' },
  { key: 'price',    label: 'Price',      icon: CircleDollarSign, hint: 'Active listings with the closest asking price' },
  { key: 'sqft',     label: 'Size',       icon: Ruler,            hint: 'Active listings with the closest living area' },
  { key: 'type',     label: 'Type',       icon: Building2,        hint: 'Same property type, best score first' },
]

const EMPTY_REASON: Record<CompareMode, string> = {
  match:    'No analysis comparables yet — run Reanalyze, or try another view.',
  distance: 'This property has no coordinates, so distance search is unavailable.',
  price:    'This property has no asking price, so price search is unavailable.',
  sqft:     'This property has no living-area data, so size search is unavailable.',
  type:     'No other active listings of this type found.',
}

function ComparablesTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  // Multi-select: combine criteria (e.g. Distance + Price). 'match' is exclusive —
  // it's already a composite similarity ranking of its own.
  const [modes, setModes] = useState<CompareMode[]>(['match'])

  const toggleMode = (key: CompareMode) => {
    setModes(prev => {
      if (key === 'match') return ['match']
      let next = prev.filter(m => m !== 'match')
      next = next.includes(key) ? next.filter(m => m !== key) : [...next, key]
      return next.length === 0 ? ['match'] : next
    })
  }

  const isMatch  = modes.includes('match')
  const selected = COMPARE_MODES.filter(m => modes.includes(m.key))
  const modesKey = [...modes].sort().join(',')

  const hint = isMatch
    ? COMPARE_MODES[0].hint
    : selected.length === 1
      ? selected[0].hint
      : `${modes.includes('type') ? 'Same property type only · ' : ''}ranked by combined closeness: ${
          selected.filter(m => m.key !== 'type').map(m => m.label).join(' + ') || 'best score first'}`

  const emptyReason =
    (modes.includes('price') && prop.asking_price == null && EMPTY_REASON.price) ||
    (modes.includes('sqft') && prop.sqft_total == null && EMPTY_REASON.sqft) ||
    (modes.includes('distance') && 'No results — this property may be missing map coordinates.') ||
    EMPTY_REASON[modes[0]]

  const { data: comps, isLoading } = useQuery<ComparableProp[]>({
    queryKey: ['comparables', prop.id, modesKey],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/properties/${prop.id}/comparables?by=${modesKey}`)
      if (!res.ok) return []
      return res.json()
    },
  })

  return (
    <div className="space-y-5">

      {/* ── Summary stats (from the stored analysis) ── */}
      {!!prop.comparable_count && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Comparable Sales',  value: String(prop.comparable_count ?? 0),  sub: 'matched in area',    accent: 'text-accent' },
            { label: 'Median Price',      value: fmtCAD(prop.comparable_median_price), sub: 'market benchmark',   accent: 'text-ink' },
            { label: 'Average Price',     value: fmtCAD(prop.comparable_mean_price),   sub: 'mean of comps',      accent: 'text-ink' },
            {
              label: 'You Save',
              value: prop.value_gap != null ? `${prop.value_gap > 0 ? '-' : '+'}${fmtCAD(Math.abs(prop.value_gap))}` : '—',
              sub: `vs median (${Math.abs(prop.discount_pct ?? 0).toFixed(1)}%)`,
              accent: prop.value_gap != null && prop.value_gap > 0 ? 'text-emerald-600' : 'text-red-500',
            },
          ].map(s => (
            <div key={s.label} className="card p-4 space-y-1 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{s.label}</p>
              <p className={clsx('text-xl font-black font-mono leading-tight', s.accent)}>{s.value}</p>
              <p className="text-[10px] text-muted">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Compare-by control (multi-select) ── */}
      <div className="card p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#134E4A]">
            Compare by <span className="normal-case font-medium text-muted tracking-normal">— combine criteria</span>
          </p>
          {prop.analysis_confidence && isMatch && <ConfidencePill confidence={prop.analysis_confidence} t={t} />}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Comparison criteria — multiple can be selected">
          {COMPARE_MODES.map(m => {
            const Icon = m.icon
            const on = modes.includes(m.key)
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMode(m.key)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border cursor-pointer',
                  'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40',
                  on
                    ? 'bg-[#0F766E] border-[#0F766E] text-white'
                    : 'bg-white border-surface-border text-muted hover:text-ink hover:border-slate-400',
                )}
              >
                <Icon size={13} strokeWidth={2} />
                {m.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted flex items-center gap-1.5">
          <TrendingUp size={12} className="shrink-0" />
          {hint}
        </p>
      </div>

      {/* ── Property cards grid ── */}
      <div>
        <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
          {isLoading ? 'Loading…' : `${comps?.length ?? 0} Properties · ${selected.map(m => m.label).join(' + ')}`}
        </h3>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="shimmer rounded-2xl h-40" />
            ))}
          </div>
        ) : !comps || comps.length === 0 ? (
          <div className="card py-10 text-center space-y-2">
            <AlertCircle size={22} className="mx-auto text-muted" />
            <p className="text-sm text-muted">{emptyReason}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {comps.map((c, idx) => {
              const priceDiff = prop.asking_price != null && c.asking_price != null
                ? prop.asking_price - c.asking_price : null
              const cheaper = priceDiff != null && priceDiff > 0
              return (
                <Link
                  to={`/properties/${c.id}`}
                  key={c.id}
                  aria-label={`Open ${c.full_address}`}
                  className={clsx(
                    'group block bg-white border border-surface-border rounded-2xl overflow-hidden cursor-pointer',
                    'hover:shadow-lg hover:-translate-y-1 hover:border-[#0F766E]/40 transition-all duration-250',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/50',
                  )}
                >
                  {/* Photo */}
                  <div className="relative overflow-hidden bg-surface" style={{ aspectRatio: '16/7' }}>
                    {c.photos && c.photos[0] ? (
                      <img
                        src={c.photos[0]}
                        alt={c.full_address}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                        <Building2 size={24} className="text-slate-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                    {/* Rank badge */}
                    <div className="absolute top-3 left-3 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-xs font-black text-ink shadow">
                      {idx + 1}
                    </div>
                    {/* Price diff badge */}
                    {priceDiff != null && (
                      <div className={clsx(
                        'absolute top-3 right-3 px-2 py-1 rounded-lg text-[10px] font-black shadow backdrop-blur-sm',
                        cheaper ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
                      )}>
                        {cheaper ? `−${fmtCAD(priceDiff)}` : `+${fmtCAD(Math.abs(priceDiff))}`}
                      </div>
                    )}
                    {/* Distance badge */}
                    {c.distance_km != null && (
                      <div className="absolute bottom-2.5 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/90 text-ink shadow backdrop-blur-sm">
                        <MapPin size={10} strokeWidth={2.5} className="text-[#0F766E]" />
                        {c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)} m` : `${c.distance_km.toFixed(1)} km`} away
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-2">
                    <p className="text-sm font-bold text-ink leading-snug line-clamp-2 group-hover:text-[#0F766E] transition-colors">
                      {c.full_address}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span className="capitalize">{c.property_type.replace(/_/g, ' ')}</span>
                      {c.unit_count  && <span>{c.unit_count} units</span>}
                      {c.sqft_total  && <span>{c.sqft_total.toLocaleString()} sqft</span>}
                      {c.year_built  && <span>Built {c.year_built}</span>}
                      {c.mls_number  && <span className="font-mono">MLS# {c.mls_number}</span>}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-surface-border">
                      <p className="text-base font-black font-mono text-ink">{fmtCAD(c.asking_price)}</p>
                      <div className="flex items-center gap-2">
                        {c.cap_rate != null && (
                          <span className={clsx(
                            'text-xs font-bold px-2 py-0.5 rounded-full',
                            c.cap_rate >= 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-muted',
                          )}>
                            {c.cap_rate.toFixed(2)}% cap
                          </span>
                        )}
                        {c.listing_url && (
                          <a
                            href={c.listing_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open original listing in a new tab"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-muted hover:text-[#0F766E] hover:bg-surface transition-colors"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Price History tab ─────────────────────────────────────────────────────────

function PriceHistoryTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  const rawHistory = prop.price_history ?? []

  const history = (() => {
    const events = [...rawHistory]
    const hasListedEvent = events.some(e => e.event === 'listed')
    if (!hasListedEvent && prop.listed_at && prop.asking_price != null) {
      events.unshift({ date: prop.listed_at, price: prop.asking_price, event: 'listed' })
    }
    return events
  })()

  const showChart = history.length >= 2

  const eventMeta: Record<string, { label: string; dot: string; badge: string }> = {
    listed:   { label: 'Listed',        dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 border-blue-200' },
    reduced:  { label: 'Price Reduced', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    relisted: { label: 'Relisted',      dot: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  }

  const totalDrop = history.length >= 2
    ? history[0].price - history[history.length - 1].price
    : null

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Current Price',   value: fmtCAD(prop.asking_price),                       sub: 'asking price' },
            { label: 'Initial Price',   value: fmtCAD(history[0]?.price),                        sub: 'first listed' },
            { label: 'Price Changes',   value: String(history.filter(e => e.event === 'reduced').length), sub: 'reductions' },
            { label: 'Total Drop',      value: totalDrop != null && totalDrop > 0 ? `-${fmtCAD(totalDrop)}` : '—', sub: 'from listing price' },
          ].map(s => (
            <div key={s.label} className="card p-4 space-y-1 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{s.label}</p>
              <p className="text-lg font-black font-mono text-ink leading-tight">{s.value}</p>
              <p className="text-[10px] text-muted">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-6">

        {history.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-surface-border/50 flex items-center justify-center mx-auto">
              <BarChart2 size={24} className="text-muted" />
            </div>
            <p className="text-ink font-semibold">{t('noPriceHistory')}</p>
            <p className="text-xs text-muted">Price changes will appear here as the listing is updated.</p>
          </div>
        ) : (
          <>
            {/* Chart */}
            {showChart && (
              <div>
                <h3 className="text-sm font-bold text-ink mb-4">Price Over Time</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false} tickLine={false}
                        tickFormatter={d => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                        width={58}
                      />
                      <Tooltip
                        contentStyle={{ background: '#FFFFFF', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: 13 }}
                        labelStyle={{ color: '#64748b', fontSize: 11 }}
                        formatter={(v) => [
                          typeof v === 'number'
                            ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
                            : String(v),
                          'Price',
                        ]}
                        labelFormatter={d => new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                      />
                      <Area
                        type="stepAfter"
                        dataKey="price"
                        stroke="#2563EB"
                        strokeWidth={2.5}
                        fill="url(#priceGrad)"
                        dot={{ fill: '#2563EB', strokeWidth: 0, r: 5 }}
                        activeDot={{ fill: '#2563EB', r: 6, strokeWidth: 3, stroke: '#FFFFFF' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-bold text-ink mb-4">Event Timeline</h3>
              <div className="relative pl-6 space-y-5">
                <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-400 via-surface-border to-surface-border rounded-full" />
                {history.map((ev, i) => {
                  const meta = eventMeta[ev.event] ?? { label: ev.event.replace(/_/g, ' '), dot: 'bg-muted', badge: 'bg-surface text-muted border-surface-border' }
                  const prev = history[i - 1]
                  const delta = prev ? ev.price - prev.price : null
                  return (
                    <div key={i} className="relative group">
                      <div className={clsx(
                        'absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-transform duration-200 group-hover:scale-125',
                        meta.dot,
                      )} />
                      <div className="bg-white border border-surface-border rounded-xl p-4 hover:shadow-md hover:border-accent/20 transition-all duration-200 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border', meta.badge)}>
                              {meta.label}
                            </span>
                            <p className="text-xs text-muted">
                              {new Date(ev.date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-black font-mono text-ink">{fmtCAD(ev.price)}</p>
                            {delta != null && delta !== 0 && (
                              <p className={clsx('text-xs font-bold mt-0.5', delta < 0 ? 'text-emerald-600' : 'text-red-500')}>
                                {delta < 0 ? `↓ ${fmtCAD(Math.abs(delta))}` : `↑ ${fmtCAD(delta)}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {prop.listed_at && (
              <p className="text-xs text-muted border-t border-surface-border pt-4">
                {t('originalListing')}: {new Date(prop.listed_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Loading / error states ────────────────────────────────────────────────────

function PropertySkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-surface-border overflow-hidden">
        <div className="h-full bg-accent rounded-full progress-loading" />
      </div>

      {/* Back link skeleton */}
      <div className="shimmer h-4 w-32 rounded-lg" />

      {/* Header card */}
      <div className="card space-y-5 overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="shimmer h-6 w-3/4 rounded-xl" />
            <div className="shimmer h-4 w-1/2 rounded-xl" />
          </div>
          <div className="shimmer w-24 h-12 rounded-2xl shrink-0" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="shimmer h-14 rounded-xl" />)}
        </div>
        <div className="flex gap-2 flex-wrap">
          {[0,1,2,3].map(i => <div key={i} className="shimmer h-9 w-28 rounded-xl" />)}
        </div>
      </div>

      {/* Photo placeholder */}
      <div className="shimmer rounded-2xl" style={{ aspectRatio: '16/7' }} />

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex gap-1 border-b border-surface-border p-1">
          {[0,1,2,3].map(i => <div key={i} className="shimmer h-10 w-28 rounded-lg" />)}
        </div>
        <div className="p-6 space-y-4">
          <div className="shimmer h-32 rounded-xl" />
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => <div key={i} className="shimmer h-20 rounded-xl" />)}
          </div>
          <div className="shimmer h-48 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function NotFound({ t: _t }: { t: (k: string) => string }) {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link to="/properties" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> Back to properties
      </Link>
      <div className="card text-center py-16 space-y-3">
        <AlertCircle className="mx-auto text-muted" size={32} />
        <p className="text-ink font-semibold">Property not found</p>
        <p className="text-sm text-muted">This listing may have been removed or the link is incorrect.</p>
        <Link to="/properties" className="inline-block mt-4 text-sm text-accent hover:underline">
          Browse all properties
        </Link>
      </div>
    </div>
  )
}

