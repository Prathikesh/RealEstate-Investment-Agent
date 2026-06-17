import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, AlertCircle, TrendingUp, Wrench, MapPin,
  Brain, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import clsx from 'clsx'
import { fetchFullAnalysis, type FullAnalysisResponse, type RiskItem } from '../api'
import ScoreBadge from '../components/ScoreBadge'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCAD(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD',
    maximumFractionDigits: dec, minimumFractionDigits: dec,
  }).format(v)
}

function fmtPct(v: number | null | undefined, dec = 2, showSign = false): string {
  if (v == null) return '—'
  const sign = showSign && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(dec)}%`
}

function fmtK(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return fmtCAD(v)
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-muted">{icon}</span>
        <h2 className="text-xs font-bold text-muted uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function KeyMetric({ label, value, valueClass, note }: {
  label: string; value: string; valueClass?: string; note?: string
}) {
  return (
    <div className="bg-surface rounded-lg px-3 py-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={clsx('font-mono font-semibold tabular-nums text-base', valueClass ?? 'text-ink')}>
        {value}
      </p>
      {note && <p className="text-[10px] text-muted/70 mt-0.5">{note}</p>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['full-analysis', id],
    queryFn: () => fetchFullAnalysis(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <AnalysisSkeleton />
  if (error || !data) return <AnalysisError id={id} />

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">

      {/* Back */}
      <Link
        to={`/properties/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} />
        Back to property
      </Link>

      {/* Header */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-ink">{data.full_address}</h1>
            <p className="text-xs text-muted mt-1">
              Computed {new Date(data.computed_at).toLocaleString('en-CA')} · Results are not cached
            </p>
          </div>
          <ScoreBadge score={data.score.total} category={data.score.category} size="lg" />
        </div>

        {/* Financial summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KeyMetric
            label="Asking Price"
            value={fmtCAD(data.financial.asking_price)}
            valueClass="text-ink text-lg font-bold"
          />
          <KeyMetric
            label="Cap Rate"
            value={fmtPct(data.financial.cap_rate)}
            valueClass={data.financial.cap_rate != null && data.financial.cap_rate >= 5 ? 'text-score-strong' : 'text-ink'}
          />
          <KeyMetric
            label="Monthly Cash Flow"
            value={data.financial.monthly_cash_flow != null ? `${fmtCAD(data.financial.monthly_cash_flow)}/mo` : '—'}
            valueClass={data.financial.monthly_cash_flow != null && data.financial.monthly_cash_flow >= 0 ? 'text-score-strong' : 'text-score-notrecommended'}
            note="at 20% down, 4.5% rate"
          />
          <KeyMetric
            label="Discount vs Market"
            value={data.financial.discount_pct != null
              ? `${data.financial.discount_pct > 0 ? '-' : '+'}${Math.abs(data.financial.discount_pct).toFixed(1)}%`
              : '—'}
            valueClass={data.financial.discount_pct != null && data.financial.discount_pct > 5 ? 'text-score-strong' :
                        data.financial.discount_pct != null && data.financial.discount_pct < 0 ? 'text-score-notrecommended' : 'text-ink'}
          />
        </div>
      </div>

      {/* Risk Assessment */}
      <RiskSection risk={data.risk} />

      {/* 5-Year Projection */}
      <ProjectionSection projection={data.projection} financial={data.financial} />

      {/* Renovation ROI */}
      <RenovationSection renovation={data.renovation} financial={data.financial} />

      {/* Neighbourhood Context */}
      <NeighbourhoodSection neighbourhood={data.neighbourhood} />

      {/* AI Brief */}
      <AiBriefSection brief={data.ai_brief} strategy={data.score.strategy} />

      {/* Data Sources */}
      <DataSourcesSection sources={data.sources} financial={data.financial} />
    </div>
  )
}

// ── Risk Assessment ───────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  low:      { bg: 'bg-score-strong/10',          text: 'text-score-strong',        border: 'border-score-strong/25',        dot: 'bg-score-strong' },
  medium:   { bg: 'bg-score-worth/10',            text: 'text-score-worth',          border: 'border-score-worth/25',          dot: 'bg-score-worth' },
  high:     { bg: 'bg-orange-500/10',             text: 'text-orange-400',           border: 'border-orange-500/25',           dot: 'bg-orange-400' },
  critical: { bg: 'bg-score-notrecommended/10',   text: 'text-score-notrecommended', border: 'border-score-notrecommended/25', dot: 'bg-score-notrecommended' },
}

function RiskSection({ risk }: { risk: FullAnalysisResponse['risk'] }) {
  const cfg = RISK_COLOR[risk.overall_risk] ?? RISK_COLOR.medium
  return (
    <Section title="Risk Assessment" icon={<AlertCircle size={14} />}>
      <div className="flex items-center gap-3 mb-3">
        <span className={clsx(
          'px-3 py-1 rounded-full text-xs font-bold border',
          cfg.bg, cfg.text, cfg.border,
        )}>
          {risk.overall_risk.toUpperCase()} RISK
        </span>
        <span className="text-xs text-muted">{risk.items.length} risk factor{risk.items.length !== 1 ? 's' : ''} identified</span>
      </div>

      {risk.items.length === 0 ? (
        <p className="text-sm text-score-strong">No significant risk factors detected.</p>
      ) : (
        <div className="space-y-2">
          {risk.items.map((item: RiskItem, i: number) => (
            <RiskCard key={i} item={item} />
          ))}
        </div>
      )}
    </Section>
  )
}

function RiskCard({ item }: { item: RiskItem }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = RISK_COLOR[item.severity] ?? RISK_COLOR.medium
  return (
    <div className={clsx('rounded-lg border p-3 space-y-1', cfg.bg, cfg.border)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={clsx('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
          <span className={clsx('text-sm font-semibold', cfg.text)}>{item.label}</span>
          <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', cfg.bg, cfg.text, 'border', cfg.border)}>
            {item.severity}
          </span>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted hover:text-ink shrink-0"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <p className="text-xs text-muted pl-4">{item.description}</p>
      {expanded && (
        <div className="pl-4 pt-1 border-t border-surface-border/50">
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">Mitigation: </span>
            {item.mitigation}
          </p>
        </div>
      )}
    </div>
  )
}

// ── 5-Year Projection ─────────────────────────────────────────────────────────

function ProjectionSection({
  projection,
  financial,
}: {
  projection: FullAnalysisResponse['projection']
  financial: FullAnalysisResponse['financial']
}) {
  const chartData = projection.snapshots.map(s => ({
    year: `Yr ${s.year}`,
    'Property Value': s.property_value,
    'Equity':         s.equity,
    'Cumulative CF':  s.cumulative_cash_flow,
  }))

  return (
    <Section title="5-Year Projection" icon={<TrendingUp size={14} />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <KeyMetric
          label="Total Return"
          value={fmtPct(projection.total_return_pct, 1)}
          valueClass={projection.total_return_pct != null && projection.total_return_pct > 0 ? 'text-score-strong' : 'text-score-notrecommended'}
        />
        <KeyMetric
          label="Annualized Return"
          value={fmtPct(projection.annualized_return, 2)}
          valueClass={projection.annualized_return != null && projection.annualized_return > 0 ? 'text-score-strong' : 'text-score-notrecommended'}
        />
        <KeyMetric
          label="Total Cash Needed"
          value={fmtCAD(financial.total_cash_needed)}
          note="down + welcome tax + closing"
        />
      </div>

      {chartData.length > 0 && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="year" stroke="#94A3B8" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis
                stroke="#94A3B8"
                tick={{ fontSize: 11, fill: '#64748B' }}
                tickFormatter={v => fmtK(v as number)}
                width={70}
              />
              <Tooltip
                contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                labelStyle={{ color: '#64748B', fontSize: 11 }}
                formatter={(v: unknown) => [fmtCAD(v as number), '']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#64748B' }} />
              <Line
                type="monotone"
                dataKey="Property Value"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ r: 3, fill: '#2563EB' }}
              />
              <Line
                type="monotone"
                dataKey="Equity"
                stroke="#059669"
                strokeWidth={2}
                dot={{ r: 3, fill: '#059669' }}
              />
              <Line
                type="monotone"
                dataKey="Cumulative CF"
                stroke="#D97706"
                strokeWidth={2}
                dot={{ r: 3, fill: '#D97706' }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Year-by-year table */}
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-xs text-muted">
          <thead>
            <tr className="border-b border-surface-border text-left">
              <th className="pb-2 font-semibold text-muted">Year</th>
              <th className="pb-2 font-semibold text-muted text-right">Value</th>
              <th className="pb-2 font-semibold text-muted text-right">Rent/mo</th>
              <th className="pb-2 font-semibold text-muted text-right">NOI</th>
              <th className="pb-2 font-semibold text-muted text-right">CF/mo</th>
              <th className="pb-2 font-semibold text-muted text-right">Equity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {projection.snapshots.map(s => (
              <tr key={s.year}>
                <td className="py-2">Year {s.year}</td>
                <td className="py-2 text-right font-mono">{fmtK(s.property_value)}</td>
                <td className="py-2 text-right font-mono">{fmtCAD(s.monthly_rent)}</td>
                <td className="py-2 text-right font-mono">{fmtK(s.noi)}</td>
                <td className={clsx('py-2 text-right font-mono', s.monthly_cash_flow >= 0 ? 'text-score-strong' : 'text-score-notrecommended')}>
                  {fmtCAD(s.monthly_cash_flow)}
                </td>
                <td className="py-2 text-right font-mono text-blue-600">{fmtK(s.equity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ── Renovation ROI ────────────────────────────────────────────────────────────

const RENO_COLOR: Record<string, { accent: string; badge: string }> = {
  light:  { accent: 'text-score-strong',        badge: 'bg-score-strong/10 border-score-strong/25 text-score-strong' },
  medium: { accent: 'text-score-worth',          badge: 'bg-score-worth/10 border-score-worth/25 text-score-worth' },
  heavy:  { accent: 'text-score-notrecommended', badge: 'bg-score-notrecommended/10 border-score-notrecommended/25 text-score-notrecommended' },
}

function RenovationSection({
  renovation,
  financial,
}: {
  renovation: FullAnalysisResponse['renovation']
  financial: FullAnalysisResponse['financial']
}) {
  return (
    <Section title="Renovation ROI" icon={<Wrench size={14} />}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {renovation.scenarios.map(s => {
          const c = RENO_COLOR[s.label] ?? RENO_COLOR.medium
          return (
            <div key={s.label} className="bg-surface border border-surface-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize', c.badge)}>
                  {s.label}
                </span>
                <span className="font-mono text-sm font-semibold text-ink">{fmtCAD(s.renovation_cost)}</span>
              </div>

              <div className="space-y-1 text-xs">
                <Row label="Rent increase" value={`+${fmtCAD(s.rent_increase_per_unit * (financial.gross_rent_monthly != null ? 1 : 1))}/unit`} />
                <Row label="New cap rate"  value={fmtPct(s.new_cap_rate)}      valueClass={c.accent} />
                <Row label="New cash flow" value={s.new_cash_flow != null ? `${fmtCAD(s.new_cash_flow)}/mo` : '—'}
                  valueClass={s.new_cash_flow != null && s.new_cash_flow >= 0 ? 'text-score-strong' : 'text-score-notrecommended'}
                />
              </div>

              <div className="pt-2 border-t border-surface-border space-y-1 text-xs">
                {s.payback_years != null ? (
                  <Row label="Payback" value={`${s.payback_years} yrs`} valueClass="text-ink" />
                ) : (
                  <Row label="Payback" value="N/A — negative CF delta" />
                )}
                {s.roi_pct != null && (
                  <Row label="Annual ROI" value={fmtPct(s.roi_pct, 1)} valueClass={c.accent} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted/60 mt-1">
        Costs: light $15–25/sqft · medium $40–70/sqft · heavy $80–150/sqft (age-adjusted).
        Rent increases are per unit based on Montreal area market data.
      </p>
    </Section>
  )
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={clsx('font-mono tabular-nums', valueClass ?? 'text-muted')}>{value}</span>
    </div>
  )
}

// ── Neighbourhood Context ─────────────────────────────────────────────────────

function NeighbourhoodSection({ neighbourhood }: { neighbourhood: FullAnalysisResponse['neighbourhood'] }) {
  if (neighbourhood.sample_size === 0) {
    return (
      <Section title="Neighbourhood Context" icon={<MapPin size={14} />}>
        <p className="text-sm text-muted py-4 text-center">
          No comparable active properties found in this city/type to benchmark against.
        </p>
      </Section>
    )
  }

  const metrics = [
    {
      label: 'Price Percentile',
      percentile: neighbourhood.price_percentile,
      vsAvg: neighbourhood.price_vs_avg_pct,
      cityAvg: fmtCAD(neighbourhood.city_avg_price),
      hint: 'Higher = cheaper than most peers (better deal)',
      higherIsBetter: true,
    },
    {
      label: 'Cap Rate Percentile',
      percentile: neighbourhood.cap_rate_percentile,
      vsAvg: neighbourhood.cap_rate_vs_avg_pct,
      cityAvg: `${neighbourhood.city_avg_cap_rate?.toFixed(2) ?? '—'}%`,
      hint: 'Higher = better cap rate than most peers',
      higherIsBetter: true,
    },
    {
      label: 'Score Percentile',
      percentile: neighbourhood.score_percentile,
      vsAvg: neighbourhood.score_vs_avg_pct,
      cityAvg: `${neighbourhood.city_avg_score?.toFixed(1) ?? '—'}`,
      hint: 'Higher = better opportunity score than most peers',
      higherIsBetter: true,
    },
  ]

  return (
    <Section title="Neighbourhood Context" icon={<MapPin size={14} />}>
      <p className="text-xs text-muted mb-4">
        Benchmarked against <span className="text-ink font-semibold">{neighbourhood.sample_size}</span> active
        same-type properties in the same city.
      </p>

      <div className="space-y-4">
        {metrics.map(m => {
          const pct = m.percentile ?? 0
          const barColor = pct >= 75 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626'
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div>
                  <span className="text-ink font-semibold">{m.label}</span>
                  <span className="text-muted ml-2">City avg: {m.cityAvg}</span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  {m.vsAvg != null && (
                    <span className={clsx(
                      'font-mono',
                      m.vsAvg > 0 ? 'text-score-strong' : 'text-score-notrecommended',
                    )}>
                      {m.vsAvg > 0 ? '+' : ''}{m.vsAvg.toFixed(1)}% vs avg
                    </span>
                  )}
                  <span className="font-mono font-bold text-ink w-12 text-right">
                    {m.percentile != null ? `${m.percentile.toFixed(0)}th` : '—'}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
              </div>
              <p className="text-[10px] text-muted/60 mt-0.5">{m.hint}</p>
            </div>
          )
        })}
      </div>

      {/* City averages grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-3 border-t border-surface-border">
        <MiniStat label="Avg Price"    value={fmtCAD(neighbourhood.city_avg_price)} />
        <MiniStat label="Avg $/sqft"   value={fmtCAD(neighbourhood.city_avg_price_per_sqft, 0)} />
        <MiniStat label="Avg Cap Rate" value={fmtPct(neighbourhood.city_avg_cap_rate, 2)} />
        <MiniStat label="Avg DOM"      value={neighbourhood.city_avg_days_on_market != null ? `${neighbourhood.city_avg_days_on_market.toFixed(0)} days` : '—'} />
        <MiniStat label="Avg Score"    value={neighbourhood.city_avg_score != null ? `${neighbourhood.city_avg_score.toFixed(1)}` : '—'} />
      </div>
    </Section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="text-xs font-mono font-semibold text-ink">{value}</p>
    </div>
  )
}

// ── AI Brief ──────────────────────────────────────────────────────────────────

function AiBriefSection({ brief, strategy }: { brief: string | null; strategy: string }) {
  return (
    <Section title="AI Investment Brief" icon={<Brain size={14} />}>
      {brief ? (
        <>
          <p className="text-ink leading-relaxed text-sm whitespace-pre-line">{brief}</p>
          <p className="text-[10px] text-muted/60 pt-2 border-t border-surface-border">
            Powered by local Ollama (llama3) · Strategy: {strategy} · Not financial advice
          </p>
        </>
      ) : (
        <div className="py-6 text-center space-y-2">
          <Brain className="mx-auto text-muted" size={28} />
          <p className="text-muted text-sm">AI brief unavailable</p>
          <p className="text-xs text-muted">
            Ollama is not running or the model is not loaded. Start Ollama with{' '}
            <code className="font-mono text-accent">ollama serve</code> and pull{' '}
            <code className="font-mono text-accent">llama3</code>.
          </p>
        </div>
      )}
    </Section>
  )
}

// ── Data Sources ──────────────────────────────────────────────────────────────

function DataSourcesSection({
  sources,
  financial,
}: {
  sources: FullAnalysisResponse['sources']
  financial: FullAnalysisResponse['financial']
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-bold text-muted uppercase tracking-widest"
      >
        <span>Data Sources &amp; Methodology</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {financial.rent_is_estimated && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-score-worth/10 border border-score-worth/25 text-xs text-score-worth">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>
                <strong>Estimated rent</strong> — rental income was not disclosed in the listing.
                Using CMHC 2025 Quebec average. Actual income may differ significantly.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-muted">
              <thead>
                <tr className="border-b border-surface-border text-left">
                  <th className="pb-2 font-semibold text-muted">Metric</th>
                  <th className="pb-2 font-semibold text-muted">Source</th>
                  <th className="pb-2 font-semibold text-muted">Publisher</th>
                  <th className="pb-2 font-semibold text-muted">Updated</th>
                  <th className="pb-2 font-semibold text-muted">Last Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {sources.map(src => (
                  <tr key={src.name}>
                    <td className="py-2 text-ink font-medium capitalize">
                      {src.name.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        {src.url.replace(/^https?:\/\//, '').split('/')[0]}
                        <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="py-2">{src.publisher}</td>
                    <td className="py-2">{src.frequency}</td>
                    <td className="py-2 font-mono">{src.verified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted/60 pt-1 border-t border-surface-border">
            Welcome tax brackets: RLRQ c. D-15.1 (2026 indexed at 2.3438% by Quebec CPI) ·
            Mortgage rate: Bank of Canada policy rate 2.25% + spread → 4.5% 5yr fixed ·
            This tool is for information purposes only and does not constitute financial or legal advice.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Skeleton / Error ──────────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5 animate-pulse">
      <div className="h-4 w-32 bg-surface-border rounded" />
      <div className="card space-y-4">
        <div className="h-6 w-80 bg-surface-border rounded" />
        <div className="h-3 w-48 bg-surface-border rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-14 bg-surface-border rounded" />)}
        </div>
      </div>
      {[0,1,2,3,4].map(i => (
        <div key={i} className="card h-32 bg-surface-border/30" />
      ))}
    </div>
  )
}

function AnalysisError({ id }: { id: string | undefined }) {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link to={id ? `/properties/${id}` : '/properties'} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> Back
      </Link>
      <div className="card text-center py-16 space-y-3">
        <AlertCircle className="mx-auto text-muted" size={32} />
        <p className="text-ink font-semibold">Analysis failed</p>
        <p className="text-sm text-muted">Could not compute the full analysis for this property.</p>
        <Link to={id ? `/properties/${id}` : '/properties'} className="inline-block mt-4 text-sm text-accent hover:underline">
          Return to property
        </Link>
      </div>
    </div>
  )
}
