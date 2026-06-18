import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, RefreshCw, MapPin, Calendar,
  Building2, Ruler, AlertCircle, TrendingUp,
  DollarSign, Clock, BarChart2, Bookmark, BookmarkCheck, Sparkles,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import clsx from 'clsx'
import { fetchProperty, type PropertyDetail } from '../api'
import ScoreBadge, { ScoreDot } from '../components/ScoreBadge'
import { useLang } from '../context/LanguageContext'

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
  const [lang, setLang] = useState<'en' | 'fr'>('en')
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
      const res = await fetch(`/api/properties/${id}/analyze`, { method: 'POST' })
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
      <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden shadow-card">
        <nav className="flex overflow-x-auto border-b border-surface-border">
          {TAB_KEYS.map(key => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'px-5 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all duration-150',
                activeTab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink hover:border-surface-border',
              )}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="animate-fade-in">
        {activeTab === 'aiBrief'      && <BriefTab      prop={prop} lang={lang} setLang={setLang} t={t} reanalyze={reanalyze} />}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-4 pb-3 border-b border-surface-border">{title}</h3>
      {children}
    </div>
  )
}

function FinCard({ label, value, valueClass, note, prominent }: {
  label: string; value: string; valueClass?: string; note?: string; prominent?: boolean
}) {
  return (
    <div className="bg-surface border border-surface-border rounded-xl px-3 py-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={clsx(
        'font-mono tabular-nums',
        prominent ? 'text-lg text-ink' : 'text-sm',
        valueClass ?? 'text-ink',
      )}>
        {value}
      </p>
      {note && <p className="text-[10px] text-muted/70 mt-0.5">{note}</p>}
    </div>
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

  // Build reasoning bullets from actual property data
  const bullets: { text: string; positive: boolean | null }[] = []

  if (prop.cap_rate != null) {
    if (prop.cap_rate >= 6)
      bullets.push({ text: `Cap rate ${prop.cap_rate.toFixed(2)}% — above the 6% Quebec strong-buy benchmark`, positive: true })
    else if (prop.cap_rate >= 4.5)
      bullets.push({ text: `Cap rate ${prop.cap_rate.toFixed(2)}% — within the acceptable 4.5–6% Quebec range`, positive: null })
    else
      bullets.push({ text: `Cap rate ${prop.cap_rate.toFixed(2)}% — below the 4.5% Quebec market floor`, positive: false })
  }

  if (prop.discount_pct != null) {
    if (prop.discount_pct >= 10)
      bullets.push({ text: `${prop.discount_pct.toFixed(1)}% below comparable median — significant value discount`, positive: true })
    else if (prop.discount_pct >= 3)
      bullets.push({ text: `${prop.discount_pct.toFixed(1)}% below comparable sales — modest market discount`, positive: true })
    else if (prop.discount_pct >= -2)
      bullets.push({ text: `Priced at market value (${Math.abs(prop.discount_pct).toFixed(1)}% vs comparables)`, positive: null })
    else
      bullets.push({ text: `${Math.abs(prop.discount_pct).toFixed(1)}% above comparable median — premium over market`, positive: false })
  }

  if (prop.monthly_cash_flow != null) {
    const cf = prop.monthly_cash_flow
    if (cf > 500)
      bullets.push({ text: `Strong monthly cash flow: ${fmtCAD(cf)}/mo after mortgage at 20% down`, positive: true })
    else if (cf > 0)
      bullets.push({ text: `Positive cash flow: ${fmtCAD(cf)}/mo — marginal but break-even`, positive: true })
    else if (cf > -300)
      bullets.push({ text: `Slightly negative cash flow: ${fmtCAD(cf)}/mo — manageable with reserves`, positive: null })
    else
      bullets.push({ text: `Negative cash flow: ${fmtCAD(cf)}/mo — requires monthly capital injection`, positive: false })
  }

  if (prop.comparable_count != null) {
    if (prop.comparable_count >= 7)
      bullets.push({ text: `${prop.comparable_count} comparable sales found — high confidence valuation`, positive: true })
    else if (prop.comparable_count >= 3)
      bullets.push({ text: `${prop.comparable_count} comparable sales — moderate confidence`, positive: null })
    else if (prop.comparable_count > 0)
      bullets.push({ text: `Only ${prop.comparable_count} comparable found — limited market data`, positive: false })
    else
      bullets.push({ text: 'No comparable sales found — price cannot be independently verified', positive: false })
  }

  // Recommended investor next steps
  const nextSteps: Record<string, string[]> = {
    strong_opportunity: [
      'Schedule a property inspection within 48 hours',
      'Request rent rolls, leases, and expense statements from seller',
      'Verify the municipal tax bill matches the listing data',
      'Prepare an offer with a 72-hour financing condition',
    ],
    worth_investigating: [
      'Review all listing photos and disclose condition details',
      'Request rent rolls, leases, and 12-month expense history',
      'Compare with 2–3 active listings in the same neighbourhood',
      'Determine renovation potential before committing to a price',
    ],
    market_price: [
      'Negotiate a 3–5% price reduction or seller concessions',
      'Evaluate renovation potential to improve cap rate and returns',
      'Consider the long-term appreciation outlook for this market',
    ],
    not_recommended: [
      'Continue searching for better-priced alternatives in the area',
      'Set a price drop alert — may become interesting if price falls',
      'Calculate what asking price would make this deal viable',
    ],
  }

  const steps = nextSteps[category] ?? []

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

      {/* Reasoning bullets */}
      {bullets.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2.5">Why this score</p>
          <div className="space-y-2">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={clsx(
                  'mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                  b.positive === true  ? 'bg-emerald-100 text-emerald-700' :
                  b.positive === false ? 'bg-red-100 text-red-600' :
                                        'bg-gray-100 text-gray-500',
                )}>
                  {b.positive === true ? '✓' : b.positive === false ? '✗' : '~'}
                </span>
                <span className="text-sm text-ink leading-snug">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps */}
      {steps.length > 0 && (
        <div className="pt-4 border-t border-black/5">
          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2.5">Recommended next steps</p>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
                <span className={clsx(
                  'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 border',
                  c.badgeBg, c.badgeText, c.badgeBorder,
                )}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ── AI Brief tab ──────────────────────────────────────────────────────────────

function BriefTab({ prop, lang, setLang, t, reanalyze }: {
  prop: PropertyDetail
  lang: 'en' | 'fr'
  setLang: (l: 'en' | 'fr') => void
  t: (k: string) => string
  reanalyze: { mutate: () => void; isPending: boolean; isSuccess: boolean; isError: boolean; error: Error | null }
}) {
  const brief = lang === 'fr' ? prop.ai_brief_fr : prop.ai_brief_en
  const hasBrief = !!(prop.ai_brief_en || prop.ai_brief_fr)

  const metrics = [
    {
      label: 'Below market',
      pct: prop.discount_pct != null ? Math.min(100, Math.max(0, prop.discount_pct * 5)) : null,
      value: prop.discount_pct != null
        ? `${prop.discount_pct > 0 ? '-' : '+'}${Math.abs(prop.discount_pct).toFixed(1)}%`
        : '—',
      color: prop.discount_pct != null && prop.discount_pct > 5 ? '#059669' : '#64748B',
    },
    {
      label: 'Yearly return',
      pct: prop.cap_rate != null ? Math.min(100, (prop.cap_rate / 8) * 100) : null,
      value: prop.cap_rate != null ? `${prop.cap_rate.toFixed(2)}%` : '—',
      color: prop.cap_rate != null && prop.cap_rate >= 5 ? '#059669' :
             prop.cap_rate != null && prop.cap_rate >= 3 ? '#D97706' : '#DC2626',
    },
    {
      label: 'Monthly profit',
      pct: prop.monthly_cash_flow != null
        ? Math.min(100, Math.max(0, ((prop.monthly_cash_flow + 3000) / 5000) * 100))
        : null,
      value: prop.monthly_cash_flow != null
        ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(prop.monthly_cash_flow) + '/mo'
        : '—',
      color: prop.monthly_cash_flow != null && prop.monthly_cash_flow >= 0 ? '#059669' : '#DC2626',
    },
    {
      label: 'Comparable sales',
      pct: prop.comparable_count != null ? Math.min(100, (prop.comparable_count / 10) * 100) : null,
      value: prop.comparable_count != null ? `${prop.comparable_count} found` : '—',
      color: prop.comparable_count != null && prop.comparable_count >= 7 ? '#059669' : '#D97706',
    },
  ]

  return (
    <div className="space-y-4 animate-slide-up">
      <VerdictBanner prop={prop} />

      {!hasBrief ? (
        <div className="card py-10 text-center space-y-4">
          {reanalyze.isPending ? (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto" />
              <p className="text-ink text-sm font-semibold">Generating AI analysis…</p>
              <p className="text-xs text-muted">This takes about 10–30 seconds</p>
            </>
          ) : (
            <>
              <Sparkles className="mx-auto text-accent" size={32} />
              <div>
                <p className="text-ink text-sm font-semibold">AI analysis not yet generated</p>
                <p className="text-xs text-muted mt-1">Get a plain-English investment brief for this property</p>
              </div>
              {reanalyze.isError && (
                <p className="text-xs text-score-notrecommended bg-red-50 border border-red-200 rounded-xl px-3 py-2 max-w-xs mx-auto">
                  {reanalyze.error?.message ?? 'Analysis failed. Please try again.'}
                </p>
              )}
              <button
                onClick={() => reanalyze.mutate()}
                className="btn-primary mx-auto"
              >
                <Sparkles size={13} />
                Generate AI Analysis
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Brief text */}
          <div className="lg:col-span-2 card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <TrendingUp size={14} />
                <span>AI Analysis</span>
                {prop.analysis_confidence && (
                  <ConfidencePill confidence={prop.analysis_confidence} t={t} />
                )}
              </div>
              <div className="flex items-center gap-0.5 p-0.5 bg-surface rounded-xl border border-surface-border">
                {(['en', 'fr'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                      lang === l ? 'bg-white text-ink shadow' : 'text-muted hover:text-ink',
                    )}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {brief ? (
              <p className="text-ink leading-relaxed text-sm whitespace-pre-line">{brief}</p>
            ) : (
              <p className="text-muted text-sm italic">
                {lang === 'fr' ? 'Analyse française non disponible.' : 'English analysis not available.'}
              </p>
            )}

            {prop.last_analyzed_at && (
              <p className="text-xs text-muted pt-2 border-t border-surface-border">
                Last analyzed: {new Date(prop.last_analyzed_at).toLocaleString('en-CA')}
              </p>
            )}
          </div>

          {/* Deal scorecard */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted uppercase tracking-widest">Deal scorecard</h3>
              <div className="flex items-center gap-1.5">
                <ScoreDot category={prop.score_category} />
                <span className="text-sm font-bold text-ink font-mono">{prop.score ?? '—'}</span>
              </div>
            </div>

            <div className="space-y-3">
              {metrics.map(m => (
                <div key={m.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted">{m.label}</span>
                    <span className="font-mono font-semibold text-ink tabular-nums">{m.value}</span>
                  </div>
                  <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                    {m.pct != null && (
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${m.pct}%`, backgroundColor: m.color }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {prop.comparable_count != null && (
              <p className="text-[10px] text-muted pt-1 border-t border-surface-border">
                Based on {prop.comparable_count} comparable sales
                {prop.analysis_confidence && ` · ${prop.analysis_confidence} confidence`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Financials tab ────────────────────────────────────────────────────────────

function FinancialsTab({ prop, t, pricePerSqft }: { prop: PropertyDetail; t: (k: string) => string; pricePerSqft: number | null }) {
  return (
    <div className="space-y-4 animate-slide-up">
      <Section title="Property value vs market">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <FinCard label={t('askingPrice')}   value={fmtCAD(prop.asking_price)} prominent />
          <FinCard label={t('marketValue')}   value={fmtCAD(prop.comparable_median_price)}
            note="from comparable sales"
          />
          <FinCard label={t('valueGap')}
            value={fmtCAD(prop.value_gap)}
            valueClass={prop.value_gap != null && prop.value_gap > 0 ? 'text-score-strong' :
                        prop.value_gap != null && prop.value_gap < 0 ? 'text-score-notrecommended' : undefined}
          />
          <FinCard label={t('discount')}
            value={prop.discount_pct != null
              ? `${prop.discount_pct > 0 ? '-' : '+'}${Math.abs(prop.discount_pct).toFixed(1)}%`
              : '—'}
            valueClass={prop.discount_pct != null && prop.discount_pct > 5 ? 'text-score-strong' :
                        prop.discount_pct != null && prop.discount_pct < 0 ? 'text-score-notrecommended' : undefined}
          />
          <FinCard label={t('pricePerSqft')}  value={pricePerSqft != null ? fmtCAD(pricePerSqft) : '—'} note="per sqft" />
          <FinCard label={t('compsFound')}     value={prop.comparable_count != null ? `${prop.comparable_count}` : '—'} />
        </div>
      </Section>

      <Section title="Investment returns (what you earn)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <FinCard label={t('capRate')}
            value={fmtPct(prop.cap_rate)}
            valueClass={prop.cap_rate != null && prop.cap_rate >= 5 ? 'text-score-strong' : undefined}
          />
          <FinCard label={t('cashFlow')}
            value={prop.monthly_cash_flow != null ? `${fmtCAD(prop.monthly_cash_flow)}/mo` : '—'}
            note="at 20% down"
            valueClass={prop.monthly_cash_flow != null && prop.monthly_cash_flow >= 0 ? 'text-score-strong' : 'text-score-notrecommended'}
            prominent
          />
          <FinCard label={t('cashOnCash')} value={fmtPct(prop.cash_on_cash_return)} />
          <FinCard label={t('noi')}         value={fmtCAD(prop.noi_annual)} note="annual" />
          <FinCard label={t('grm')}         value={prop.grm != null ? `${prop.grm.toFixed(1)}x` : '—'} />
          <FinCard label={t('rentalIncome')} value={fmtCAD(prop.rental_income_monthly)} note="/month" />
        </div>
      </Section>

      <Section title="What it costs to buy">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <FinCard label={t('downPayment')}      value={fmtCAD(prop.down_payment_20pct)} />
          <FinCard label={t('welcomeTax')}        value={fmtCAD(prop.welcome_tax)} note="droits de mutation" />
          <FinCard label={t('monthlyMortgage')}   value={fmtCAD(prop.monthly_mortgage)} note="4.5%, 25yr amort." />
          <FinCard label={t('municipalTax')}      value={fmtCAD(prop.municipal_taxes_annual)} note="annual" />
          <FinCard label={t('schoolTax')}         value={fmtCAD(prop.school_taxes_annual)} note="annual" />
          {prop.condo_fees_monthly != null && (
            <FinCard label={t('condoFees')} value={`${fmtCAD(prop.condo_fees_monthly)}/mo`} />
          )}
        </div>
      </Section>
    </div>
  )
}

// ── Comparables tab ───────────────────────────────────────────────────────────

function ComparablesTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  if (!prop.comparable_count) {
    return (
      <div className="card py-10 text-center space-y-2 animate-slide-up">
        <AlertCircle className="mx-auto text-muted" size={28} />
        <p className="text-muted text-sm">{t('noComparables')}</p>
      </div>
    )
  }

  return (
    <div className="card space-y-5 animate-slide-up">
      <div className="flex items-center gap-3 flex-wrap">
        <TrendingUp size={16} className="text-muted" />
        <h3 className="font-bold text-ink">Comparable Sales Analysis</h3>
        {prop.analysis_confidence && (
          <ConfidencePill confidence={prop.analysis_confidence} t={t} />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted mb-0.5">Comparable sales found</p>
          <p className="text-2xl font-bold text-ink font-mono">{prop.comparable_count}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">Median sale price</p>
          <p className="text-xl font-bold text-ink font-mono">{fmtCAD(prop.comparable_median_price)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">Average sale price</p>
          <p className="text-base font-semibold text-ink font-mono">{fmtCAD(prop.comparable_mean_price)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">You save vs market</p>
          <p className={clsx(
            'text-base font-semibold font-mono',
            prop.value_gap != null && prop.value_gap > 0 ? 'text-score-strong' : 'text-score-notrecommended',
          )}>
            {prop.value_gap != null
              ? `${prop.value_gap > 0 ? '-' : '+'}${fmtCAD(Math.abs(prop.value_gap))} (${Math.abs(prop.discount_pct ?? 0).toFixed(1)}%)`
              : '—'}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted border-t border-surface-border pt-3">
        Comparable search finds nearby similar properties within 2–25km radius, matched by size, year built, number of units, and price range.
      </p>
    </div>
  )
}

// ── Price History tab ─────────────────────────────────────────────────────────

function PriceHistoryTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  const rawHistory = prop.price_history ?? []

  // Inject listing event if not already in history
  const history = (() => {
    const events = [...rawHistory]
    const hasListedEvent = events.some(e => e.event === 'listed')
    if (!hasListedEvent && prop.listed_at && prop.asking_price != null) {
      events.unshift({ date: prop.listed_at, price: prop.asking_price, event: 'listed' })
    }
    return events
  })()

  const showChart = history.length >= 2

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="card">
        <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-4">
          {t('priceHistory')}
        </h3>

        {history.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">{t('noPriceHistory')}</p>
        ) : (
          <>
            {showChart && <div className="h-56 mb-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8E0EC" />
                  <XAxis
                    dataKey="date"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    tickFormatter={d => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ background: '#FFFFFF', border: '1px solid #D8E0EC', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    labelStyle={{ color: '#6B7280', fontSize: 11 }}
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
                    strokeWidth={2}
                    fill="url(#priceGrad)"
                    dot={{ fill: '#2563EB', strokeWidth: 0, r: 4 }}
                    activeDot={{ fill: '#2563EB', r: 5, strokeWidth: 2, stroke: '#FFFFFF' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>}

            <div className="relative pl-5 space-y-4">
              <div className="absolute left-0 top-2 bottom-2 w-px bg-surface-border" />
              {history.map((ev, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full border-2 border-accent bg-white" />
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-bold text-ink tabular-nums text-sm">
                      {fmtCAD(ev.price)}
                    </span>
                    <span className={clsx(
                      'text-xs px-1.5 py-0.5 rounded-lg font-medium',
                      ev.event === 'reduced'  ? 'bg-emerald-100 text-emerald-700' :
                      ev.event === 'listed'   ? 'bg-blue-100 text-blue-700' :
                      ev.event === 'relisted' ? 'bg-purple-100 text-purple-700' :
                                                'bg-surface-hover text-muted',
                    )}>
                      {ev.event === 'listed'   ? 'Listed' :
                       ev.event === 'reduced'  ? 'Price Reduced' :
                       ev.event === 'relisted' ? 'Relisted' :
                       ev.event.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted/70 mt-0.5">
                    {new Date(ev.date).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {prop.listed_at && (
          <p className="text-xs text-muted/60 pt-3 border-t border-surface-border mt-4">
            {t('originalListing')}: {new Date(prop.listed_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Loading / error states ────────────────────────────────────────────────────

function PropertySkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5 animate-pulse">
      <div className="h-4 w-36 bg-surface-border rounded" />
      <div className="card space-y-4">
        <div className="h-6 w-64 bg-surface-border rounded" />
        <div className="h-4 w-48 bg-surface-border rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-12 bg-surface-border rounded" />)}
        </div>
      </div>
      <div className="h-10 bg-surface-border rounded" />
      <div className="card h-64" />
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

