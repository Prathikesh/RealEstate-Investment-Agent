import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, RefreshCw, MapPin, Calendar,
  Building2, Ruler, AlertCircle, TrendingUp,
  DollarSign, Clock, BarChart2, Bookmark, BookmarkCheck, Sparkles,
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

function useSaved(id: string | undefined) {
  const key = 'qre_saved_ids'
  const [saved, setSaved] = useState<boolean>(() => {
    if (!id) return false
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
      return s.includes(id)
    } catch { return false }
  })

  const toggle = () => {
    if (!id) return
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
      const next = saved ? s.filter(x => x !== id) : [...s, id]
      localStorage.setItem(key, JSON.stringify(next))
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
  const { saved, toggle: toggleSaved } = useSaved(id)

  const { data: prop, isLoading, error } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetchProperty(id!),
    enabled: !!id,
  })

  const reanalyze = useMutation({
    mutationFn: async () => {
      await fetch(`/api/properties/${id}/analyze`, { method: 'POST' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] })
    },
  })

  // Auto-trigger analysis when no brief exists
  useEffect(() => {
    if (prop && !prop.ai_brief_en && !prop.ai_brief_fr && !reanalyze.isPending && !reanalyze.isSuccess) {
      reanalyze.mutate()
    }
  }, [prop?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PropertySkeleton />
  if (error || !prop) return <NotFound t={t} />

  const pricePerSqft = derivedPricePerSqft(prop)

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5 animate-slide-up">

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
            <SpecChip icon={<DollarSign size={12} />} label={`${fmtCAD(pricePerSqft)}/${t('sqft')}`} />
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
            {reanalyze.isPending ? 'Analyzing…' : reanalyze.isSuccess ? t('queued') : t('reanalyze')}
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

      {/* Photo */}
      {prop.photos && prop.photos.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-surface-border aspect-video bg-surface-card shadow-card">
          <img
            src={prop.photos[0]}
            alt={prop.full_address}
            className="w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            referrerPolicy="no-referrer"
          />
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
        'font-mono font-bold tabular-nums',
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
        'font-mono font-bold tabular-nums',
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

function VerdictBanner({ category, score }: { category: string | null; score: number | null }) {
  if (!category || score == null) return null

  const config: Record<string, { label: string; sub: string; bg: string; text: string; border: string; accent: string }> = {
    strong_opportunity: {
      label: 'BUY IT',
      sub: 'Strong investment opportunity — worth moving fast on this one.',
      bg: 'bg-score-strong/10', text: 'text-score-strong', border: 'border-score-strong/30', accent: '#059669',
    },
    worth_investigating: {
      label: 'WORTH CHECKING',
      sub: 'Good potential — do your due diligence before making an offer.',
      bg: 'bg-score-worth/10', text: 'text-score-worth', border: 'border-score-worth/30', accent: '#2563EB',
    },
    market_price: {
      label: 'FAIR PRICE',
      sub: 'Priced at market value — no significant discount but not overpriced.',
      bg: 'bg-score-market/10', text: 'text-score-market', border: 'border-score-market/30', accent: '#D97706',
    },
    not_recommended: {
      label: 'SKIP IT',
      sub: 'Not a good deal at this price — look for better options.',
      bg: 'bg-score-notrecommended/10', text: 'text-score-notrecommended', border: 'border-score-notrecommended/30', accent: '#DC2626',
    },
  }

  const c = config[category]
  if (!c) return null

  return (
    <div className={clsx('rounded-2xl border p-5 flex items-center gap-5', c.bg, c.border)}>
      <div
        className="w-2 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: c.accent }}
      />
      <div className="flex-1 min-w-0">
        <p className={clsx('text-2xl font-black tracking-tight font-mono', c.text)}>{c.label}</p>
        <p className={clsx('text-sm font-medium mt-0.5', c.text + '/80')}>{c.sub}</p>
        <p className="text-xs text-muted mt-1">AI Score: <span className="font-bold font-mono">{score}/100</span></p>
      </div>
    </div>
  )
}

// ── AI Brief tab ──────────────────────────────────────────────────────────────

function BriefTab({ prop, lang, setLang, t, reanalyze }: {
  prop: PropertyDetail
  lang: 'en' | 'fr'
  setLang: (l: 'en' | 'fr') => void
  t: (k: string) => string
  reanalyze: { mutate: () => void; isPending: boolean; isSuccess: boolean }
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
      <VerdictBanner category={prop.score_category} score={prop.score} />

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
                <p className="text-xs text-muted mt-1">Get a plain-English summary of this deal</p>
              </div>
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
  const history = prop.price_history ?? []

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
            <div className="h-56 mb-5">
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
            </div>

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
                      'text-xs px-1.5 py-0.5 rounded-lg',
                      ev.event === 'reduced' ? 'bg-score-strong/15 text-score-strong' : 'bg-surface-hover text-muted',
                    )}>
                      {ev.event}
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

