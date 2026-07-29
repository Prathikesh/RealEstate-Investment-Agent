import { useState } from 'react'
import { displayAddress } from '../lib/address'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Plus, Trash2, ChevronRight, Building2,
  TrendingUp, ArrowDownCircle, Check, X, Zap,
} from 'lucide-react'
import { fetchProperties, type PropertyCard, type PropertyFilters } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertType = 'new_listing' | 'price_drop' | 'score_threshold' | 'new_in_city'

interface AlertRule {
  id: string
  type: AlertType
  label: string
  city?: string
  scoreMin?: number
  priceMax?: number
  active: boolean
  createdAt: string
  matchCount: number
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY      = 'qre_alert_rules'
const LAST_VISITED_KEY = 'qre_alerts_last_visited'

function loadRules(): AlertRule[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AlertRule[] }
  catch { return [] }
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

const ALERT_TYPES: Record<AlertType, {
  label: string; desc: string; icon: React.ReactNode
  color: string; bg: string; border: string
}> = {
  new_listing:     { label: 'New Listing',     desc: 'Any new property added',         icon: <Plus size={15} />,            color: 'text-accent',       bg: 'bg-accent/10',       border: 'border-accent/30' },
  price_drop:      { label: 'Price Drop',      desc: 'When asking price decreases',     icon: <ArrowDownCircle size={15} />, color: 'text-red-500',      bg: 'bg-red-50',          border: 'border-red-200' },
  score_threshold: { label: 'High Score Deal', desc: 'AI score above your threshold',   icon: <TrendingUp size={15} />,      color: 'text-score-strong', bg: 'bg-score-strong/10', border: 'border-score-strong/30' },
  new_in_city:     { label: 'New in City',     desc: 'New listings in a specific city', icon: <Building2 size={15} />,       color: 'text-blue-600',     bg: 'bg-blue-50',         border: 'border-blue-200' },
}

const QC_CITIES = [
  'Montréal', 'Laval', 'Québec', 'Longueuil', 'Sherbrooke',
  'Saguenay', 'Lévis', 'Gatineau', 'Drummondville', 'Saint-Jérôme',
]

function buildRuleFilters(rule: AlertRule): PropertyFilters {
  if (rule.type === 'new_listing')
    return { sort_by: 'newest', listed_within: '7d', page_size: 3 }
  if (rule.type === 'price_drop')
    return { sort_by: 'discount', price_max: rule.priceMax, page_size: 3 }
  if (rule.type === 'score_threshold')
    return { sort_by: 'score', score_min: rule.scoreMin ?? 65, page_size: 3 }
  if (rule.type === 'new_in_city')
    return { city: rule.city, sort_by: 'newest', page_size: 3 }
  return { page_size: 3 }
}

function alertLink(rule: AlertRule): string {
  if (rule.type === 'new_listing')     return '/properties?sort_by=newest&listed_within=7d'
  if (rule.type === 'price_drop')      return '/properties?sort_by=discount'
  if (rule.type === 'score_threshold') return `/properties?score_min=${rule.scoreMin ?? 65}&sort_by=score`
  if (rule.type === 'new_in_city')     return `/properties?city=${encodeURIComponent(rule.city ?? '')}&sort_by=newest`
  return '/properties'
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketAlerts() {
  const [rules, setRules]       = useState<AlertRule[]>(loadRules)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ type: 'score_threshold' as AlertType, city: '', scoreMin: 65, priceMax: 1_000_000 })

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
    const meta = ALERT_TYPES[form.type]
    let label = meta.label
    if (form.type === 'new_in_city' && form.city)   label = `New in ${form.city}`
    if (form.type === 'score_threshold')             label = `AI Score ≥ ${form.scoreMin}`
    if (form.type === 'price_drop' && form.priceMax) label = `Price drop ≤ $${(form.priceMax / 1000).toFixed(0)}K`

    const rule: AlertRule = {
      id: genId(), type: form.type, label,
      city:     form.type === 'new_in_city'     ? form.city     : undefined,
      scoreMin: form.type === 'score_threshold' ? form.scoreMin : undefined,
      priceMax: form.type === 'price_drop'      ? form.priceMax : undefined,
      active: true, createdAt: new Date().toISOString(), matchCount: 0,
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
          <h1 className="text-2xl font-bold text-ink">Market Alerts</h1>
          <p className="text-sm text-muted mt-0.5">Track deals that match your criteria</p>
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
            <h2 className="font-bold text-ink">Create Alert</h2>
            <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink transition-colors p-1 rounded-lg hover:bg-surface-hover">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ALERT_TYPES) as [AlertType, typeof ALERT_TYPES[AlertType]][]).map(([type, meta]) => (
              <button
                key={type}
                onClick={() => setForm(f => ({ ...f, type }))}
                className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-left transition-all duration-150 ${
                  form.type === type
                    ? `${meta.bg} ${meta.border} ${meta.color}`
                    : 'bg-white border-surface-border text-muted hover:text-ink hover:bg-surface-hover'
                }`}
              >
                <span className={`mt-0.5 ${form.type === type ? meta.color : 'text-muted'}`}>{meta.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{meta.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{meta.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {form.type === 'new_in_city' && (
            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Select city</p>
              <div className="flex flex-wrap gap-2">
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
          )}

          {form.type === 'score_threshold' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">Minimum AI score</p>
                <span className="text-lg font-bold text-accent font-mono">{form.scoreMin}<span className="text-sm text-muted font-sans">/100</span></span>
              </div>
              <input type="range" min={50} max={95} step={5} value={form.scoreMin}
                onChange={e => setForm(f => ({ ...f, scoreMin: +e.target.value }))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-1.5">
                <span>50 — Good</span><span>70 — Great</span><span>80+ — Best</span>
              </div>
            </div>
          )}

          {form.type === 'price_drop' && (
            <div>
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Max property price</p>
              <input type="number" value={form.priceMax}
                onChange={e => setForm(f => ({ ...f, priceMax: +e.target.value }))}
                className="input max-w-xs" placeholder="1000000" step={50000}
              />
              <p className="text-xs text-muted mt-1.5">Only alert on price drops for properties under this value</p>
            </div>
          )}

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
            <p className="font-bold text-ink text-lg">No alerts yet</p>
            <p className="text-sm text-muted mt-1">Create alerts and get notified when great deals appear.</p>
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
        <p className="text-xs font-bold text-muted uppercase tracking-wider">Pro Tips</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { dot: 'bg-score-strong', title: 'Score 80+ deals are rare', desc: 'Set an alert to catch them the moment they appear — they move fast' },
            { dot: 'bg-accent',       title: 'New listings move within 48h', desc: 'In hot neighborhoods, speed matters — alert lets you act first' },
            { dot: 'bg-red-500',      title: 'Price drops = motivated sellers', desc: 'Often the best negotiation opportunity in any market' },
            { dot: 'bg-blue-500',     title: 'City alerts for target neighborhoods', desc: 'Track specific areas you want to invest in long-term' },
          ].map(tip => (
            <div key={tip.title} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-surface-border">
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
  const meta = ALERT_TYPES[rule.type]

  const { data, isLoading } = useQuery({
    queryKey: ['alert-rule-props', rule.id, rule.type, rule.city, rule.scoreMin, rule.priceMax],
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
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${rule.active ? 'left-6' : 'left-1'}`} />
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
