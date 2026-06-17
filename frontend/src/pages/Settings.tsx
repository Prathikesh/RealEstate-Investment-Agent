import { useState } from 'react'
import { Bell, MapPin, Home, TrendingUp, Globe, CheckCircle2, Smartphone, MessageCircle } from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'

const PROPERTY_TYPES = [
  { value: 'duplex',          label: 'Duplex', sub: '2 units' },
  { value: 'triplex',         label: 'Triplex', sub: '3 units' },
  { value: 'quadruplex',      label: 'Quadruplex', sub: '4 units' },
  { value: 'quintuplex_plus', label: 'Quintuplex+', sub: '5+ units' },
  { value: 'single_family',   label: 'Single Family', sub: 'house' },
  { value: 'condo',           label: 'Condo', sub: 'apartment' },
]

const STRATEGIES = [
  {
    value: 'buy_and_hold',
    icon: '🏦',
    label: 'Buy & Hold',
    desc: 'I want monthly rental income from tenants',
  },
  {
    value: 'buy_fix_sell',
    icon: '🔨',
    label: 'Flip (Fix & Sell)',
    desc: 'I buy cheap, renovate, then sell for profit',
  },
  {
    value: 'both',
    icon: '⚖️',
    label: 'Both strategies',
    desc: 'Show me any deal that makes financial sense',
  },
]

const BUDGET_RANGES = [
  { value: '0-300000',       label: 'Under $300K' },
  { value: '300000-500000',  label: '$300K – $500K' },
  { value: '500000-750000',  label: '$500K – $750K' },
  { value: '750000-1000000', label: '$750K – $1M' },
  { value: '1000000+',       label: 'Over $1M' },
]

export default function Settings() {
  const { t, lang, setLang } = useLang()

  const [city, setCity] = useState('')
  const [radius, setRadius] = useState(25)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['triplex', 'quadruplex', 'duplex'])
  const [strategy, setStrategy] = useState('both')
  const [budget, setBudget] = useState('300000-750000')
  const [minScore, setMinScore] = useState(60)
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [smsAlerts, setSmsAlerts] = useState(false)
  const [whatsappAlerts, setWhatsappAlerts] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [newListingAlerts, setNewListingAlerts] = useState(true)
  const [priceDropAlerts, setPriceDropAlerts] = useState(true)
  const [saved, setSaved] = useState(false)

  function toggleType(v: string) {
    setSelectedTypes(prev =>
      prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]
    )
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('settings_title')}</h1>
        <p className="text-sm text-muted mt-0.5">Customize your investment search preferences and alerts.</p>
      </div>

      {/* ── Location ──────────────────────────────────────────────────── */}
      <Section title="Search Location" icon={<MapPin size={15} />}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-ink block mb-1.5">Target city</span>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Montréal, Laval, Québec City"
              className="input"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-ink">Search radius</span>
              <span className="text-sm font-mono font-bold text-accent">{radius} km</span>
            </div>
            <input
              type="range" min={5} max={100} step={5}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>5 km (neighbourhood)</span><span>100 km (region)</span>
            </div>
          </label>
        </div>
      </Section>

      {/* ── Budget ────────────────────────────────────────────────────── */}
      <Section title="Budget Range" icon={<TrendingUp size={15} />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BUDGET_RANGES.map(b => (
            <button
              key={b.value}
              onClick={() => setBudget(b.value)}
              className={clsx(
                'px-3 py-2 rounded-lg border text-sm font-medium text-left transition-all',
                budget === b.value
                  ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/20'
                  : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Property types ────────────────────────────────────────────── */}
      <Section title="Property Types I Want" icon={<Home size={15} />}>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map(tp => (
            <button
              key={tp.value}
              onClick={() => toggleType(tp.value)}
              className={clsx(
                'px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left',
                selectedTypes.includes(tp.value)
                  ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                  : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-ink',
              )}
            >
              <span className="block">{tp.label}</span>
              <span className="text-[10px] font-normal opacity-60">{tp.sub}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Strategy ─────────────────────────────────────────────────── */}
      <Section title="My Investment Goal" icon={<TrendingUp size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STRATEGIES.map(s => (
            <button
              key={s.value}
              onClick={() => setStrategy(s.value)}
              className={clsx(
                'p-4 rounded-xl border text-left transition-all',
                strategy === s.value
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                  : 'border-surface-border bg-white hover:border-accent/40',
              )}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-sm font-semibold text-ink">{s.label}</p>
              <p className="text-xs text-muted mt-0.5 leading-snug">{s.desc}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Notifications ─────────────────────────────────────────────── */}
      <Section title="Alert Preferences" icon={<Bell size={15} />}>
        <div className="space-y-5">
          {/* What to alert on */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">What should trigger an alert?</p>
            <div className="space-y-2">
              <ToggleRow
                label="New properties matching my criteria"
                sub="Alert when a new listing appears"
                value={newListingAlerts}
                onChange={setNewListingAlerts}
              />
              <ToggleRow
                label="Price drops"
                sub="Alert when a price goes down on any listing"
                value={priceDropAlerts}
                onChange={setPriceDropAlerts}
              />
            </div>
          </div>

          {/* Min score for alerts */}
          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-ink">Minimum deal quality to alert</span>
              <span className="text-sm font-mono font-bold text-accent">{minScore}/100</span>
            </div>
            <input
              type="range" min={40} max={90} step={5}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>40 — Any deal</span>
              <span>60 — Good deals</span>
              <span>80 — Top deals</span>
              <span>90 — Best only</span>
            </div>
          </label>

          {/* Email */}
          <ToggleRow
            label="Email alerts"
            sub="Daily digest + instant alerts for top deals"
            value={emailAlerts}
            onChange={setEmailAlerts}
          />
        </div>
      </Section>

      {/* ── SMS / WhatsApp ─────────────────────────────────────────────── */}
      <Section title="SMS & WhatsApp Alerts" icon={<Smartphone size={15} />}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Get instant alerts on your phone when a great deal appears. Enter your phone number below to enable.
          </p>

          <label className="block">
            <span className="text-sm font-medium text-ink block mb-1.5">Phone number</span>
            <div className="flex gap-2">
              <div className="flex items-center px-3 py-2 border border-surface-border bg-surface rounded-lg text-sm text-muted">
                +1
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="514-555-1234"
                className="input flex-1"
              />
            </div>
            <p className="text-[10px] text-muted mt-1">Canadian & international numbers supported (+1, +33, etc.)</p>
          </label>

          <div className="space-y-3">
            <ToggleRow
              label="SMS text messages"
              sub="Standard SMS — works on any phone without internet"
              value={smsAlerts}
              onChange={setSmsAlerts}
              icon={<Smartphone size={14} className="text-muted" />}
            />
            <ToggleRow
              label="WhatsApp messages"
              sub="Rich messages with photos and details (requires WhatsApp)"
              value={whatsappAlerts}
              onChange={setWhatsappAlerts}
              icon={<MessageCircle size={14} className="text-green-500" />}
            />
          </div>

          {(smsAlerts || whatsappAlerts) && !phoneNumber && (
            <div className="flex items-center gap-2 px-3 py-2 bg-score-market/10 border border-score-market/30 rounded-lg text-xs text-score-market">
              Enter a phone number above to activate alerts.
            </div>
          )}
        </div>
      </Section>

      {/* ── Language ──────────────────────────────────────────────────── */}
      <Section title="Language" icon={<Globe size={15} />}>
        <div className="flex gap-3">
          {(['fr', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={clsx(
                'flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-all',
                lang === l
                  ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                  : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink',
              )}
            >
              {l === 'fr' ? '🇨🇦 Français' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Save ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-score-strong font-medium">
            <CheckCircle2 size={15} />
            Preferences saved!
          </span>
        )}
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors shadow"
        >
          Save preferences
        </button>
      </div>

      <p className="text-xs text-muted/50 text-center pb-2">
        Preferences will sync to your account once authentication is enabled.
      </p>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-surface-border">
        <span className="text-muted">{icon}</span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, sub, value, onChange, icon }: {
  label: string
  sub: string
  value: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-2 min-w-0">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-muted leading-snug">{sub}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          'relative shrink-0 w-10 rounded-full transition-colors duration-200',
          value ? 'bg-accent' : 'bg-surface-border',
        )}
        style={{ height: '22px' }}
        role="switch"
        aria-checked={value}
      >
        <span className={clsx(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
          value ? 'translate-x-5' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  )
}
