import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, MapPin, Home, TrendingUp, Globe, CheckCircle2, ShieldCheck,
  Smartphone, MessageCircle, Wrench, Building2, Mail, SlidersHorizontal,
  ChevronDown, Check, Search, Layers, Gauge, RotateCcw, Scale, CircleDollarSign,
  HelpCircle, X, Plus,
} from 'lucide-react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import { updatePreferences, type PreferencesPayload, type User } from '../auth/api'
import {
  SCORE_FACTORS, STRATEGY_WEIGHTS,
  type ScoreFactor, type ScoreWeights,
} from '../lib/verdict'
import { InfoModal } from '../components/InfoModal'
import { ValueSlider } from '../components/ValueSlider'
import { type BuyBox, BUYBOX_FIELDS, loadBuyBox, cacheBuyBox, cleanBuyBox } from '../lib/buybox'

// Factor → translation-key maps (labels + descriptions) for the advanced sliders
// and the buy box, so both localize. See LanguageContext factor_* / fdesc_* keys.
const FACTOR_LABEL_KEY: Record<ScoreFactor, string> = {
  discount: 'factor_discount', cap_rate: 'factor_cap_rate', cash_flow: 'factor_cash_flow',
  grm: 'factor_grm', confidence: 'factor_confidence', dom_bonus: 'factor_dom_bonus',
  price_history: 'factor_price_history',
}
const FACTOR_DESC_KEY: Record<ScoreFactor, string> = {
  discount: 'fdesc_discount', cap_rate: 'fdesc_cap_rate', cash_flow: 'fdesc_cash_flow',
  grm: 'fdesc_grm', confidence: 'fdesc_confidence', dom_bonus: 'fdesc_dom_bonus',
  price_history: 'fdesc_price_cut',
}
// Buy-box field key → translation keys (fields come from lib/buybox.ts).
const BUYBOX_LABEL_KEY: Record<string, string> = {
  cash_flow_min: 'factor_cash_flow', cap_rate_min: 'factor_cap_rate', discount_min: 'factor_discount',
  days_on_market_min: 'factor_dom_bonus', price_drop_min: 'factor_price_cut',
}
const BUYBOX_DESC_KEY: Record<string, string> = {
  cash_flow_min: 'fdesc_cash_flow', cap_rate_min: 'fdesc_cap_rate', discount_min: 'fdesc_discount',
  days_on_market_min: 'fdesc_dom_bonus', price_drop_min: 'fdesc_price_cut',
}

// The buy-box real-number targets — the client's "in numbers, not percentages"
// request, now the PRIMARY control (each factor is a real-value slider + linked
// number box, see ValueSlider). Config is shared with the Properties filter panel
// via lib/buybox.ts BUYBOX_FIELDS so the two surfaces never drift apart.

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
const WEIGHT_PRESETS: { id: string; labelKey: string; icon: typeof Scale; weights: ScoreWeights }[] = [
  { id: 'balanced', labelKey: 'preset_balanced', icon: Scale,           weights: STRATEGY_WEIGHTS.both },
  { id: 'cashflow', labelKey: 'preset_cashflow', icon: CircleDollarSign, weights: { discount: 0.12, cap_rate: 0.28, cash_flow: 0.30, grm: 0.10, confidence: 0.08, dom_bonus: 0.07, price_history: 0.05 } },
  { id: 'income',   labelKey: 'preset_buyhold',  icon: TrendingUp,      weights: STRATEGY_WEIGHTS.buy_and_hold },
  { id: 'value',    labelKey: 'preset_value',    icon: Wrench,          weights: STRATEGY_WEIGHTS.buy_fix_sell },
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
  { value: 'duplex',          labelKey: 'type_duplex',        subKey: 'units_2' },
  { value: 'triplex',         labelKey: 'type_triplex',       subKey: 'units_3' },
  { value: 'quadruplex',      labelKey: 'type_quadruplex',    subKey: 'units_4' },
  { value: 'quintuplex_plus', labelKey: 'type_quintuplex',    subKey: 'units_5plus' },
  { value: 'single_family',   labelKey: 'type_single_family', subKey: 'unit_house' },
  { value: 'condo',           labelKey: 'type_condo',         subKey: 'unit_apartment' },
]

const GOALS = [
  { value: 'buy_and_hold', icon: TrendingUp, labelKey: 'goal_hold_label', descKey: 'goal_hold_desc', infoKey: 'goal_hold_info' },
  { value: 'buy_fix_sell', icon: Wrench,     labelKey: 'goal_flip_label', descKey: 'goal_flip_desc', infoKey: 'goal_flip_info' },
]

const BUDGETS = [
  { value: '0-300000',       labelKey: 'set_budget_under',  min: undefined, max: 300000 },
  { value: '300000-500000',  labelKey: 'set_budget_300500', min: 300000,    max: 500000 },
  { value: '500000-750000',  labelKey: 'set_budget_500750', min: 500000,    max: 750000 },
  { value: '750000-1000000', labelKey: 'set_budget_7501m',  min: 750000,    max: 1000000 },
  { value: '1000000+',       labelKey: 'set_budget_over1m', min: 1000000,   max: undefined },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const digits = (s: string) => s.replace(/\D/g, '')
const DELIVERY_KEY = 'plexa.delivery'

// account price range -> budget bucket, and back. A set range that matches no
// preset resolves to the "custom" option so the exact numbers are preserved.
function bucketFromRange(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return ''
  const b = BUDGETS.find(x => (x.min ?? null) === (min ?? null) && (x.max ?? null) === (max ?? null))
  return b?.value ?? 'custom'
}
// Seed the multi-city list from the account: prefer the new location_cities list,
// fall back to the legacy single location_city.
function citiesFromUser(u?: User | null): string[] {
  if (u?.location_cities?.length) return u.location_cities
  if (u?.location_city) return [u.location_city]
  return []
}
// Common Québec target cities offered in the multi-select (users can also type
// any other city name).
const QUEBEC_CITIES = [
  'Montréal', 'Laval', 'Longueuil', 'Québec City', 'Gatineau', 'Sherbrooke',
  'Trois-Rivières', 'Brossard', 'Terrebonne', 'Saint-Jean-sur-Richelieu',
  'Lévis', 'Repentigny', 'Drummondville', 'Saint-Jérôme', 'Granby',
]
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
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()

  // ── State, seeded from the account ──
  const d0 = loadDelivery()
  const [cities, setCities]           = useState<string[]>(citiesFromUser(user))
  const [radius, setRadius]           = useState(user?.location_radius_km ?? 25)
  const [budget, setBudget]           = useState(bucketFromRange(user?.price_min, user?.price_max))
  const [customMin, setCustomMin]     = useState<number | undefined>(user?.price_min ?? undefined)
  const [customMax, setCustomMax]     = useState<number | undefined>(user?.price_max ?? undefined)
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
  // Buy-box real-number targets (client's "in numbers" request). Account-synced:
  // seed from the user's saved custom_buy_box, falling back to the localStorage
  // cache before the user object has loaded. Applied both as filters AND as the
  // target-relative scoring anchors on the Properties page.
  const [buyBox, setBuyBox] = useState<BuyBox>(user?.custom_buy_box ?? loadBuyBox())
  // delivery/trigger extras — local until the alert engine + fields land server-side
  const [newListings, setNewListings]     = useState<boolean>(d0.newListings ?? true)
  const [priceDrops, setPriceDrops]       = useState<boolean>(d0.priceDrops ?? true)
  const [smsAlerts, setSmsAlerts]         = useState<boolean>(d0.smsAlerts ?? false)
  const [whatsappAlerts, setWhatsapp]     = useState<boolean>(d0.whatsappAlerts ?? false)
  const [phone, setPhone]                 = useState<string>(d0.phone ?? '')
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [showScoringHelp, setShowScoringHelp] = useState(false)
  // Numbers-first: the weight sliders are secondary ("advanced ranking"), collapsed
  // by default so the real-number buy box leads (the client's explicit request).
  const [showWeights, setShowWeights] = useState(false)

  // Re-seed if the account arrives/changes after mount.
  useEffect(() => {
    if (!user) return
    setCities(citiesFromUser(user))
    setRadius(user.location_radius_km ?? 25)
    setBudget(bucketFromRange(user.price_min, user.price_max))
    setCustomMin(user.price_min ?? undefined)
    setCustomMax(user.price_max ?? undefined)
    setTypes(user.property_types ?? ['triplex', 'duplex'])
    setGoals(goalsFromStrategy(user.investment_strategy))
    setMinScore(user.min_score_for_alert ?? 60)
    setEmailAlerts(user.email_alerts_enabled ?? true)
    setWeightPoints(pointsFromWeights(user.custom_score_weights ?? STRATEGY_WEIGHTS[user.investment_strategy ?? 'both']))
    if (user.custom_buy_box) setBuyBox(user.custom_buy_box)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Each importance slider is INDEPENDENT (0-100) — dragging one never moves the
  // others (that live proportional redistribution was the "sliders jump / can't
  // hit a value" bug from the client's Loom). We normalize to shares only for
  // display + on save, so the handle position always equals its own value.
  const totalPoints = SCORE_FACTORS.reduce((s, f) => s + weightPoints[f], 0)
  const sharePct = (f: ScoreFactor) =>
    totalPoints > 0 ? Math.round((weightPoints[f] / totalPoints) * 100) : 0
  // Normalized share map for the donut + preset matching.
  const pctMap = Object.fromEntries(SCORE_FACTORS.map(f => [f, sharePct(f)])) as Record<ScoreFactor, number>
  // Highlight whichever preset the current mix matches (±2pt share), else "Custom".
  const activePreset = WEIGHT_PRESETS.find(p =>
    SCORE_FACTORS.every(f => Math.abs(pctMap[f] - Math.round((p.weights[f] ?? 0) * 100)) <= 2),
  )?.id ?? null

  function applyPreset(weights: ScoreWeights) {
    setWeightPoints(pointsFromWeights(weights))
  }
  function resetWeightsToStrategy() {
    setWeightPoints(pointsFromWeights(STRATEGY_WEIGHTS[strategyFromGoals(goals)]))
  }

  // Set one factor's importance directly — no redistribution, so nothing else moves.
  function adjustWeight(f: ScoreFactor, nextValue: number) {
    const P = Math.max(0, Math.min(100, Math.round(nextValue)))
    setWeightPoints(prev => ({ ...prev, [f]: P }))
  }

  const phoneNeeded = (smsAlerts || whatsappAlerts) && digits(phone).length < 10
  const emailValid = !emailAlerts || (user?.email ? EMAIL_RE.test(user.email) : false)
  const canSave = !phoneNeeded && emailValid

  function toggleType(v: string) {
    setTypes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  }

  // Convert the independent slider points to fractions summing to exactly 1.0,
  // as the backend requires (see auth/routes.py custom_score_weights validation).
  // Divide each by the running total; the last factor absorbs rounding drift.
  // If every slider is 0, fall back to the strategy preset so we never save all-zero.
  function normalizedWeights(): ScoreWeights {
    const sum = SCORE_FACTORS.reduce((s, f) => s + weightPoints[f], 0)
    if (sum <= 0) return STRATEGY_WEIGHTS[strategyFromGoals(goals)]
    const w = {} as ScoreWeights
    let acc = 0
    SCORE_FACTORS.forEach((f, i) => {
      if (i === SCORE_FACTORS.length - 1) {
        w[f] = Math.round((1 - acc) * 1000) / 1000
      } else {
        const v = Math.round((weightPoints[f] / sum) * 1000) / 1000
        w[f] = v
        acc += v
      }
    })
    return w
  }

  // Resolve the selected budget (preset bucket OR the custom min/max inputs).
  function budgetRange(): { min: number | null; max: number | null } {
    if (budget === 'custom') return { min: customMin ?? null, max: customMax ?? null }
    const b = BUDGETS.find(x => x.value === budget)
    return { min: b?.min ?? null, max: b?.max ?? null }
  }

  function accountPayload(): PreferencesPayload {
    const range = budgetRange()
    const cleanCities = cities.map(c => c.trim()).filter(Boolean)
    return {
      location_cities: cleanCities,
      location_city: cleanCities[0] ?? null,
      location_radius_km: radius,
      price_min: range.min,
      price_max: range.max,
      property_types: types,
      investment_strategy: strategyFromGoals(goals),
      min_score_for_alert: minScore,
      email_alerts_enabled: emailAlerts,
      language: lang,
      custom_score_weights: normalizedWeights(),
      custom_buy_box: cleanBuyBox(buyBox),
    }
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const updated = await updatePreferences(accountPayload())
      setUser(updated as User)
      localStorage.setItem(DELIVERY_KEY, JSON.stringify({ newListings, priceDrops, smsAlerts, whatsappAlerts, phone }))
      cacheBuyBox(buyBox)  // update the localStorage cache (account is source of truth)
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
    const range = budgetRange()
    const p = new URLSearchParams()
    // The Properties city filter is single-select; use the first chosen city.
    if (cities[0]?.trim()) p.set('city', cities[0].trim())
    if (range.min != null) p.set('price_min', String(range.min))
    if (range.max != null) p.set('price_max', String(range.max))
    if (types.length === 1) p.set('property_type', types[0])
    navigate(p.toString() ? `/properties?${p}` : '/properties')
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-slide-up">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">{t('settings')}</h1>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-score-strong" />
            {t('set_headerSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={applyToSearch} className="btn-ghost">
            <Search size={15} /> {t('set_applyToSearch')}
          </button>
          <button onClick={handleSave} disabled={!canSave || saving} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed min-w-[150px] justify-center">
            {saved ? <><CheckCircle2 size={15} /> {t('set_saved')}</> : saving ? t('set_saving') : t('set_save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <SectionCard icon={<MapPin size={15} />} title={t('set_location_title')} desc={t('set_location_desc')}>
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('set_targetCities')}</span>
                <CityMultiSelect selected={cities} onChange={setCities} />
              </div>
              <label className="block">
                <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-muted uppercase tracking-wider">{t('set_searchRadius')}</span><span className="text-sm font-bold font-mono text-accent">{radius} km</span></div>
                <input type="range" min={5} max={100} step={5} value={radius} onChange={e => setRadius(Number(e.target.value))} className="w-full accent-accent" />
                <div className="flex justify-between text-[10px] text-muted mt-1.5"><span>5 km</span><span>50 km</span><span>100 km</span></div>
              </label>
            </div>
          </SectionCard>

          <SectionCard icon={<TrendingUp size={15} />} title={t('set_budget_title')} desc={t('set_budget_desc')}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BUDGETS.map(b => (
                <button key={b.value} onClick={() => setBudget(budget === b.value ? '' : b.value)}
                  className={clsx('px-3 py-2.5 rounded-xl border text-xs font-semibold text-center transition-all',
                    budget === b.value ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/20' : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink bg-white')}>
                  {t(b.labelKey)}
                </button>
              ))}
              <button onClick={() => setBudget(budget === 'custom' ? '' : 'custom')}
                className={clsx('px-3 py-2.5 rounded-xl border text-xs font-semibold text-center transition-all',
                  budget === 'custom' ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/20' : 'border-surface-border text-muted hover:border-accent/40 hover:text-ink bg-white')}>
                {t('set_budget_custom')}
              </button>
            </div>
            {budget === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3 animate-fade-in">
                <label className="block">
                  <span className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">{t('set_minPrice')}</span>
                  <div className="flex items-center rounded-xl border border-surface-border bg-white">
                    <span className="pl-3 text-sm text-muted">$</span>
                    <input type="number" min={0} step={25000} placeholder={t('set_any')} value={customMin ?? ''}
                      onChange={e => setCustomMin(e.target.value === '' ? undefined : Number(e.target.value))}
                      className="no-spinner w-full py-2.5 px-2 text-sm text-ink tabular-nums bg-transparent focus:outline-none" />
                  </div>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">{t('set_maxPrice')}</span>
                  <div className="flex items-center rounded-xl border border-surface-border bg-white">
                    <span className="pl-3 text-sm text-muted">$</span>
                    <input type="number" min={0} step={25000} placeholder={t('set_any')} value={customMax ?? ''}
                      onChange={e => setCustomMax(e.target.value === '' ? undefined : Number(e.target.value))}
                      className="no-spinner w-full py-2.5 px-2 text-sm text-ink tabular-nums bg-transparent focus:outline-none" />
                  </div>
                </label>
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<Building2 size={15} />} title={t('set_types_title')} desc={t('set_types_desc')}>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map(tp => (
                <button key={tp.value} onClick={() => toggleType(tp.value)}
                  className={clsx('px-4 py-2.5 rounded-xl border text-sm transition-all text-left',
                    types.includes(tp.value) ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20' : 'bg-white text-muted border-surface-border hover:border-accent/40 hover:text-ink')}>
                  <span className="block font-semibold">{t(tp.labelKey)}</span>
                  <span className="text-[10px] font-normal opacity-60">{t(tp.subKey)}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard icon={<Home size={15} />} title={t('set_goal_title')} desc={t('set_goal_desc')}>
            <GoalCards selected={goals} onChange={setGoals} />
          </SectionCard>

          <SectionCard icon={<Bell size={15} />} title={t('set_alerts_title')} desc={t('set_alerts_desc')}>
            <div className="space-y-2.5">
              <ToggleRow label={t('set_newListings')} sub={t('set_newListings_sub')} value={newListings} onChange={setNewListings} />
              <ToggleRow label={t('set_priceDrops')} sub={t('set_priceDrops_sub')} value={priceDrops} onChange={setPriceDrops} />
            </div>
            <div className="pt-4 mt-2 border-t border-surface-border">
              <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-muted uppercase tracking-wider">{t('set_minQuality')}</span><span className="text-sm font-bold font-mono text-accent">{minScore}/100</span></div>
              <input type="range" min={40} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="w-full accent-accent" />
              <div className="flex justify-between text-[10px] text-muted mt-1.5"><span>{t('set_qualityAny')}</span><span>{t('set_qualityGood')}</span><span>{t('set_qualityTop')}</span><span>{t('set_qualityBest')}</span></div>
            </div>
          </SectionCard>

          <SectionCard icon={<SlidersHorizontal size={15} />} title={t('set_delivery_title')} desc={t('set_delivery_desc')}>
            <div className="space-y-4">
              <ToggleRow label={t('set_emailAlerts')} sub={user?.email ? `${t('set_sentTo')} ${user.email}` : t('set_sentToAccount')} value={emailAlerts} onChange={setEmailAlerts} icon={<Mail size={14} className="text-accent" />} />

              <div className="pt-3 border-t border-surface-border space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Layers size={12} /> {t('set_smsWhatsapp')}
                  <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">{t('set_comingSoon')}</span>
                </div>
                <label className="block">
                  <span className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('set_phoneNumber')}</span>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 py-2 border border-surface-border bg-surface rounded-xl text-sm text-muted shrink-0">+1</div>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="514-555-1234" className="input flex-1" />
                  </div>
                </label>
                <ToggleRow label={t('set_sms')} sub={t('set_sms_sub')} value={smsAlerts} onChange={setSmsAlerts} icon={<Smartphone size={14} className="text-muted" />} />
                <ToggleRow label={t('set_whatsapp')} sub={t('set_whatsapp_sub')} value={whatsappAlerts} onChange={setWhatsapp} icon={<MessageCircle size={14} className="text-green-500" />} />
                {phoneNeeded && <p className="text-xs text-score-market bg-score-market/10 border border-score-market/30 rounded-lg px-3 py-2">{t('set_phoneNeeded')}</p>}
              </div>
            </div>
          </SectionCard>

          <div className="lg:col-span-2">
            <SectionCard icon={<Globe size={15} />} title={t('set_language_title')} desc={t('set_language_desc')}>
              <div className="grid grid-cols-2 gap-2 max-w-sm">
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

          {/* My Scoring Criteria — full-width row (donut + sliders need the room) */}
          <div className="lg:col-span-2">
        <SectionCard
          icon={<Gauge size={15} />}
          title={t('set_scoring_title')}
          desc={t('set_scoring_desc')}
          action={
            <button
              type="button" onClick={() => setShowScoringHelp(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-surface-border text-xs font-semibold text-muted hover:text-accent hover:border-accent/40 transition-colors"
            >
              <HelpCircle size={13} /> {t('set_howThisWorks')}
            </button>
          }
        >
          {/* ── Buy box (real numbers) — the primary interaction ─────────────── */}
          <div className="flex items-center gap-2 mb-3">
            <CircleDollarSign size={15} className="text-accent" />
            <h4 className="text-sm font-bold text-ink">{t('set_yourBuyBox')}</h4>
            <span className="text-[11px] text-muted">{t('set_inNumbers')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
            {BUYBOX_FIELDS.map(cfg => (
              <ValueSlider
                key={cfg.key}
                label={t(BUYBOX_LABEL_KEY[cfg.key])}
                desc={t(BUYBOX_DESC_KEY[cfg.key])}
                color={cfg.color}
                value={buyBox[cfg.key]}
                onChange={v => setBuyBox(prev => ({ ...prev, [cfg.key]: v }))}
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                prefix={cfg.prefix}
                suffix={cfg.suffix}
                allowNegative={cfg.allowNegative}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted/70 mt-2.5">{t('set_buyBoxHint')}</p>

          {/* ── Advanced: ranking weights (secondary, collapsed by default) ──── */}
          <button
            type="button"
            onClick={() => setShowWeights(v => !v)}
            className="mt-5 w-full flex items-center gap-2 text-left text-xs font-semibold text-muted hover:text-ink transition-colors border-t border-surface-border pt-4"
            aria-expanded={showWeights}
          >
            <ChevronDown size={14} className={clsx('transition-transform', showWeights && 'rotate-180')} />
            {t('set_advanced')}
          </button>

          {showWeights && (
          <div className="mt-4">
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
                  <Icon size={13} /> {t(p.labelKey)}
                </button>
              )
            })}
            <span className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold',
              activePreset === null ? 'bg-accent/10 text-accent border-accent/40 ring-1 ring-accent/20'
                                    : 'border-dashed border-surface-border text-muted/70',
            )}>
              <SlidersHorizontal size={13} /> {t('preset_custom')}
            </span>
            <button
              type="button" onClick={resetWeightsToStrategy}
              className="btn-ghost text-xs ml-auto"
            >
              <RotateCcw size={13} /> {t('set_reset')}
            </button>
          </div>

          {/* Donut + sliders */}
          <div className="flex flex-col lg:flex-row gap-8 pt-4">
            {/* Weight distribution donut */}
            <div className="flex lg:flex-col items-center gap-4 shrink-0 mx-auto lg:mx-0">
              <WeightDonut pct={pctMap} />
              <div className="text-center">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t('set_yourMix')}</p>
                <p className="text-[11px] text-muted mt-0.5 max-w-[150px]">{t('set_yourMix_desc')}</p>
              </div>
            </div>

            {/* Sliders — two columns on wide screens now that it's full-width */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3.5 min-w-0 content-start">
              {SCORE_FACTORS.map(f => {
                const pct = weightPoints[f] // already 0-100
                const fill = `linear-gradient(to right, ${FACTOR_COLOR[f]} 0%, ${FACTOR_COLOR[f]} ${pct}%, #E2E8F0 ${pct}%, #E2E8F0 100%)`
                return (
                  <div key={f}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="min-w-0 flex items-start gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: FACTOR_COLOR[f] }} />
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-ink">{t(FACTOR_LABEL_KEY[f])}</span>
                          <span className="block text-[11px] text-muted leading-snug">{t(FACTOR_DESC_KEY[f])}</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold shrink-0 tabular-nums text-right" style={{ color: FACTOR_COLOR[f] }}>
                        {sharePct(f)}%
                      </span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={weightPoints[f]}
                      onChange={e => adjustWeight(f, Number(e.target.value))}
                      aria-label={t(FACTOR_LABEL_KEY[f])}
                      className="range-fill"
                      style={{ background: fill, ['--range-color' as string]: FACTOR_COLOR[f] }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          </div>
          )}
        </SectionCard>
        </div>
      </div>

      <InfoModal open={showScoringHelp} onClose={() => setShowScoringHelp(false)} title={t('set_howThisWorks')} size="lg">
        <ScoringCriteriaHelp />
      </InfoModal>
    </div>
  )
}

// ── "How this works" explainer content ──────────────────────────────────────
// Three plain-language steps, no per-factor bars — the client asked us to drop
// the line-heavy layout. One concrete worked example makes "how do points
// gather" answerable without re-teaching the whole Score Breakdown panel.
function ScoringCriteriaHelp() {
  const { t } = useLang()
  const steps = [
    { title: t('help_step1_title'), body: t('help_step1_body') },
    { title: t('help_step2_title'), body: t('help_step2_body') },
    { title: t('help_step3_title'), body: t('help_step3_body') },
  ]
  return (
    <div className="space-y-5 text-sm">
      <p className="text-muted leading-relaxed">{t('help_intro')}</p>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-7 h-7 rounded-full bg-accent/10 text-accent font-bold text-sm flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-semibold text-ink leading-tight">{s.title}</p>
              <p className="text-muted leading-snug mt-0.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-xl bg-surface border border-surface-border px-4 py-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{t('help_example')}</p>
        <p className="text-ink leading-relaxed">{t('help_example_body')}</p>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">{t('help_note')}</p>
    </div>
  )
}

// ── Weight distribution donut ─────────────────────────────────────────────────
// Inline SVG (no chart lib): one arc segment per factor, coloured to match its
// slider row, sized to its share of the total.
function WeightDonut({ pct }: { pct: Record<ScoreFactor, number> }) {
  const { t } = useLang()
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
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">{t('set_topFactor')}</span>
        <span className="text-xs font-bold text-ink leading-tight mt-0.5">{t(FACTOR_LABEL_KEY[top])}</span>
        <span className="text-sm font-black font-mono" style={{ color: FACTOR_COLOR[top] }}>{pct[top]}%</span>
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, desc, icon, action, children }: { title: string; desc?: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-3 pb-3 border-b border-surface-border">
        <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink leading-tight">{title}</h2>
          {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
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
// ── Multi-city selector ───────────────────────────────────────────────────────
// Chips for chosen cities + a typeahead that suggests common Québec cities and
// lets the user add any other by typing it and pressing Enter.
function CityMultiSelect({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const add = (city: string) => {
    const name = city.trim()
    if (name && !selected.some(c => c.toLowerCase() === name.toLowerCase())) onChange([...selected, name])
    setQuery('')
  }
  const remove = (city: string) => onChange(selected.filter(c => c !== city))
  const q = query.trim().toLowerCase()
  const suggestions = QUEBEC_CITIES.filter(
    c => c.toLowerCase().includes(q) && !selected.some(s => s.toLowerCase() === c.toLowerCase()),
  )
  const canAddCustom = q.length > 0
    && !QUEBEC_CITIES.some(c => c.toLowerCase() === q)
    && !selected.some(s => s.toLowerCase() === q)

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[46px] px-2 py-2 rounded-xl border border-surface-border bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 transition-all">
        {selected.map(c => (
          <span key={c} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-accent/10 text-accent text-xs font-semibold">
            {c}
            <button type="button" onClick={() => remove(c)} className="p-0.5 rounded hover:bg-accent/20" aria-label={`Remove ${c}`}><X size={12} /></button>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add(query) }
            else if (e.key === 'Backspace' && !query && selected.length) remove(selected[selected.length - 1])
          }}
          placeholder={selected.length ? t('set_addAnother') : t('set_cityPlaceholder')}
          className="flex-1 min-w-[8rem] px-1.5 py-1 text-sm bg-transparent focus:outline-none placeholder:text-muted"
        />
      </div>
      {open && (suggestions.length > 0 || canAddCustom) && (
        <div className="absolute z-20 mt-2 w-full max-h-56 overflow-auto rounded-xl border border-surface-border bg-white shadow-lg py-1">
          {canAddCustom && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => add(query)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover">
              <Plus size={14} className="text-accent" /> {t('set_add')} “<span className="font-semibold">{query.trim()}</span>”
            </button>
          )}
          {suggestions.map(c => (
            <button key={c} type="button" onMouseDown={e => e.preventDefault()} onClick={() => add(c)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-hover">
              <MapPin size={13} className="text-muted" /> {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Investment-goal cards ─────────────────────────────────────────────────────
// Two selectable cards (pick one or both) with an expandable per-option
// explanation, so the client's "explain what Buy & Hold / Flip means" is answered
// inline instead of assumed.
function GoalCards({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const { t } = useLang()
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {GOALS.map(g => {
        const Icon = g.icon, active = selected.includes(g.value), open = expanded === g.value
        return (
          <div key={g.value} className={clsx('rounded-xl border transition-all', active ? 'border-accent/50 bg-accent/5 ring-1 ring-accent/20' : 'border-surface-border bg-white')}>
            <button type="button" onClick={() => toggle(g.value)} className="w-full flex items-start gap-3 p-3.5 text-left">
              <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', active ? 'bg-accent/15' : 'bg-surface')}><Icon size={17} className={active ? 'text-accent' : 'text-muted'} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{t(g.labelKey)}</p>
                <p className="text-xs text-muted leading-snug mt-0.5">{t(g.descKey)}</p>
              </div>
              <span className={clsx('w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5', active ? 'bg-accent border-accent' : 'border-surface-border')}>{active && <Check size={13} className="text-white" />}</span>
            </button>
            <button type="button" onClick={() => setExpanded(open ? null : g.value)}
              className="w-full flex items-center gap-1.5 px-3.5 pb-3 text-[11px] font-semibold text-muted hover:text-accent transition-colors">
              <HelpCircle size={12} /> {t('set_whatsThis')} <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} />
            </button>
            {open && <p className="px-3.5 pb-3.5 text-xs text-muted leading-relaxed animate-fade-in">{t(g.infoKey)}</p>}
          </div>
        )
      })}
    </div>
  )
}
