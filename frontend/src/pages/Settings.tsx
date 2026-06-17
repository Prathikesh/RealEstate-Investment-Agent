import { useState } from 'react'
import {
  Bell, MapPin, Home, TrendingUp, Globe, CheckCircle2,
  Smartphone, MessageCircle, Wrench, Layers, Building2,
  Mail, SlidersHorizontal,
} from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'

const PROPERTY_TYPES = [
  { value: 'duplex',          label: 'Duplex',        sub: '2 units' },
  { value: 'triplex',         label: 'Triplex',       sub: '3 units' },
  { value: 'quadruplex',      label: 'Quadruplex',    sub: '4 units' },
  { value: 'quintuplex_plus', label: 'Quintuplex+',   sub: '5+ units' },
  { value: 'single_family',   label: 'Single Family', sub: 'house' },
  { value: 'condo',           label: 'Condo',         sub: 'apartment' },
]

const STRATEGIES = [
  {
    value: 'buy_and_hold',
    icon: TrendingUp,
    label: 'Buy & Hold',
    desc: 'Monthly rental income from tenants',
  },
  {
    value: 'buy_fix_sell',
    icon: Wrench,
    label: 'Flip (Fix & Sell)',
    desc: 'Buy cheap, renovate, sell for profit',
  },
  {
    value: 'both',
    icon: Layers,
    label: 'Both Strategies',
    desc: 'Any deal that makes financial sense',
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

  const [city, setCity]                     = useState('')
  const [radius, setRadius]                 = useState(25)
  const [selectedTypes, setSelectedTypes]   = useState<string[]>(['triplex', 'quadruplex', 'duplex'])
  const [strategy, setStrategy]             = useState('both')
  const [budget, setBudget]                 = useState('300000-750000')
  const [minScore, setMinScore]             = useState(60)
  const [emailAlerts, setEmailAlerts]       = useState(true)
  const [smsAlerts, setSmsAlerts]           = useState(false)
  const [whatsappAlerts, setWhatsappAlerts] = useState(false)
  const [phoneNumber, setPhoneNumber]       = useState('')
  const [newListingAlerts, setNewListingAlerts] = useState(true)
  const [priceDropAlerts, setPriceDropAlerts]   = useState(true)
  const [saved, setSaved]                   = useState(false)

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
    <div className="p-6 space-y-6 animate-slide-up">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('settings_title')}</h1>
          <p className="text-sm text-muted mt-0.5">Customize your investment search preferences and alert delivery.</p>
        </div>
        <button
          onClick={handleSave}
          className="btn-primary shrink-0"
        >
          {saved
            ? <><CheckCircle2 size={15} /> Saved!</>
            : 'Save preferences'
          }
        </button>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

        {/* LEFT: Investment preferences (takes 2/3) */}
        <div className="xl:col-span-2 space-y-5">

          {/* Location */}
          <SectionCard title="Search Location" icon={<MapPin size={14} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">Target city</span>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="e.g. Montréal, Laval, Québec City"
                  className="input"
                />
              </label>
              <label className="block">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">Search radius</span>
                  <span className="text-sm font-bold font-mono text-accent">{radius} km</span>
                </div>
                <input
                  type="range" min={5} max={100} step={5}
                  value={radius}
                  onChange={e => setRadius(Number(e.target.value))}
                  className="w-full accent-accent mt-1"
                />
                <div className="flex justify-between text-[10px] text-muted mt-1.5">
                  <span>5 km</span><span>50 km</span><span>100 km</span>
                </div>
              </label>
            </div>
          </SectionCard>

          {/* Budget */}
          <SectionCard title="Budget Range" icon={<TrendingUp size={14} />}>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {BUDGET_RANGES.map(b => (
                <button
                  key={b.value}
                  onClick={() => setBudget(b.value)}
                  className={clsx(
                    'px-3 py-2.5 rounded-xl border text-xs font-semibold text-center transition-all',
                    budget === b.value
                      ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/20'
                      : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink bg-white',
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Property types */}
          <SectionCard title="Property Types" icon={<Building2 size={14} />}>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map(tp => (
                <button
                  key={tp.value}
                  onClick={() => toggleType(tp.value)}
                  className={clsx(
                    'px-4 py-2.5 rounded-xl border text-sm font-medium transition-all text-left',
                    selectedTypes.includes(tp.value)
                      ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                      : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-ink',
                  )}
                >
                  <span className="block font-semibold">{tp.label}</span>
                  <span className="text-[10px] font-normal opacity-60">{tp.sub}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Investment strategy */}
          <SectionCard title="Investment Goal" icon={<Home size={14} />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {STRATEGIES.map(s => {
                const Icon = s.icon
                const active = strategy === s.value
                return (
                  <button
                    key={s.value}
                    onClick={() => setStrategy(s.value)}
                    className={clsx(
                      'p-4 rounded-xl border text-left transition-all',
                      active
                        ? 'border-accent bg-accent/8 ring-1 ring-accent/25'
                        : 'border-surface-border bg-white hover:border-accent/40 hover:bg-surface-hover',
                    )}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center mb-3',
                      active ? 'bg-accent/15' : 'bg-surface',
                    )}>
                      <Icon size={16} className={active ? 'text-accent' : 'text-muted'} />
                    </div>
                    <p className="text-sm font-bold text-ink">{s.label}</p>
                    <p className="text-xs text-muted mt-1 leading-snug">{s.desc}</p>
                  </button>
                )
              })}
            </div>
          </SectionCard>
        </div>

        {/* RIGHT: Alerts + Language (1/3) */}
        <div className="space-y-5">

          {/* Alert triggers */}
          <SectionCard title="Alert Triggers" icon={<Bell size={14} />}>
            <div className="space-y-4">
              <div className="space-y-2.5">
                <ToggleRow
                  label="New listings"
                  sub="When a property matching your criteria appears"
                  value={newListingAlerts}
                  onChange={setNewListingAlerts}
                />
                <ToggleRow
                  label="Price drops"
                  sub="When any listing price goes down"
                  value={priceDropAlerts}
                  onChange={setPriceDropAlerts}
                />
              </div>

              <div className="pt-2 border-t border-surface-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">Min deal quality</span>
                  <span className="text-sm font-bold font-mono text-accent">{minScore}/100</span>
                </div>
                <input
                  type="range" min={40} max={90} step={5}
                  value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-[10px] text-muted mt-1.5">
                  <span>Any</span><span>Good</span><span>Top</span><span>Best</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Delivery channels */}
          <SectionCard title="Delivery Channels" icon={<SlidersHorizontal size={14} />}>
            <div className="space-y-4">
              <ToggleRow
                label="Email alerts"
                sub="Daily digest + instant alerts"
                value={emailAlerts}
                onChange={setEmailAlerts}
                icon={<Mail size={14} className="text-accent" />}
              />

              <div className="pt-3 border-t border-surface-border space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">Phone number</span>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 py-2 border border-surface-border bg-surface rounded-xl text-sm text-muted shrink-0">
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
                </label>

                <ToggleRow
                  label="SMS"
                  sub="Works on any phone"
                  value={smsAlerts}
                  onChange={setSmsAlerts}
                  icon={<Smartphone size={14} className="text-muted" />}
                />
                <ToggleRow
                  label="WhatsApp"
                  sub="Rich messages with photos"
                  value={whatsappAlerts}
                  onChange={setWhatsappAlerts}
                  icon={<MessageCircle size={14} className="text-green-500" />}
                />

                {(smsAlerts || whatsappAlerts) && !phoneNumber && (
                  <p className="text-xs text-score-market bg-score-market/10 border border-score-market/30 rounded-lg px-3 py-2">
                    Enter a phone number above to activate.
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Language */}
          <SectionCard title="Language" icon={<Globe size={14} />}>
            <div className="grid grid-cols-2 gap-2">
              {(['fr', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={clsx(
                    'py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    lang === l
                      ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                      : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink bg-white',
                  )}
                >
                  {l === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <p className="text-xs text-muted/50 text-center pb-2">
        Preferences will sync to your account once authentication is enabled.
      </p>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-surface-border">
        <span className="text-muted">{icon}</span>
        <h2 className="text-sm font-bold text-ink">{title}</h2>
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
          <p className="text-sm font-semibold text-ink leading-tight">{label}</p>
          <p className="text-xs text-muted leading-snug mt-0.5">{sub}</p>
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
