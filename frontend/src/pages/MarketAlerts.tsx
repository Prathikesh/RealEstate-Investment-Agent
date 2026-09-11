import { useState } from 'react'
import { useLang } from '../context/LanguageContext'
import { displayAddress } from '../lib/address'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Plus, Trash2, ChevronRight, Building2,
  TrendingUp, ArrowDownCircle, Check, X, Zap, Percent, CircleDollarSign, SlidersHorizontal,
} from 'lucide-react'
import { fetchProperties, type PropertyCard, type PropertyFilters } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

// Metric-based alerts: pick a metric (+ threshold for numeric ones) and,
// optionally, restrict to a city. Threshold metrics use "at or above" (gte),
// which matches how investors think ("alert me when cap rate ≥ 6%").
type AlertMetric = 'new_listing' | 'price_drop' | 'score' | 'your_verdict' | 'cap_rate' | 'cash_flow'

interface AlertRule {
  id: string
  metric: AlertMetric
  value?: number       // threshold for score / cap_rate / cash_flow
  city?: string        // optional city restriction (any metric)
  label: string
  active: boolean
  createdAt: string
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY      = 'qre_alert_rules'
const LAST_VISITED_KEY = 'qre_alerts_last_visited'

// Old rules (pre-metric model) used { type, scoreMin, priceMax }. Migrate them
// so existing users don't lose their alerts when this ships.
function migrateRule(r: Record<string, unknown>): AlertRule | null {
  if (r.metric) return r as unknown as AlertRule
  const legacy = r.type as string | undefined
  const map: Record<string, AlertMetric> = {
    new_listing: 'new_listing', price_drop: 'price_drop',
    score_threshold: 'score', new_in_city: 'new_listing',
  }
  const metric = legacy ? map[legacy] : undefined
  if (!metric) return null
  return {
    id: (r.id as string) ?? genId(),
    metric,
    value: metric === 'score' ? (r.scoreMin as number) ?? 70 : undefined,
    city: (r.city as string) || undefined,
    label: (r.label as string) ?? ruleLabel(metric, r.scoreMin as number, r.city as string),
    active: (r.active as boolean) ?? true,
    createdAt: (r.createdAt as string) ?? new Date().toISOString(),
  }
}

function loadRules(): AlertRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Record<string, unknown>[]
    return raw.map(migrateRule).filter((r): r is AlertRule => r !== null)
  } catch { return [] }
}
function saveRules(rules: AlertRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}
function genId() { return Math.random().toString(36).slice(2, 10) }

function fmtCAD(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Alert metadata ────────────────────────────────────────────────────────────

interface MetricMeta {
  label: string; desc: string; icon: React.ReactNode
  color: string; bg: string; border: string
  needsValue: boolean; unit?: string; defaultValue?: number
  min?: number; max?: number; step?: number
}

const METRIC_META: Record<AlertMetric, MetricMeta> = {
  new_listing: { label: 'New Listings', desc: 'Any new property (optionally in a city)', icon: <Plus size={15} />,            color: 'text-accent',       bg: 'bg-accent/10',       border: 'border-accent/30',       needsValue: false },
  price_drop:  { label: 'Price Drops',  desc: 'Listings whose price just dropped',        icon: <ArrowDownCircle size={15} />, color: 'text-red-500',      bg: 'bg-red-50',          border: 'border-red-200',         needsValue: false },
  score:       { label: 'AI Score',     desc: 'AI score at or above your threshold',      icon: <TrendingUp size={15} />,      color: 'text-score-strong', bg: 'bg-score-strong/10', border: 'border-score-strong/30', needsValue: true, unit: '/100', defaultValue: 70, min: 40, max: 95, step: 5 },
  your_verdict:{ label: 'Your Verdict',  desc: 'Your personalized score at or above your target', icon: <SlidersHorizontal size={15} />, color: 'text-accent',     bg: 'bg-accent/10',       border: 'border-accent/30',       needsValue: true, unit: '/100', defaultValue: 70, min: 40, max: 95, step: 5 },
  cap_rate:    { label: 'Cap Rate',     desc: 'Cap rate at or above your target',         icon: <Percent size={15} />,         color: 'text-emerald-600',  bg: 'bg-emerald-50',      border: 'border-emerald-200',     needsValue: true, unit: '%',    defaultValue: 6,  min: 1, max: 12, step: 0.5 },
  cash_flow:   { label: 'Cash Flow',    desc: 'Monthly cash flow at or above your target', icon: <CircleDollarSign size={15} />, color: 'text-blue-600',     bg: 'bg-blue-50',         border: 'border-blue-200',        needsValue: true, unit: '$/mo', defaultValue: 200, min: -500, max: 3000, step: 50 },
}

const QC_CITIES = [
  'Montréal', 'Laval', 'Québec', 'Longueuil', 'Sherbrooke',
  'Saguenay', 'Lévis', 'Gatineau', 'Drummondville', 'Saint-Jérôme',
]

function ruleLabel(metric: AlertMetric, value?: number, city?: string): string {
  const inCity = city ? ` in ${city}` : ''
  const suffix = city ? ` · ${city}` : ''
  switch (metric) {
    case 'new_listing': return `New listings${inCity}`
    case 'price_drop':  return `Price drops${suffix}`
    case 'score':       return `AI score ≥ ${value}${suffix}`
    case 'your_verdict': return `Your Verdict ≥ ${value}${suffix}`
    case 'cap_rate':    return `Cap rate ≥ ${value}%${suffix}`
    case 'cash_flow':   return `Cash flow ≥ $${value}/mo${suffix}`
  }
}

function buildRuleFilters(rule: AlertRule): PropertyFilters {
  const base: PropertyFilters = { page_size: 3, city: rule.city || undefined }
  switch (rule.metric) {
    case 'new_listing': return { ...base, sort_by: 'newest', listed_within: '7d' }
    case 'price_drop':  return { ...base, sort_by: 'discount' }
    case 'score':       return { ...base, sort_by: 'score', score_min: rule.value ?? 70 }
    case 'your_verdict': return { ...base, sort_by: 'your_verdict', your_score_min: rule.value ?? 70 }
    case 'cap_rate':    return { ...base, sort_by: 'score', cap_rate_min: rule.value ?? 6 }
    case 'cash_flow':   return { ...base, sort_by: 'score', cash_flow_min: rule.value ?? 200 }
  }
}

function alertLink(rule: AlertRule): string {
  const f = buildRuleFilters(rule)
  const p = new URLSearchParams()
  Object.entries(f).forEach(([k, v]) => {
    if (k === 'page_size' || v === undefined || v === '') return
    p.set(k, String(v))
  })
  return `/properties?${p.toString()}`
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketAlerts() {
  const { t } = useLang()
  const [rules, setRules]       = useState<AlertRule[]>(loadRules)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<{ metric: AlertMetric; value: number; city: string }>(
    { metric: 'cap_rate', value: METRIC_META.cap_rate.defaultValue!, city: '' },
  )

  // Switching metric resets the threshold to that metric's sensible default.
  function pickMetric(metric: AlertMetric) {
    setForm(f => ({ ...f, metric, value: METRIC_META[metric].defaultValue ?? f.value }))
  }

  // Track last visit — read previous timestamp, immediately update to now
  const [prevVisited] = useState<string | null>(() => {
    const prev = localStorage.getItem(LAST_VISITED_KEY)
    localStorage.setItem(LAST_VISITED_KEY, new Date().toISOString())
    return prev
  })

  // Snap card counts
  const { data: highScoreData } = useQuery({ queryKey: ['alert-match', 'score'],   queryFn: () => fetchProperties({ sort_by: 'score',   score_min: 50,                   page_size: 1 }) })
  const { data: newestData }    = useQuery({ queryKey: ['alert-match', 'newest'],  queryFn: () => fetchProperties({ sort_by: 'newest',  listed_within: '7d',             page_size: 1 }) })
  const { data: discountData }  = useQuery({ queryKey: ['alert-match', 'discount'],queryFn: () => fetchProperties({ sort_by: 'discount',                                  page_size: 1 }) })

  function addRule() {
    const meta = METRIC_META[form.metric]
    const city = form.city || undefined
    const value = meta.needsValue ? form.value : undefined
    const rule: AlertRule = {
      id: genId(),
      metric: form.metric,
      value,
      city,
      label: ruleLabel(form.metric, value, city),
      active: true,
      createdAt: new Date().toISOString(),
    }
    const next = [...rules, rule]
    setRules(next); saveRules(next); setShowForm(false)
  }

  function deleteRule(id: string) {
    const next = rules.filter(r => r.id !== id)
    setRules(next); saveRules(next)
  }

  function toggleRule(id: string) {
    const next = rules.map(r => r.id === id ? { ...r, active: !r.active } : r)
    setRules(next); saveRules(next)
  }

  const activeCount = rules.filter(r => r.active).length

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('nav_marketAlerts')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('ma_subtitle')}</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary shadow-md">
          <Plus size={14} /> New Alert
        </button>
      </div>

      {/* Snap cards */}
      <div className="grid grid-cols-3 gap-3">
        <SnapCard label="High Score Deals" value={highScoreData?.total ?? '—'} sub="Score 50+ properties"    color="text-score-strong" bg="bg-score-strong/10" icon={<TrendingUp size={18} />}    to="/properties?sort_by=score&score_min=50" />
        <SnapCard label="New This Week"    value={newestData?.total    ?? '—'} sub="Listed in last 7 days"  color="text-accent"       bg="bg-accent/10"       icon={<Zap size={18} />}           to="/properties?sort_by=newest&listed_within=7d" />
        <SnapCard label="Below Market"     value={discountData?.total  ?? '—'} sub="With price discount"    color="text-red-500"      bg="bg-red-50"          icon={<ArrowDownCircle size={18} />} to="/properties?sort_by=discount" />
      </div>

      {/* SMS notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-accent/5 border border-accent/20">
        <Zap size={15} className="text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-ink">
          SMS/WhatsApp notifications —{' '}
          <Link to="/settings" className="text-accent font-medium hover:underline">add your phone number in Settings →</Link>
        </p>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card border-accent/30 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">{t('ma_create')}</h2>
            <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink transition-colors p-1 rounded-lg hover:bg-surface-hover">
              <X size={16} />
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{t('ma_basedOn')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(METRIC_META) as [AlertMetric, MetricMeta][]).map(([metric, meta]) => (
                <button
                  key={metric}
                  onClick={() => pickMetric(metric)}
                  className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-left transition-all duration-150 ${
                    form.metric === metric
                      ? `${meta.bg} ${meta.border} ${meta.color}`
                      : 'bg-surface-card border-surface-border text-muted hover:text-ink hover:bg-surface-hover'
                  }`}
                >
                  <span className={`mt-0.5 ${form.metric === metric ? meta.color : 'text-muted'}`}>{meta.icon}</span>
                  <div>
                    <p className="font-semibold text-sm">{meta.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{meta.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Threshold — for numeric metrics (score / cap rate / cash flow) */}
          {METRIC_META[form.metric].needsValue && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">
                  Minimum {METRIC_META[form.metric].label.toLowerCase()}
                </p>
                <span className="text-lg font-bold text-accent font-mono">
                  {form.value}<span className="text-sm text-muted font-sans">{METRIC_META[form.metric].unit}</span>
                </span>
              </div>
              <input
                type="range"
                min={METRIC_META[form.metric].min}
                max={METRIC_META[form.metric].max}
                step={METRIC_META[form.metric].step}
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: +e.target.value }))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-1.5">
                <span>{METRIC_META[form.metric].min}{METRIC_META[form.metric].unit}</span>
                <span>{METRIC_META[form.metric].max}{METRIC_META[form.metric].unit}</span>
              </div>
            </div>
          )}

          {/* Optional city restriction — applies to any metric */}
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">City <span className="font-normal normal-case text-muted/70">— optional</span></p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setForm(f => ({ ...f, city: '' }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  form.city === '' ? 'bg-accent text-white border-accent' : 'bg-surface border-surface-border text-muted hover:text-ink'
                }`}
              >
                Any city
              </button>
              {QC_CITIES.map(city => (
                <button key={city} onClick={() => setForm(f => ({ ...f, city }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    form.city === city ? 'bg-accent text-white border-accent' : 'bg-surface border-surface-border text-muted hover:text-ink'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1 border-t border-surface-border">
            <button onClick={addRule} className="btn-primary"><Check size={14} /> Save Alert</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {rules.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="font-bold text-ink">{rules.length} alert{rules.length !== 1 ? 's' : ''}</span>
          <span className="text-score-strong font-semibold">{activeCount} active</span>
          {rules.length - activeCount > 0 && <span className="text-muted">{rules.length - activeCount} paused</span>}
        </div>
      )}

      {/* Empty state */}
      {rules.length === 0 && !showForm && (
        <div className="card py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <Bell size={28} className="text-accent" />
          </div>
          <div>
            <p className="font-bold text-ink text-lg">{t('ma_empty')}</p>
            <p className="text-sm text-muted mt-1">{t('ma_emptyHint')}</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary mx-auto">
            <Plus size={14} /> Create your first alert
          </button>
        </div>
      )}

      {/* Rules list */}
      {rules.length > 0 && (
        <div className="space-y-4">
          {rules.map(rule => (
            <AlertRuleCard
              key={rule.id}
              rule={rule}
              prevVisited={prevVisited}
              onDelete={deleteRule}
              onToggle={toggleRule}
            />
          ))}
        </div>
      )}

      {/* Tips */}
      <div className="card bg-surface/50 space-y-4">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">{t('ma_proTips')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { dot: 'bg-score-strong', title: 'Score 80+ deals are rare', desc: 'Set an alert to catch them the moment they appear — they move fast' },
            { dot: 'bg-accent',       title: 'New listings move within 48h', desc: 'In hot neighborhoods, speed matters — alert lets you act first' },
            { dot: 'bg-red-500',      title: 'Price drops = motivated sellers', desc: 'Often the best negotiation opportunity in any market' },
            { dot: 'bg-blue-500',     title: 'City alerts for target neighborhoods', desc: 'Track specific areas you want to invest in long-term' },
          ].map(tip => (
            <div key={tip.title} className="flex items-start gap-3 p-3 rounded-xl bg-surface-card border border-surface-border">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${tip.dot}`} />
              <div>
                <p className="text-sm font-semibold text-ink">{tip.title}</p>
                <p className="text-xs text-muted mt-0.5">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Alert rule card with property previews + new badge ────────────────────────

function AlertRuleCard({
  rule, prevVisited, onDelete, onToggle,
}: {
  rule: AlertRule
  prevVisited: string | null
  onDelete: (id: string) => void
  onToggle: (id: string) => void
}) {
  const meta = METRIC_META[rule.metric]

  const { data, isLoading } = useQuery({
    queryKey: ['alert-rule-props', rule.id, rule.metric, rule.city, rule.value],
    queryFn: () => fetchProperties(buildRuleFilters(rule)),
    enabled: rule.active,
    staleTime: 5 * 60_000,
  })

  const items  = data?.items ?? []
  const total  = data?.total ?? 0
  const newCount = prevVisited
    ? items.filter(p => p.first_seen_at > prevVisited).length
    : 0

  return (
    <div className={`card p-0 overflow-hidden transition-all duration-200 hover:shadow-md ${!rule.active ? 'opacity-55' : ''}`}>

      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${meta.bg} ${meta.border}`}>
          <span className={meta.color}>{meta.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-ink text-sm">{rule.label}</p>
            {newCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                {newCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
              {meta.label}
            </span>
            {rule.active && total > 0 && (
              <span className="text-[10px] text-muted">{total.toLocaleString()} matches</span>
            )}
            <span className="text-[10px] text-muted">
              {new Date(rule.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
            </span>
            {!rule.active && (
              <span className="text-[10px] text-muted bg-surface-hover border border-surface-border px-2 py-0.5 rounded-full">Paused</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggle(rule.id)}
            title={rule.active ? 'Pause' : 'Resume'}
            className={`relative w-11 h-6 rounded-full transition-all duration-300 ${rule.active ? 'bg-score-strong' : 'bg-surface-border'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-surface-card rounded-full shadow-sm transition-all duration-300 ${rule.active ? 'left-6' : 'left-1'}`} />
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-all duration-150"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Property previews */}
      {rule.active && (
        <>
          {isLoading ? (
            <div className="border-t border-surface-border">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-surface-border last:border-0">
                  <div className="w-10 h-10 rounded-lg shimmer shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-48 shimmer rounded" />
                    <div className="h-2.5 w-24 shimmer rounded" />
                  </div>
                  <div className="h-4 w-20 shimmer rounded" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="border-t border-surface-border px-5 py-5 text-center">
              <p className="text-xs text-muted">No matches yet — we'll highlight when one appears.</p>
            </div>
          ) : (
            <div className="border-t border-surface-border divide-y divide-surface-border">
              {items.map(p => <PropertyPreviewRow key={p.id} p={p} prevVisited={prevVisited} />)}
            </div>
          )}

          {/* Footer */}
          {total > 0 && (
            <Link
              to={alertLink(rule)}
              className="flex items-center justify-between px-5 py-3 bg-surface/50 hover:bg-surface-hover border-t border-surface-border transition-colors group"
            >
              <span className={`text-xs font-bold ${meta.color}`}>
                View all {total.toLocaleString()} matches
              </span>
              <ChevronRight size={13} className={`${meta.color} group-hover:translate-x-0.5 transition-transform`} />
            </Link>
          )}
        </>
      )}
    </div>
  )
}

// ── Single property row inside an alert card ──────────────────────────────────

function PropertyPreviewRow({ p, prevVisited }: { p: PropertyCard; prevVisited: string | null }) {
  const isNew = prevVisited ? p.first_seen_at > prevVisited : false

  return (
    <Link
      to={`/properties/${p.id}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors group"
    >
      <div className="w-10 h-10 rounded-lg bg-surface-hover shrink-0 overflow-hidden border border-surface-border flex items-center justify-center">
        {p.photos.length > 0
          ? <img src={p.photos[0]} referrerPolicy="no-referrer" alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          : <Building2 size={12} className="text-surface-border" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink truncate group-hover:text-accent transition-colors">{displayAddress(p)}</p>
        <p className="text-[10px] text-muted">{p.city} · {timeAgo(p.first_seen_at)}</p>
      </div>
      <div className="text-right shrink-0 flex items-center gap-2">
        {isNew && (
          <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full">NEW</span>
        )}
        <p className="text-xs font-bold font-mono text-ink tabular-nums">{fmtCAD(p.asking_price)}</p>
      </div>
    </Link>
  )
}

// ── Snap card ─────────────────────────────────────────────────────────────────

function SnapCard({ label, value, sub, color, bg, icon, to }: {
  label: string; value: number | string; sub: string
  color: string; bg: string; icon: React.ReactNode; to: string
}) {
  return (
    <Link to={to} className="card card-hover text-center space-y-1 block">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
        <span className={color}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs font-semibold text-ink">{label}</p>
      <p className="text-[10px] text-muted">{sub}</p>
    </Link>
  )
}
