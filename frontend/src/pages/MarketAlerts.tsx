import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Plus, Trash2, ChevronRight, Building2, TrendingUp, ArrowDownCircle, Check, X } from 'lucide-react'

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
  lastTriggered?: string
  matchCount: number
}

const STORAGE_KEY = 'qre_alert_rules'

function loadRules(): AlertRule[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AlertRule[]
  } catch { return [] }
}

function saveRules(rules: AlertRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

// ── Alert type meta ───────────────────────────────────────────────────────────

const ALERT_TYPES: Record<AlertType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  new_listing:     { label: 'New listing',       icon: <Plus size={14} />,            color: 'text-accent',       bg: 'bg-accent/10' },
  price_drop:      { label: 'Price drop',        icon: <ArrowDownCircle size={14} />, color: 'text-red-500',      bg: 'bg-red-50' },
  score_threshold: { label: 'High score deal',   icon: <TrendingUp size={14} />,      color: 'text-score-strong', bg: 'bg-score-strong/10' },
  new_in_city:     { label: 'New in city',       icon: <Building2 size={14} />,       color: 'text-blue-600',     bg: 'bg-blue-50' },
}

const QC_CITIES = [
  'Montréal', 'Laval', 'Québec', 'Longueuil', 'Sherbrooke',
  'Saguenay', 'Lévis', 'Gatineau', 'Drummondville', 'Saint-Jérôme',
]

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MarketAlerts() {
  const [rules, setRules]       = useState<AlertRule[]>(loadRules)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({
    type: 'new_listing' as AlertType,
    city: '',
    scoreMin: 70,
    priceMax: 1000000,
  })

  function addRule() {
    const meta = ALERT_TYPES[form.type]
    let label = meta.label
    if (form.type === 'new_in_city' && form.city)       label = `New in ${form.city}`
    if (form.type === 'score_threshold')                label = `Score ≥ ${form.scoreMin}`
    if (form.type === 'price_drop' && form.priceMax)    label = `Price drop ≤ $${(form.priceMax / 1000).toFixed(0)}K`

    const rule: AlertRule = {
      id:          genId(),
      type:        form.type,
      label,
      city:        form.type === 'new_in_city' ? form.city : undefined,
      scoreMin:    form.type === 'score_threshold' ? form.scoreMin : undefined,
      priceMax:    form.type === 'price_drop' ? form.priceMax : undefined,
      active:      true,
      createdAt:   new Date().toISOString(),
      matchCount:  0,
    }

    const next = [...rules, rule]
    setRules(next)
    saveRules(next)
    setShowForm(false)
  }

  function deleteRule(id: string) {
    const next = rules.filter(r => r.id !== id)
    setRules(next)
    saveRules(next)
  }

  function toggleRule(id: string) {
    const next = rules.map(r => r.id === id ? { ...r, active: !r.active } : r)
    setRules(next)
    saveRules(next)
  }

  const activeCount   = rules.filter(r => r.active).length
  const inactiveCount = rules.filter(r => !r.active).length

  return (
    <div className="p-6 space-y-6 max-w-3xl animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Market Alerts</h1>
          <p className="text-sm text-muted mt-0.5">Get notified when new deals match your criteria</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-primary"
        >
          <Plus size={14} />
          New Alert
        </button>
      </div>

      {/* SMS notice */}
      <div className="card bg-accent/5 border-accent/20 flex items-start gap-3">
        <Bell size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">SMS / WhatsApp notifications</p>
          <p className="text-xs text-muted mt-0.5">
            Alert rules are saved. To receive SMS or WhatsApp notifications,{' '}
            <Link to="/settings" className="text-accent hover:underline font-medium">
              add your phone number in Settings →
            </Link>
          </p>
        </div>
      </div>

      {/* New alert form */}
      {showForm && (
        <div className="card space-y-4 border-accent/20 animate-scale-in">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">Create new alert</h2>
            <button onClick={() => setShowForm(false)} className="text-muted hover:text-ink transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Alert type */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Alert type</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ALERT_TYPES) as [AlertType, typeof ALERT_TYPES[AlertType]][]).map(([type, meta]) => (
                <button
                  key={type}
                  onClick={() => setForm(f => ({ ...f, type }))}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold text-left transition-all duration-150 ${
                    form.type === type
                      ? `${meta.bg} ${meta.color} border-current/30`
                      : 'bg-surface border-surface-border text-muted hover:text-ink hover:bg-surface-hover'
                  }`}
                >
                  <span className={form.type === type ? meta.color : 'text-muted'}>{meta.icon}</span>
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional fields */}
          {form.type === 'new_in_city' && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">City</p>
              <div className="flex flex-wrap gap-2">
                {QC_CITIES.map(city => (
                  <button
                    key={city}
                    onClick={() => setForm(f => ({ ...f, city }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
                      form.city === city
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface border-surface-border text-muted hover:text-ink'
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
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Minimum AI score: <span className="text-accent font-mono">{form.scoreMin}</span>/100
              </p>
              <input
                type="range"
                min={50} max={95} step={5}
                value={form.scoreMin}
                onChange={e => setForm(f => ({ ...f, scoreMin: +e.target.value }))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>50 (Good)</span>
                <span>70 (Great)</span>
                <span>80+ (Best)</span>
              </div>
            </div>
          )}

          {form.type === 'price_drop' && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Max price</p>
              <input
                type="number"
                value={form.priceMax}
                onChange={e => setForm(f => ({ ...f, priceMax: +e.target.value }))}
                className="input max-w-xs"
                placeholder="1000000"
                step={50000}
              />
              <p className="text-xs text-muted mt-1">Only alert when price drops on properties under this value</p>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-surface-border">
            <button onClick={addRule} className="btn-primary">
              <Check size={14} /> Save Alert
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {rules.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="text-score-strong font-semibold">{activeCount} active</span>
          {inactiveCount > 0 && <span className="text-muted">{inactiveCount} paused</span>}
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="card py-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <Bell size={24} className="text-accent" />
          </div>
          <div>
            <p className="font-bold text-ink">No alerts yet</p>
            <p className="text-sm text-muted mt-1">
              Create an alert to get notified when new deals match your criteria
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary mx-auto">
            <Plus size={14} /> Create your first alert
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const meta = ALERT_TYPES[rule.type]
            return (
              <div
                key={rule.id}
                className={`card flex items-center gap-4 transition-all duration-150 ${!rule.active ? 'opacity-50' : ''}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                  <span className={meta.color}>{meta.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink text-sm">{rule.label}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="text-xs text-muted">
                      Created {new Date(rule.createdAt).toLocaleDateString('en-CA')}
                    </span>
                    {rule.matchCount > 0 && (
                      <span className="text-xs text-muted">{rule.matchCount} matches</span>
                    )}
                  </div>
                </div>

                {/* Quick filter link */}
                <Link
                  to={
                    rule.type === 'new_listing'     ? '/properties?sort_by=newest' :
                    rule.type === 'price_drop'      ? '/properties?status=price_changed' :
                    rule.type === 'score_threshold' ? `/properties?score_min=${rule.scoreMin ?? 70}&sort_by=score` :
                    rule.type === 'new_in_city'     ? `/properties?city=${encodeURIComponent(rule.city ?? '')}&sort_by=newest` :
                    '/properties'
                  }
                  className="text-xs text-accent hover:underline flex items-center gap-0.5 shrink-0 font-medium"
                >
                  View matches <ChevronRight size={12} />
                </Link>

                {/* Toggle */}
                <button
                  onClick={() => toggleRule(rule.id)}
                  className={`w-10 h-6 rounded-full transition-all duration-200 shrink-0 relative ${
                    rule.active ? 'bg-score-strong' : 'bg-surface-border'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                    rule.active ? 'left-5' : 'left-1'
                  }`} />
                </button>

                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-muted hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Tips */}
      <div className="card space-y-3">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">Tips</p>
        <div className="space-y-2 text-sm text-muted">
          <p>• <span className="text-ink font-medium">Best deals (80+)</span> — AI scores above 80 are rare, set an alert to catch them fast</p>
          <p>• <span className="text-ink font-medium">Price drops</span> — Sellers who drop once often drop again, good negotiation signal</p>
          <p>• <span className="text-ink font-medium">New in city</span> — Track specific neighborhoods you care about</p>
          <p>• SMS alerts coming soon — configure your phone number in Settings</p>
        </div>
      </div>
    </div>
  )
}
