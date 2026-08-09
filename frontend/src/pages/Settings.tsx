import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, MapPin, Home, TrendingUp, Globe, CheckCircle2, ShieldCheck,
  Smartphone, MessageCircle, Wrench, Building2, Mail, SlidersHorizontal,
  ChevronDown, Check, Search, Layers, Gauge, RotateCcw, Scale, CircleDollarSign,
} from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import { updatePreferences, type PreferencesPayload, type User } from '../auth/api'
import {
  SCORE_FACTORS, STRATEGY_WEIGHTS, FACTOR_LABEL,
  type ScoreFactor, type ScoreWeights,
} from '../lib/verdict'

// Short investor-facing descriptions for each scoring factor (My Scoring Criteria).
const FACTOR_DESC: Record<ScoreFactor, string> = {
  discount:      'How far below comparable sales it is priced',
  cap_rate:      'Annual return — net income vs. purchase price',
  cash_flow:     'Monthly profit after mortgage, taxes & expenses',
  grm:           'Price relative to gross rent (lower is better)',
  confidence:    'How much comparable data backs the numbers',
  dom_bonus:     'Days on market — longer means more leverage',
  price_history: 'Past price cuts signal a motivated seller',
}

// Distinct colour per factor — ties the weight donut to its slider row.
const FACTOR_COLOR: Record<ScoreFactor, string> = {
  discount:      '#2563EB',
  cap_rate:      '#0EA5E9',
  cash_flow:     '#10B981',
  grm:           '#8B5CF6',
  confidence:    '#F59E0B',
  dom_bonus:     '#EC4899',
  price_history: '#64748B',
}

// One-tap starting points. The three strategy presets mirror the backend's
// weight sets; "Cash-flow" is an income-first tilt for buy-and-hold investors.
const WEIGHT_PRESETS: { id: string; label: string; icon: typeof Scale; weights: ScoreWeights }[] = [
  { id: 'balanced', label: 'Balanced',     icon: Scale,           weights: STRATEGY_WEIGHTS.both },
  { id: 'cashflow', label: 'Cash-flow',    icon: CircleDollarSign, weights: { discount: 0.12, cap_rate: 0.28, cash_flow: 0.30, grm: 0.10, confidence: 0.08, dom_bonus: 0.07, price_history: 0.05 } },
  { id: 'income',   label: 'Buy & Hold',   icon: TrendingUp,      weights: STRATEGY_WEIGHTS.buy_and_hold },
  { id: 'value',    label: 'Value / Flip', icon: Wrench,          weights: STRATEGY_WEIGHTS.buy_fix_sell },
]

// Seed slider points from stored fractional weights (×100). Points are a
// direct 0-100 percentage that always sums to exactly 100 — the last factor
// absorbs rounding drift so the invariant holds even after ×100 rounding.
function pointsFromWeights(w: ScoreWeights): Record<ScoreFactor, number> {
  const pts = {} as Record<ScoreFactor, number>
  let acc = 0
  SCORE_FACTORS.forEach((f, i) => {
    if (i === SCORE_FACTORS.length - 1) {
      pts[f] = Math.max(0, 100 - acc)
    } else {
      const v = Math.round((w[f] ?? 0) * 100)
      pts[f] = v
      acc += v
    }
  })
  return pts
}

// ── Option data ──────────────────────────────────────────────────────────────
const PROPERTY_TYPES = [
  { value: 'duplex',          label: 'Duplex',        sub: '2 units' },
  { value: 'triplex',         label: 'Triplex',       sub: '3 units' },
  { value: 'quadruplex',      label: 'Quadruplex',    sub: '4 units' },
  { value: 'quintuplex_plus', label: 'Quintuplex+',   sub: '5+ units' },
  { value: 'single_family',   label: 'Single Family', sub: 'house' },
  { value: 'condo',           label: 'Condo',         sub: 'apartment' },
]

const GOALS = [
  { value: 'buy_and_hold', icon: TrendingUp, label: 'Buy & Hold',        desc: 'Monthly rental income from tenants' },
  { value: 'buy_fix_sell', icon: Wrench,     label: 'Flip (Fix & Sell)', desc: 'Buy cheap, renovate, sell for profit' },
]

const BUDGETS = [
  { value: '0-300000',       label: 'Under $300K',   min: undefined, max: 300000 },
  { value: '300000-500000',  label: '$300K – $500K', min: 300000,    max: 500000 },
  { value: '500000-750000',  label: '$500K – $750K', min: 500000,    max: 750000 },
  { value: '750000-1000000', label: '$750K – $1M',   min: 750000,    max: 1000000 },
  { value: '1000000+',       label: 'Over $1M',      min: 1000000,   max: undefined },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const digits = (s: string) => s.replace(/\D/g, '')
const DELIVERY_KEY = 'plexa.delivery'

// account price range -> budget bucket, and back
function bucketFromRange(min?: number | null, max?: number | null): string {
  const b = BUDGETS.find(x => (x.min ?? null) === (min ?? null) && (x.max ?? null) === (max ?? null))
  return b?.value ?? ''
}
function goalsFromStrategy(s?: string | null): string[] {
  if (s === 'buy_and_hold') return ['buy_and_hold']
  if (s === 'buy_fix_sell') return ['buy_fix_sell']
  return ['buy_and_hold', 'buy_fix_sell'] // "both" or unset
}
function strategyFromGoals(g: string[]): 'buy_and_hold' | 'buy_fix_sell' | 'both' {
  const hold = g.includes('buy_and_hold'), flip = g.includes('buy_fix_sell')
  if (hold && !flip) return 'buy_and_hold'
  if (flip && !hold) return 'buy_fix_sell'
  return 'both'
}
function loadDelivery() {
  try { return JSON.parse(localStorage.getItem(DELIVERY_KEY) || '{}') } catch { return {} }
}

export default function Settings() {
  const { user, setUser } = useAuth()
  const { lang, setLang } = useLang()
  const navigate = useNavigate()

  // ── State, seeded from the account ──
  const d0 = loadDelivery()
  const [city, setCity]               = useState(user?.location_city ?? '')
  const [radius, setRadius]           = useState(user?.location_radius_km ?? 25)
  const [budget, setBudget]           = useState(bucketFromRange(user?.price_min, user?.price_max))
  const [types, setTypes]             = useState<string[]>(user?.property_types ?? ['triplex', 'duplex'])
  const [goals, setGoals]             = useState<string[]>(goalsFromStrategy(user?.investment_strategy))
  const [minScore, setMinScore]       = useState(user?.min_score_for_alert ?? 60)
  const [emailAlerts, setEmailAlerts] = useState(user?.email_alerts_enabled ?? true)
  // Custom scoring weights → "Your Verdict". Points are relative (0-100 each);
  // normalized to fractions summing to 1.0 on save. Seeded from the user's saved
  // custom weights, else their strategy preset.
  const [weightPoints, setWeightPoints] = useState<Record<ScoreFactor, number>>(
    pointsFromWeights(user?.custom_score_weights ?? STRATEGY_WEIGHTS[user?.investment_strategy ?? 'both']),
  )
  // delivery/trigger extras — local until the alert engine + fields land server-side
  const [newListings, setNewListings]     = useState<boolean>(d0.newListings ?? true)
  const [priceDrops, setPriceDrops]       = useState<boolean>(d0.priceDrops ?? true)
  const [smsAlerts, setSmsAlerts]         = useState<boolean>(d0.smsAlerts ?? false)
  const [whatsappAlerts, setWhatsapp]     = useState<boolean>(d0.whatsappAlerts ?? false)
  const [phone, setPhone]                 = useState<string>(d0.phone ?? '')
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)

  // Re-seed if the account arrives/changes after mount.
  useEffect(() => {
    if (!user) return
    setCity(user.location_city ?? '')
    setRadius(user.location_radius_km ?? 25)
    setBudget(bucketFromRange(user.price_min, user.price_max))
    setTypes(user.property_types ?? ['triplex', 'duplex'])
    setGoals(goalsFromStrategy(user.investment_strategy))
    setMinScore(user.min_score_for_alert ?? 60)
    setEmailAlerts(user.email_alerts_enabled ?? true)
    setWeightPoints(pointsFromWeights(user.custom_score_weights ?? STRATEGY_WEIGHTS[user.investment_strategy ?? 'both']))
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // weightPoints IS the displayed percentage — it always sums to exactly 100,
  // so the slider position and the label next to it are the same number.
  // Used directly by the donut and preset-matching.
  const pctMap = weightPoints
  // Highlight whichever preset the current mix matches (±1pt), else "Custom".
  const activePreset = WEIGHT_PRESETS.find(p =>
    SCORE_FACTORS.every(f => Math.abs(pctMap[f] - Math.round((p.weights[f] ?? 0) * 100)) <= 1),
  )?.id ?? null

  function applyPreset(weights: ScoreWeights) {
    setWeightPoints(pointsFromWeights(weights))
  }
  function resetWeightsToStrategy() {
    setWeightPoints(pointsFromWeights(STRATEGY_WEIGHTS[strategyFromGoals(goals)]))
  }

  // Drag factor `f` to `nextValue` (0-100): it takes that exact share, and the
  // remaining 100-nextValue is redistributed across the other 6 factors in
  // proportion to their current relative weights (so an existing tilt is
  // preserved, just rescaled) — never just re-normalized after the fact. This
  // is what keeps the slider position and its displayed % identical, and keeps
  // every value on the track reachable (no dead zones from a drifting total).
  function adjustWeight(f: ScoreFactor, nextValue: number) {
    setWeightPoints(prev => {
      const P = Math.max(0, Math.min(100, Math.round(nextValue)))
      const others = SCORE_FACTORS.filter(x => x !== f)
      const remainder = 100 - P
      const othersTotal = others.reduce((s, x) => s + prev[x], 0)
      const next = { ...prev, [f]: P }
      let acc = 0
      others.forEach((x, i) => {
        const isLast = i === others.length - 1
        if (isLast) {
          next[x] = Math.max(0, remainder - acc)
        } else {
          const share = othersTotal > 0 ? prev[x] / othersTotal : 1 / others.length
          const v = Math.round(share * remainder)
          next[x] = v
          acc += v
        }
      })
      return next
    })
  }

  const phoneNeeded = (smsAlerts || whatsappAlerts) && digits(phone).length < 10
  const emailValid = !emailAlerts || (user?.email ? EMAIL_RE.test(user.email) : false)
  const canSave = !phoneNeeded && emailValid

  function toggleType(v: string) {
    setTypes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  }

  // Convert the slider points (already 0-100, summing to exactly 100) to
  // fractions summing to 1.0, as the backend requires (see auth/routes.py
  // custom_score_weights validation). The last factor absorbs rounding drift
  // so the sum is exactly 1.0.
  function normalizedWeights(): ScoreWeights {
    const w = {} as ScoreWeights
    let acc = 0
    SCORE_FACTORS.forEach((f, i) => {
      if (i === SCORE_FACTORS.length - 1) {
        w[f] = Math.round((1 - acc) * 1000) / 1000
      } else {
        const v = Math.round((weightPoints[f] / 100) * 1000) / 1000
        w[f] = v
        acc += v
      }
    })
    return w
  }

  function accountPayload(): PreferencesPayload {
    const b = BUDGETS.find(x => x.value === budget)
    return {
      location_city: city.trim() || null,
      location_radius_km: radius,
      price_min: b?.min ?? null,
      price_max: b?.max ?? null,
      property_types: types,
      investment_strategy: strategyFromGoals(goals),
      min_score_for_alert: minScore,
      email_alerts_enabled: emailAlerts,
      language: lang,
      custom_score_weights: normalizedWeights(),
    }
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const updated = await updatePreferences(accountPayload())
      setUser(updated as User)
      localStorage.setItem(DELIVERY_KEY, JSON.stringify({ newListings, priceDrops, smsAlerts, whatsappAlerts, phone }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      /* surfaced below via disabled state; keep simple */
    } finally {
      setSaving(false)
    }
  }

  function applyToSearch() {
    // Browse filter = location + budget + type. Min deal quality is an ALERT
    // threshold (not a browse filter), so it's intentionally left out here.
    const b = BUDGETS.find(x => x.value === budget)
    const p = new URLSearchParams()
    if (city.trim()) p.set('city', city.trim())
    if (b?.min != null) p.set('price_min', String(b.min))
    if (b?.max != null) p.set('price_max', String(b.max))
    if (types.length === 1) p.set('property_type', types[0])
    navigate(p.toString() ? `/properties?${p}` : '/properties')
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-slide-up">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Settings</h1>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-score-strong" />
            Your investment preferences, saved to your account.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={applyToSearch} className="btn-ghost" title="Open the Properties list filtered by these preferences">
            <Search size={15} /> Apply to search
          </button>
          <button onClick={handleSave} disabled={!canSave || saving} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed min-w-[150px] justify-center">
            {saved ? <><CheckCircle2 size={15} /> Saved</> : saving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* LEFT — investment preferences */}
        <div className="xl:col-span-2 space-y-5">
          <SectionCard icon={<MapPin size={15} />} title="Search location" desc="Where you're hunting for deals.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block">
                <span className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Target city</span>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Montréal, Laval, Québec City" className="input" />
              </label>
              <label className="block">
                <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-muted uppercase tracking-wider">Search radius</span><span className="text-sm font-bold font-mono text-accent">{radius} km</span></div>
                <input type="range" min={5} max={100} step={5} value={radius} onChange={e => setRadius(Number(e.target.value))} className="w-full accent-accent" />
                <div className="flex justify-between text-[10px] text-muted mt-1.5"><span>5 km</span><span>50 km</span><span>100 km</span></div>
              </label>
            </div>
          </SectionCard>

          <SectionCard icon={<TrendingUp size={15} />} title="Budget range" desc="The price band you invest in.">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {BUDGETS.map(b => (
                <button key={b.value} onClick={() => setBudget(budget === b.value ? '' : b.value)}
                  className={clsx('px-3 py-2.5 rounded-xl border text-xs font-semibold text-center transition-all',
                    budget === b.value ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/20' : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink bg-white')}>
                  {b.label}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard icon={<Building2 size={15} />} title="Property types" desc="Pick every type you'd consider.">
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map(tp => (
                <button key={tp.value} onClick={() => toggleType(tp.value)}
                  className={clsx('px-4 py-2.5 rounded-xl border text-sm transition-all text-left',
                    types.includes(tp.value) ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20' : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-ink')}>
                  <span className="block font-semibold">{tp.label}</span>
                  <span className="text-[10px] font-normal opacity-60">{tp.sub}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard icon={<Home size={15} />} title="Investment goal" desc="Choose one or more strategies.">
            <GoalDropdown selected={goals} onChange={setGoals} />
          </SectionCard>

        </div>

        {/* RIGHT — alerts + language */}
        <div className="space-y-5">
          <SectionCard icon={<Bell size={15} />} title="Alert triggers" desc="What should trigger a notification.">
            <div className="space-y-2.5">
              <ToggleRow label="New listings" sub="A property matching your criteria appears" value={newListings} onChange={setNewListings} />
              <ToggleRow label="Price drops" sub="A listing you'd want drops in price" value={priceDrops} onChange={setPriceDrops} />
            </div>
            <div className="pt-4 mt-2 border-t border-surface-border">
              <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-muted uppercase tracking-wider">Min deal quality</span><span className="text-sm font-bold font-mono text-accent">{minScore}/100</span></div>
              <input type="range" min={40} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="w-full accent-accent" />
              <div className="flex justify-between text-[10px] text-muted mt-1.5"><span>Any</span><span>Good</span><span>Top</span><span>Best</span></div>
            </div>
          </SectionCard>

          <SectionCard icon={<SlidersHorizontal size={15} />} title="Delivery channels" desc="How we reach you.">
            <div className="space-y-4">
              <ToggleRow label="Email alerts" sub={user?.email ? `Sent to ${user.email}` : 'Sent to your account email'} value={emailAlerts} onChange={setEmailAlerts} icon={<Mail size={14} className="text-accent" />} />

              <div className="pt-3 border-t border-surface-border space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Layers size={12} /> SMS &amp; WhatsApp
                  <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">Coming soon</span>
                </div>
                <label className="block">
                  <span className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Phone number</span>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 py-2 border border-surface-border bg-surface rounded-xl text-sm text-muted shrink-0">+1</div>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="514-555-1234" className="input flex-1" />
                  </div>
                </label>
                <ToggleRow label="SMS" sub="Works on any phone" value={smsAlerts} onChange={setSmsAlerts} icon={<Smartphone size={14} className="text-muted" />} />
                <ToggleRow label="WhatsApp" sub="Rich messages with photos" value={whatsappAlerts} onChange={setWhatsapp} icon={<MessageCircle size={14} className="text-green-500" />} />
                {phoneNeeded && <p className="text-xs text-score-market bg-score-market/10 border border-score-market/30 rounded-lg px-3 py-2">Enter a valid phone number to enable SMS/WhatsApp.</p>}
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<Globe size={15} />} title="Language" desc="Interface language.">
            <div className="grid grid-cols-2 gap-2">
              {(['fr', 'en'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={clsx('py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    lang === l ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20' : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink bg-white')}>
                  {l === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Full-width — My Scoring Criteria (donut + sliders need the room) */}
      <div className="mt-5">
        <SectionCard
          icon={<Gauge size={15} />}
          title="My Scoring Criteria"
          desc="Weight the factors behind your own verdict. Every property shows your score next to the AI's."
        >
          {/* Preset chips — one tap to start, then fine-tune below */}
          <div className="flex flex-wrap items-center gap-2">
            {WEIGHT_PRESETS.map(p => {
              const Icon = p.icon
              const active = activePreset === p.id
              return (
                <button
                  key={p.id} type="button" onClick={() => applyPreset(p.weights)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all',
                    active ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                           : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-ink',
                  )}
                >
                  <Icon size={13} /> {p.label}
                </button>
              )
            })}
            <span className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold',
              activePreset === null ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                                    : 'border-dashed border-surface-border text-muted/70',
            )}>
              <SlidersHorizontal size={13} /> Custom
            </span>
            <button
              type="button" onClick={resetWeightsToStrategy}
              className="btn-ghost text-xs ml-auto" title="Reset to your strategy's default mix"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>

          {/* Donut + sliders */}
          <div className="flex flex-col lg:flex-row gap-8 pt-4">
            {/* Weight distribution donut */}
            <div className="flex lg:flex-col items-center gap-4 shrink-0 mx-auto lg:mx-0">
              <WeightDonut pct={pctMap} />
              <div className="text-center">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Your mix</p>
                <p className="text-[11px] text-muted mt-0.5 max-w-[140px]">
                  Relative weight of each factor in your verdict.
                </p>
              </div>
            </div>

            {/* Sliders — two columns on wide screens now that it's full-width */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3.5 min-w-0 content-start">
              {SCORE_FACTORS.map(f => (
                <div key={f}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="min-w-0 flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: FACTOR_COLOR[f] }} />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-ink">{FACTOR_LABEL[f]}</span>
                        <span className="block text-[11px] text-muted leading-snug">{FACTOR_DESC[f]}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono shrink-0 tabular-nums w-11 text-right" style={{ color: FACTOR_COLOR[f] }}>
                      {weightPoints[f]}%
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={weightPoints[f]}
                    onChange={e => adjustWeight(f, Number(e.target.value))}
                    aria-label={`${FACTOR_LABEL[f]} weight`}
                    className="w-full"
                    style={{ accentColor: FACTOR_COLOR[f] }}
                  />
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

// ── Weight distribution donut ─────────────────────────────────────────────────
// Inline SVG (no chart lib): one arc segment per factor, coloured to match its
// slider row, sized to its share of the total.
function WeightDonut({ pct }: { pct: Record<ScoreFactor, number> }) {
  const size = 160, stroke = 24
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const top = [...SCORE_FACTORS].sort((a, b) => (pct[b] ?? 0) - (pct[a] ?? 0))[0]
  let offset = 0
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
          {SCORE_FACTORS.map(f => {
            const len = ((pct[f] ?? 0) / 100) * C
            const seg = (
              <circle
                key={f} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={FACTOR_COLOR[f]} strokeWidth={stroke}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
              />
            )
            offset += len
            return seg
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Top factor</span>
        <span className="text-xs font-bold text-ink leading-tight mt-0.5">{FACTOR_LABEL[top]}</span>
        <span className="text-sm font-black font-mono" style={{ color: FACTOR_COLOR[top] }}>{pct[top]}%</span>
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, desc, icon, children }: { title: string; desc?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-3 pb-3 border-b border-surface-border">
        <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-0.5">{icon}</span>
        <div>
          <h2 className="text-sm font-bold text-ink leading-tight">{title}</h2>
          {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({ label, sub, value, onChange, icon }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-2 min-w-0">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0"><p className="text-sm font-semibold text-ink leading-tight">{label}</p><p className="text-xs text-muted leading-snug mt-0.5">{sub}</p></div>
      </div>
      <button onClick={() => onChange(!value)} role="switch" aria-checked={value}
        className={clsx('inline-flex shrink-0 items-center w-11 h-6 rounded-full px-0.5 transition-colors duration-200', value ? 'bg-accent' : 'bg-surface-border')}>
        <span className={clsx('inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200', value ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  )
}

// ── Investment-goal multi-select dropdown ─────────────────────────────────────
function GoalDropdown({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const summary = selected.length === 0 ? 'Select one or more goals…' : GOALS.filter(g => selected.includes(g.value)).map(g => g.label).join(', ')
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-surface-border bg-white text-left hover:border-accent/40 transition-colors">
        <span className={clsx('text-sm truncate', selected.length ? 'text-ink font-medium' : 'text-muted')}>{summary}</span>
        <ChevronDown size={16} className={clsx('text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-surface-border bg-white shadow-lg overflow-hidden" role="listbox">
          {GOALS.map(g => {
            const Icon = g.icon, active = selected.includes(g.value)
            return (
              <button key={g.value} type="button" onClick={() => toggle(g.value)} role="option" aria-selected={active}
                className={clsx('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-accent/8' : 'hover:bg-surface-hover')}>
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', active ? 'bg-accent/15' : 'bg-surface')}><Icon size={16} className={active ? 'text-accent' : 'text-muted'} /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{g.label}</p><p className="text-xs text-muted leading-snug">{g.desc}</p></div>
                <span className={clsx('w-5 h-5 rounded-md border flex items-center justify-center shrink-0', active ? 'bg-accent border-accent' : 'border-surface-border')}>{active && <Check size={13} className="text-white" />}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
