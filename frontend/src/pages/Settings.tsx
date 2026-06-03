import { useState } from 'react'
import { Bell, MapPin, Home, TrendingUp, Globe, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'

const PROPERTY_TYPES = [
  { value: 'duplex',          label: 'Duplex' },
  { value: 'triplex',         label: 'Triplex' },
  { value: 'quadruplex',      label: 'Quadruplex' },
  { value: 'quintuplex_plus', label: 'Quintuplex+' },
  { value: 'single_family',   label: 'Single Family' },
  { value: 'condo',           label: 'Condo' },
]

const STRATEGIES = [
  {
    value: 'buy_and_hold',
    icon: '🏦',
    label: 'Buy & Hold',
    desc: 'Properties with strong monthly cash flow',
  },
  {
    value: 'buy_fix_sell',
    icon: '🔨',
    label: 'Buy, Fix & Sell',
    desc: 'Undervalued properties with flip potential',
  },
  {
    value: 'both',
    icon: '⚖️',
    label: 'Both',
    desc: 'Show me everything worth investigating',
  },
]

export default function Settings() {
  const { t, lang, setLang } = useLang()

  // Local state (not yet wired to API — requires auth)
  const [city, setCity] = useState('')
  const [radius, setRadius] = useState(25)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['triplex', 'quadruplex', 'duplex'])
  const [strategy, setStrategy] = useState('both')
  const [minScore, setMinScore] = useState(60)
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [saved, setSaved] = useState(false)

  function toggleType(v: string) {
    setSelectedTypes(prev =>
      prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]
    )
  }

  function handleSave() {
    // TODO: PUT /api/brokers/:id with preferences
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">{t('settings_title')}</h1>
        <p className="text-sm text-muted mt-0.5">{t('settings_subtitle')}</p>
      </div>

      {/* ── Location ──────────────────────────────────────────────────── */}
      <Section title="Location" icon={<MapPin size={15} />}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-muted block mb-1.5">City</span>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Montréal"
              className="input"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted">Search radius</span>
              <span className="text-xs font-mono text-slate-300">{radius} km</span>
            </div>
            <input
              type="range" min={5} max={100} step={5}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-muted/60 mt-1">
              <span>5 km</span><span>100 km</span>
            </div>
          </label>
        </div>
      </Section>

      {/* ── Property types ────────────────────────────────────────────── */}
      <Section title="Property Types" icon={<Home size={15} />}>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map(tp => (
            <button
              key={tp.value}
              onClick={() => toggleType(tp.value)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                selectedTypes.includes(tp.value)
                  ? 'bg-accent/15 text-accent border-accent/40'
                  : 'bg-surface-hover text-muted border-surface-border hover:border-slate-500',
              )}
            >
              {tp.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Strategy ─────────────────────────────────────────────────── */}
      <Section title="Investment Strategy" icon={<TrendingUp size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STRATEGIES.map(s => (
            <button
              key={s.value}
              onClick={() => setStrategy(s.value)}
              className={clsx(
                'p-4 rounded-xl border text-left transition-all',
                strategy === s.value
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                  : 'border-surface-border bg-surface-hover hover:border-slate-500',
              )}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-sm font-semibold text-slate-200">{s.label}</p>
              <p className="text-xs text-muted mt-0.5 leading-snug">{s.desc}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Notifications ─────────────────────────────────────────────── */}
      <Section title="Notifications" icon={<Bell size={15} />}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-200">Email alerts</p>
              <p className="text-xs text-muted">Receive daily digest and instant alerts</p>
            </div>
            <button
              onClick={() => setEmailAlerts(v => !v)}
              className={clsx(
                'relative w-10 h-5.5 rounded-full transition-colors',
                emailAlerts ? 'bg-accent' : 'bg-surface-border',
              )}
              style={{ height: '22px' }}
            >
              <span className={clsx(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                emailAlerts ? 'translate-x-5' : 'translate-x-0.5',
              )} />
            </button>
          </div>

          <label className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-slate-200">Minimum score for alerts</span>
              <span className="text-sm font-mono font-bold text-accent">{minScore}</span>
            </div>
            <input
              type="range" min={40} max={90} step={5}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-muted/60 mt-1">
              <span>40 (Any deal)</span><span>90 (Top only)</span>
            </div>
          </label>
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
                  ? 'bg-accent/15 text-accent border-accent/40'
                  : 'border-surface-border text-muted hover:border-slate-500',
              )}
            >
              {l === 'fr' ? '🇨🇦 Français' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Save ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-score-strong">
            <CheckCircle2 size={14} />
            {t('settings_saved')}
          </span>
        )}
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Save preferences
        </button>
      </div>

      {/* Auth note */}
      <p className="text-xs text-muted/50 text-center pb-2">
        Preferences will sync to your account once authentication (Google OAuth) is enabled in Phase 3.
      </p>
    </div>
  )
}

function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b border-surface-border">
        <span className="text-muted">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      {children}
    </div>
  )
}
