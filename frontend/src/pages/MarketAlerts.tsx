import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Plus, Trash2, ChevronRight, Building2,
  TrendingUp, ArrowDownCircle, Check, X, Zap,
} from 'lucide-react'
import { fetchProperties } from '../api'

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

const STORAGE_KEY = 'qre_alert_rules'

function loadRules(): AlertRule[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AlertRule[] }
  catch { return [] }
}
function saveRules(rules: AlertRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}
function genId() { return Math.random().toString(36).slice(2, 10) }

const ALERT_TYPES: Record<AlertType, { label: string; desc: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  new_listing:     { label: 'New Listing',     desc: 'Any new property added',              icon: <Plus size={15} />,            color: 'text-accent',       bg: 'bg-accent/10',       border: 'border-accent/30' },
  price_drop:      { label: 'Price Drop',      desc: 'When asking price decreases',          icon: <ArrowDownCircle size={15} />, color: 'text-red-500',      bg: 'bg-red-50',          border: 'border-red-200' },
  score_threshold: { label: 'High Score Deal', desc: 'AI score above your threshold',        icon: <TrendingUp size={15} />,      color: 'text-score-strong', bg: 'bg-score-strong/10', border: 'border-score-strong/30' },
  new_in_city:     { label: 'New in City',     desc: 'New listings in a specific city',      icon: <Building2 size={15} />,       color: 'text-blue-600',     bg: 'bg-blue-50',         border: 'border-blue-200' },
}

const QC_CITIES = [
  'Montréal', 'Laval', 'Québec', 'Longueuil', 'Sherbrooke',
  'Saguenay', 'Lévis', 'Gatineau', 'Drummondville', 'Saint-Jérôme',
]

export default function MarketAlerts() {
  const [rules, setRules]       = useState<AlertRule[]>(loadRules)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ type: 'score_threshold' as AlertType, city: '', scoreMin: 65, priceMax: 1000000 })

  // Live match counts from API
  const { data: highScoreData } = useQuery({
    queryKey: ['alert-match', 'score'],
    queryFn: () => fetchProperties({ sort_by: 'score', score_min: 50, page_size: 1 }),
  })
  const { data: newestData } = useQuery({
    queryKey: ['alert-match', 'newest'],
    queryFn: () => fetchProperties({ sort_by: 'newest', listed_within: '7d', page_size: 1 }),
  })
  const { data: discountData } = useQuery({
    queryKey: ['alert-match', 'discount'],
    queryFn: () => fetchProperties({ sort_by: 'discount', page_size: 1 }),
  })

  function matchCount(rule: AlertRule): number | null {
    if (rule.type === 'score_threshold') return highScoreData?.total ?? null
    if (rule.type === 'new_listing')     return newestData?.total ?? null
    if (rule.type === 'price_drop')      return discountData?.total ?? null
    return null
  }

  function alertLink(rule: AlertRule): string {
    if (rule.type === 'new_listing')     return '/properties?sort_by=newest&listed_within=7d'
    if (rule.type === 'price_drop')      return '/properties?sort_by=discount'
    if (rule.type === 'score_threshold') return `/properties?score_min=${rule.scoreMin ?? 65}&sort_by=score`
    if (rule.type === 'new_in_city')     return `/properties?city=${encodeURIComponent(rule.city ?? '')}&sort_by=newest`
    return '/properties'
  }

  function addRule() {
    const meta = ALERT_TYPES[form.type]
    let label = meta.label
    if (form.type === 'new_in_city' && form.city)    label = `New in ${form.city}`
    if (form.type === 'score_threshold')             label = `AI Score ≥ ${form.scoreMin}`
    if (form.type === 'price_drop' && form.priceMax) label = `Price drop ≤ $${(form.priceMax / 1000).toFixed(0)}K`

    const rule: AlertRule = {
      id: genId(), type: form.type, label,
      city:     form.type === 'new_in_city'     ? form.city      : undefined,
      scoreMin: form.type === 'score_threshold' ? form.scoreMin  : undefined,
      priceMax: form.type === 'price_drop'      ? form.priceMax  : undefined,
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
    <div className="p-6 space-y-6 animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Market Alerts</h1>
          <p className="text-sm text-muted mt-0.5">Track deals that match your criteria</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          <Plus size={14} /> New Alert
        </button>
      </div>

      {/* Live market snapshot cards */}
      <div className="grid grid-cols-3 gap-3">
        <SnapCard
          label="High Score Deals"
          value={highScoreData?.total ?? '—'}
          sub="Score 50+ properties"
          color="text-score-strong"
          bg="bg-score-strong/10"
          to="/properties?sort_by=score&score_min=50"
        />
        <SnapCard
          label="New This Week"
          value={newestData?.total ?? '—'}
          sub="Listed in last 7 days"
          color="text-accent"
          bg="bg-accent/10"
          to="/properties?sort_by=newest&listed_within=7d"
        />
        <SnapCard
          label="Below Market"
          value={discountData?.total ?? '—'}
          sub="With price discount"
          color="text-red-500"
          bg="bg-red-50"
          to="/properties?sort_by=discount"
        />
      </div>

      {/* SMS notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-accent/5 border border-accent/20">
        <Zap size={15} className="text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-ink">
          SMS/WhatsApp notifications —{' '}
          <Link to="/settings" className="text-accent font-medium hover:underline">
            add your phone number in Settings →
          </Link>
        </p>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card border-accent/30 space-y-5 animate-scale-in">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">Create Alert</h2>
            <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink transition-colors p-1 rounded-lg hover:bg-surface-hover">
              <X size={16} />
            </button>
          </div>

          {/* Type selection */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ALERT_TYPES) as [AlertType, typeof ALERT_TYPES[AlertType]][]).map(([type, meta]) => (
              <button
                key={type}
                onClick={() => setForm(f => ({ ...f, type }))}
                className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-left transition-all duration-150 ${
                  form.type === type
                    ? `${meta.bg} ${meta.border} ${meta.color} border`
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

          {/* Conditional fields */}
          {form.type === 'new_in_city' && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Select city</p>
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
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Minimum AI score</p>
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
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Max property price</p>
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
          <span className="font-semibold text-ink">{rules.length} alerts</span>
          <span className="text-score-strong font-medium">{activeCount} active</span>
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
        <div className="space-y-3">
          {rules.map(rule => {
            const meta = ALERT_TYPES[rule.type]
            const count = matchCount(rule)
            return (
              <div key={rule.id}
                className={`card flex items-center gap-4 transition-all duration-200 ${!rule.active ? 'opacity-40' : ''}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                  <span className={meta.color}>{meta.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink text-sm">{rule.label}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    {count != null && (
                      <span className="text-xs bg-surface border border-surface-border px-2 py-0.5 rounded-full font-semibold text-ink">
                        {count.toLocaleString()} matches
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {new Date(rule.createdAt).toLocaleDateString('en-CA')}
                    </span>
                  </div>
                </div>

                <Link to={alertLink(rule)}
                  className="text-xs text-accent hover:underline flex items-center gap-0.5 shrink-0 font-medium"
                >
                  View <ChevronRight size={12} />
                </Link>

                {/* Toggle */}
                <button onClick={() => toggleRule(rule.id)}
                  className={`relative w-10 h-6 rounded-full transition-all duration-200 shrink-0 ${rule.active ? 'bg-score-strong' : 'bg-surface-border'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${rule.active ? 'left-5' : 'left-1'}`} />
                </button>

                <button onClick={() => deleteRule(rule.id)}
                  className="text-muted hover:text-red-500 transition-colors shrink-0 p-1 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Tips */}
      <div className="card bg-surface/50 space-y-3">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">Pro Tips</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted">
          <p className="flex items-start gap-2"><span className="text-score-strong font-bold mt-0.5">→</span><span><span className="text-ink font-medium">Score 80+</span> deals are rare — set an alert to catch them the moment they appear</span></p>
          <p className="flex items-start gap-2"><span className="text-accent font-bold mt-0.5">→</span><span><span className="text-ink font-medium">New listings</span> in hot neighborhoods get offers within 48h — speed matters</span></p>
          <p className="flex items-start gap-2"><span className="text-red-500 font-bold mt-0.5">→</span><span><span className="text-ink font-medium">Price drops</span> signal motivated sellers — often the best negotiation opportunity</span></p>
          <p className="flex items-start gap-2"><span className="text-blue-500 font-bold mt-0.5">→</span><span><span className="text-ink font-medium">City alerts</span> let you track specific neighborhoods you want to invest in</span></p>
        </div>
      </div>
    </div>
  )
}

function SnapCard({ label, value, sub, color, bg, to }: {
  label: string; value: number | string; sub: string; color: string; bg: string; to: string
}) {
  return (
    <Link to={to} className="card card-hover text-center space-y-1 block">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
        <Bell size={16} className={color} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs font-semibold text-ink">{label}</p>
      <p className="text-[10px] text-muted">{sub}</p>
    </Link>
  )
}
