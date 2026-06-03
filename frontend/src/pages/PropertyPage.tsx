import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ExternalLink, RefreshCw, MapPin, Calendar,
  Building2, Ruler, AlertCircle, CheckCircle2, TrendingUp, DollarSign, Clock,
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

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['aiBrief', 'financials', 'comparables', 'priceHistory', 'sources'] as const
type TabKey = typeof TAB_KEYS[number]

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState<TabKey>('aiBrief')
  const [lang, setLang] = useState<'en' | 'fr'>('en') // brief language, independent of UI lang
  const queryClient = useQueryClient()

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

  if (isLoading) return <PropertySkeleton />
  if (error || !prop) return <NotFound t={t} />

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">

      {/* Back */}
      <Link
        to="/properties"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={14} />
        {t('backToProperties')}
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-white">{prop.full_address}</h1>
              <span className={clsx(
                'px-2 py-0.5 rounded text-xs font-semibold',
                prop.status === 'active'        ? 'bg-score-strong/15 text-score-strong' :
                prop.status === 'price_changed' ? 'bg-score-worth/15 text-score-worth'   :
                                                   'bg-surface-hover text-muted',
              )}>
                {statusLabel(prop.status, t)}
              </span>
              {prop.is_new && (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent text-white">
                  {t('newBadge')}
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
                  {prop.days_on_market} {t('daysOnMarket')}
                </span>
              )}
              {prop.mls_number && (
                <span className="text-surface-border font-mono text-xs">
                  {t('mlsNumber')} {prop.mls_number}
                </span>
              )}
            </div>
          </div>

          <ScoreBadge score={prop.score} category={prop.score_category} size="lg" />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <KeyMetric label={t('askingPrice')}   value={fmtCAD(prop.asking_price)} prominent />
          <KeyMetric
            label={t('discount')}
            value={prop.discount_pct != null
              ? `${prop.discount_pct > 0 ? '-' : '+'}${Math.abs(prop.discount_pct).toFixed(1)}%`
              : '—'}
            valueClass={
              prop.discount_pct != null && prop.discount_pct > 5 ? 'text-score-strong' :
              prop.discount_pct != null && prop.discount_pct < 0 ? 'text-score-notrecommended' : undefined
            }
          />
          <KeyMetric
            label={t('capRate')}
            value={fmtPct(prop.cap_rate)}
            valueClass={prop.cap_rate != null && prop.cap_rate >= 5 ? 'text-score-strong' : undefined}
          />
          <KeyMetric
            label={t('cashFlow')}
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
          {prop.price_per_sqft && (
            <SpecChip icon={<DollarSign size={12} />} label={`${fmtCAD(prop.price_per_sqft)}/${t('sqft')}`} />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {prop.listing_url && (
            <a
              href={prop.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ExternalLink size={13} />
              {t('viewOnSource')} {prop.primary_source ?? 'listing'}
            </a>
          )}
          <button
            onClick={() => reanalyze.mutate()}
            disabled={reanalyze.isPending || reanalyze.isSuccess}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-surface-border text-muted hover:text-slate-200 hover:bg-surface-hover text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={reanalyze.isPending ? 'animate-spin' : ''} />
            {reanalyze.isSuccess ? t('queued') : t('reanalyze')}
          </button>
        </div>
      </div>

      {/* Photo */}
      {prop.photos && prop.photos.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-surface-border aspect-video bg-surface-card">
          <img
            src={prop.photos[0]}
            alt={prop.full_address}
            className="w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-surface-border">
        <nav className="flex -mb-px">
          {TAB_KEYS.map(key => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                activeTab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-slate-300 hover:border-surface-border',
              )}
            >
              {t(key)}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {activeTab === 'aiBrief'      && <BriefTab      prop={prop} lang={lang} setLang={setLang} t={t} />}
      {activeTab === 'financials'   && <FinancialsTab prop={prop} t={t} />}
      {activeTab === 'comparables'  && <ComparablesTab prop={prop} t={t} />}
      {activeTab === 'priceHistory' && <PriceHistoryTab prop={prop} t={t} />}
      {activeTab === 'sources'      && <SourcesTab prop={prop} t={t} />}
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
        'font-mono font-semibold tabular-nums',
        prominent ? 'text-xl text-white' : 'text-base',
        valueClass ?? 'text-slate-300',
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
      <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  )
}

function FinCard({ label, value, valueClass, note, prominent }: {
  label: string; value: string; valueClass?: string; note?: string; prominent?: boolean
}) {
  return (
    <div className="bg-surface rounded-lg px-3 py-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={clsx(
        'font-mono font-semibold tabular-nums',
        prominent ? 'text-lg text-white' : 'text-sm',
        valueClass ?? 'text-slate-300',
      )}>
        {value}
      </p>
      {note && <p className="text-[10px] text-muted/70 mt-0.5">{note}</p>}
    </div>
  )
}

// ── AI Brief tab ──────────────────────────────────────────────────────────────

function BriefTab({ prop, lang, setLang, t }: {
  prop: PropertyDetail
  lang: 'en' | 'fr'
  setLang: (l: 'en' | 'fr') => void
  t: (k: string) => string
}) {
  const brief = lang === 'fr' ? prop.ai_brief_fr : prop.ai_brief_en
  const hasBrief = !!(prop.ai_brief_en || prop.ai_brief_fr)

  if (!hasBrief) {
    return (
      <div className="card py-10 text-center space-y-2">
        <AlertCircle className="mx-auto text-muted" size={28} />
        <p className="text-slate-400 text-sm">
          {prop.score != null && prop.score < 40 ? t('noAiBriefLow') : t('noAiBrief')}
        </p>
        <p className="text-xs text-muted">{t('runPipeline')}</p>
      </div>
    )
  }

  // Deal profile metrics
  const metrics = [
    {
      label: t('discount'),
      pct: prop.discount_pct != null ? Math.min(100, Math.max(0, prop.discount_pct * 5)) : null,
      value: fmtPct(prop.discount_pct),
      color: prop.discount_pct != null && prop.discount_pct > 5 ? '#00D68F' : '#8B8D97',
    },
    {
      label: t('capRate'),
      pct: prop.cap_rate != null ? Math.min(100, (prop.cap_rate / 8) * 100) : null,
      value: fmtPct(prop.cap_rate),
      color: prop.cap_rate != null && prop.cap_rate >= 5 ? '#00D68F' :
             prop.cap_rate != null && prop.cap_rate >= 3 ? '#FFB800' : '#FF4757',
    },
    {
      label: t('cashFlow'),
      pct: prop.monthly_cash_flow != null
        ? Math.min(100, Math.max(0, ((prop.monthly_cash_flow + 3000) / 5000) * 100))
        : null,
      value: prop.monthly_cash_flow != null ? `${fmtCAD(prop.monthly_cash_flow)}/mo` : '—',
      color: prop.monthly_cash_flow != null && prop.monthly_cash_flow >= 0 ? '#00D68F' : '#FF4757',
    },
    {
      label: t('compsFound'),
      pct: prop.comparable_count != null ? Math.min(100, (prop.comparable_count / 10) * 100) : null,
      value: prop.comparable_count != null ? `${prop.comparable_count} comps` : '—',
      color: prop.comparable_count != null && prop.comparable_count >= 7 ? '#00D68F' : '#FFB800',
    },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Brief text — 2/3 width */}
      <div className="lg:col-span-2 card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-muted flex-wrap">
            <TrendingUp size={14} />
            <span>{t('aiAnalysis')}</span>
            {prop.analysis_confidence && (
              <ConfidencePill confidence={prop.analysis_confidence} t={t} />
            )}
          </div>
          {/* EN/FR toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-surface rounded-lg">
            {(['en', 'fr'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                  lang === l ? 'bg-surface-card text-slate-200 shadow' : 'text-muted hover:text-slate-300',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {brief ? (
          <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-line">{brief}</p>
        ) : (
          <p className="text-muted text-sm italic">
            {lang === 'fr' ? 'Analyse française non disponible.' : 'English brief not available.'}
          </p>
        )}

        {prop.last_analyzed_at && (
          <p className="text-xs text-surface-border pt-2 border-t border-surface-border">
            {t('lastAnalyzed')}: {new Date(prop.last_analyzed_at).toLocaleString('en-CA')}
          </p>
        )}
      </div>

      {/* Deal profile — 1/3 width */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t('dealProfile')}</h3>
          <div className="flex items-center gap-1.5">
            <ScoreDot category={prop.score_category} />
            <span className="text-sm font-bold text-white font-mono">{prop.score ?? '—'}</span>
          </div>
        </div>

        <div className="space-y-3">
          {metrics.map(m => (
            <div key={m.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted">{m.label}</span>
                <span className="font-mono text-slate-300 tabular-nums">{m.value}</span>
              </div>
              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                {m.pct != null && (
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${m.pct}%`, backgroundColor: m.color }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {prop.comparable_count != null && (
          <p className="text-[10px] text-muted/60 pt-1 border-t border-surface-border">
            {prop.comparable_count} {t('analyzedUsing')}
            {prop.analysis_confidence && ` · ${prop.analysis_confidence} ${t('confidencePill')}`}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Financials tab ────────────────────────────────────────────────────────────

function FinancialsTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  return (
    <div className="space-y-4">
      <Section title="Valuation">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <FinCard label={t('askingPrice')}    value={fmtCAD(prop.asking_price)} prominent />
          <FinCard label={t('marketValue')}    value={fmtCAD(prop.comparable_median_price)}
            note="median comps"
          />
          <FinCard label={t('valueGap')}       value={fmtCAD(prop.value_gap)}
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
          <FinCard label={t('pricePerSqft')}  value={fmtCAD(prop.price_per_sqft)} />
          <FinCard label={t('compsFound')}     value={prop.comparable_count != null ? `${prop.comparable_count}` : '—'} />
        </div>
      </Section>

      <Section title="Returns">
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

      <Section title="Acquisition Costs">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <FinCard label={t('downPayment')}      value={fmtCAD(prop.down_payment_20pct)} />
          <FinCard label={t('welcomeTax')}        value={fmtCAD(prop.welcome_tax)} note="droits de mutation" />
          <FinCard label={t('monthlyMortgage')}   value={fmtCAD(prop.monthly_mortgage)} note="5.2%, 25yr" />
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
      <div className="card py-10 text-center space-y-2">
        <AlertCircle className="mx-auto text-muted" size={28} />
        <p className="text-slate-400 text-sm">{t('noComparables')}</p>
      </div>
    )
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <TrendingUp size={16} className="text-muted" />
        <h3 className="font-semibold text-slate-200">Comparable Analysis</h3>
        {prop.analysis_confidence && (
          <ConfidencePill confidence={prop.analysis_confidence} t={t} />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted mb-0.5">{t('compsFound')}</p>
          <p className="text-2xl font-bold text-white font-mono">{prop.comparable_count}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">{t('medianPrice')}</p>
          <p className="text-xl font-bold text-white font-mono">{fmtCAD(prop.comparable_median_price)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">{t('meanPrice')}</p>
          <p className="text-base font-semibold text-slate-300 font-mono">{fmtCAD(prop.comparable_mean_price)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">{t('valueGap')}</p>
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

      <p className="text-xs text-muted/60 border-t border-surface-border pt-3">
        Comparable search uses PostGIS radius expansion (2km → 5km → 10km → 25km) with similarity weighting by sqft, year built, unit count, and price range (±40%).
      </p>
    </div>
  )
}

// ── Price History tab ─────────────────────────────────────────────────────────

function PriceHistoryTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  const history = prop.price_history ?? []

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-4">
          {t('priceHistory')}
        </h3>

        {history.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">{t('noPriceHistory')}</p>
        ) : (
          <>
            {/* Recharts area chart */}
            <div className="h-56 mb-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6C5CE7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3A" />
                  <XAxis
                    dataKey="date"
                    stroke="#8B8D97"
                    tick={{ fontSize: 11 }}
                    tickFormatter={d => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    stroke="#8B8D97"
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1A1D27', border: '1px solid #2A2D3A', borderRadius: 8 }}
                    labelStyle={{ color: '#8B8D97', fontSize: 11 }}
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
                    stroke="#6C5CE7"
                    strokeWidth={2}
                    fill="url(#priceGrad)"
                    dot={{ fill: '#6C5CE7', strokeWidth: 0, r: 4 }}
                    activeDot={{ fill: '#6C5CE7', r: 5, strokeWidth: 2, stroke: '#0F1117' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Timeline */}
            <div className="relative pl-5 space-y-4">
              <div className="absolute left-0 top-2 bottom-2 w-px bg-surface-border" />
              {history.map((ev, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full border-2 border-accent bg-surface" />
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-semibold text-slate-200 tabular-nums text-sm">
                      {fmtCAD(ev.price)}
                    </span>
                    <span className={clsx(
                      'text-xs px-1.5 py-0.5 rounded',
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

// ── Sources tab ───────────────────────────────────────────────────────────────

function SourcesTab({ prop, t }: { prop: PropertyDetail; t: (k: string) => string }) {
  const sources = prop.active_sources ?? []

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-muted" />
        <h3 className="font-semibold text-slate-200">{t('sources')}</h3>
      </div>

      {sources.length === 0 ? (
        <p className="text-muted text-sm">{t('noSources')}</p>
      ) : (
        <div className="divide-y divide-surface-border">
          {sources.map(src => (
            <div key={src} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-score-strong shrink-0" />
                <span className="text-sm text-slate-300 font-medium capitalize">{src}</span>
                <span className="text-xs text-muted">{t('active')}</span>
              </div>
              {src === prop.primary_source && prop.listing_url && (
                <a
                  href={prop.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  {t('viewOnSource')} <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {prop.mls_number && (
        <p className="text-xs text-muted/70 pt-2 border-t border-surface-border">
          {t('mlsNumber')} <span className="font-mono text-muted">{prop.mls_number}</span>
        </p>
      )}

      <div className="text-xs text-muted/60 space-y-0.5 pt-2 border-t border-surface-border">
        <p>{t('firstSeen')}: {new Date(prop.first_seen_at).toLocaleString('en-CA')}</p>
        <p>{t('lastChecked')}: {new Date(prop.last_seen_at).toLocaleString('en-CA')}</p>
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

function NotFound({ t }: { t: (k: string) => string }) {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link to="/properties" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-slate-200 mb-6">
        <ArrowLeft size={14} /> Back
      </Link>
      <div className="card text-center py-16 space-y-3">
        <AlertCircle className="mx-auto text-muted" size={32} />
        <p className="text-slate-300 font-semibold">{t('notFound')}</p>
        <p className="text-sm text-muted">{t('notFoundHint')}</p>
        <Link to="/properties" className="inline-block mt-4 text-sm text-accent hover:underline">
          {t('browseAll')}
        </Link>
      </div>
    </div>
  )
}
