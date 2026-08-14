/**
 * Verdict scoring — mirrors the backend OpportunityScorer (app/agent/scorer.py).
 *
 * The backend computes a property's score as a weighted sum of 7 factors, each
 * normalized 0-100, then applies risk/neighbourhood/unverified-income modifiers.
 * It stores BOTH the final `score` and the per-factor `score_components`.
 *
 * On the frontend we reuse those stored components to:
 *   1. Show an accurate "Score Breakdown" (previously the panel guessed weights).
 *   2. Compute a broker's personalized "Your Verdict" by recombining the same
 *      components with their own custom weights.
 *   3. Live-recompute the cap_rate/cash_flow components (the only two that move
 *      when a user changes financing assumptions in the FinancingWorkbench) and
 *      re-run the weighted sum so both verdicts update as they type.
 *
 * Keep the constants here in sync with app/agent/scorer.py.
 */

// The 7 weighted scoring factors (keys must match backend WEIGHTS + components).
export const SCORE_FACTORS = [
  'discount',
  'cap_rate',
  'cash_flow',
  'grm',
  'confidence',
  'dom_bonus',
  'price_history',
] as const

export type ScoreFactor = (typeof SCORE_FACTORS)[number]

// Yield factors derived from the listing's rental income. When rent is only
// ESTIMATED (not disclosed), Your Verdict clamps each of these to a neutral
// ceiling — instead of hard-capping the whole score — so fabricated rent can't
// inflate the yield factors while a discount-/days-driven verdict stays free to
// exceed 59. Mirrors backend verdict.py INCOME_FACTORS; the AI score keeps its
// own global cap in scorer.py. Keep in sync with backend/app/agent/verdict.py.
export const INCOME_FACTORS: ReadonlySet<ScoreFactor> = new Set(['cap_rate', 'cash_flow', 'grm'])
export const UNVERIFIED_INCOME_FACTOR_CEILING = 50

/** Weight per factor (0-1). Must sum to 1.0. Matches backend WEIGHTS. */
export type ScoreWeights = Record<ScoreFactor, number>

// ── Target-relative scoring ("in numbers") ────────────────────────────────────
// Mirrors backend verdict.py _TARGET_KEY. When a broker sets a real-number buy-box
// target for one of these factors, that factor scores clamp(raw / target * 100)
// instead of its stored global component — their number defines "fully satisfies
// me" (=100). Keys must match lib/buybox.ts BuyBox + backend verdict.py.
export const FACTOR_TARGET_KEY: Partial<Record<ScoreFactor, string>> = {
  discount:  'discount_min',        // % below comparable median
  cap_rate:  'cap_rate_min',        // % cap rate
  cash_flow: 'cash_flow_min',       // $/mo cash flow
  dom_bonus: 'days_on_market_min',  // days listed
}

/** Same-unit raw metric per target-relative factor, for a single property. */
export type RawMetrics = Partial<Record<ScoreFactor, number | null | undefined>>

/**
 * Per-factor normalized 0-100 sub-scores from the backend. Also carries the
 * post-weighting modifier fields the backend records; those are informational
 * only here (we never re-derive risk/neighbourhood on the client).
 */
export type ScoreComponents = Partial<Record<ScoreFactor, number>> & {
  risk_modifier?: number
  neighbourhood_modifier?: number
  unverified_income_cap?: number
}

// Strategy weight presets — mirror app/agent/scorer.py WEIGHTS. Used as the
// default "Your Verdict" weights when a broker hasn't set custom ones, and to
// seed the Settings sliders. Prefer the backend's `ai_weights` when available;
// this is the offline fallback so the UI never shows a blank slider set.
export const STRATEGY_WEIGHTS: Record<'buy_and_hold' | 'buy_fix_sell' | 'both', ScoreWeights> = {
  buy_and_hold: {
    discount: 0.18, cap_rate: 0.27, cash_flow: 0.22, grm: 0.1,
    confidence: 0.11, dom_bonus: 0.07, price_history: 0.05,
  },
  buy_fix_sell: {
    discount: 0.38, cap_rate: 0.08, cash_flow: 0.08, grm: 0.05,
    confidence: 0.13, dom_bonus: 0.18, price_history: 0.1,
  },
  both: {
    discount: 0.28, cap_rate: 0.18, cash_flow: 0.17, grm: 0.07,
    confidence: 0.1, dom_bonus: 0.13, price_history: 0.07,
  },
}

// Human-readable labels for each factor (English keys map to i18n keys used in
// PropertyPage's existing "Score Breakdown"; see factorPriceDiscount etc.).
export const FACTOR_LABEL: Record<ScoreFactor, string> = {
  discount: 'Price Discount',
  cap_rate: 'Cap Rate',
  cash_flow: 'Cash Flow',
  grm: 'GRM',
  confidence: 'Confidence',
  dom_bonus: 'Days Listed',
  price_history: 'Price Trend',
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Linear scale bad→0, good→100. Mirrors backend scorer._normalize(). */
export function normalize(value: number, bad: number, good: number): number {
  if (good === bad) return 50
  return clamp(((value - bad) / (good - bad)) * 100)
}

// Normalization bands, copied verbatim from app/agent/scorer.py so the live
// client recompute matches the server exactly.
export function capRateComponent(capRatePct: number | null | undefined): number {
  if (capRatePct == null) return 0
  return Math.round(normalize(capRatePct, 1.0, 6.0) * 10) / 10
}

export function cashFlowComponent(monthlyCashFlow: number | null | undefined): number {
  if (monthlyCashFlow == null) return 0
  return Math.round(normalize(monthlyCashFlow, -3000, 500) * 10) / 10
}

/**
 * Weighted sum of components × weights, clamped 0-100. This is the base score
 * before backend-only modifiers (risk/neighbourhood/unverified-income cap).
 *
 * We deliberately do NOT re-apply the risk/neighbourhood modifiers on the client:
 * they depend on data the client doesn't fully have (risk items, neighbourhood
 * percentiles). The one exception is the unverified-income cap, whose value IS
 * carried in the stored components, so we honour it (see below) to avoid ranking
 * fabricated-income listings above disclosed-income ones. Otherwise "Your Verdict"
 * is a transparent weighted blend of the same factor scores — the "move the
 * numbers around" tool the client asked for — not a claim to reproduce the AI's
 * risk overrides. For the AI verdict we still show the authoritative stored `score`.
 */
export function computeWeightedScore(
  components: ScoreComponents,
  weights: ScoreWeights,
  buyBox?: Record<string, number | undefined> | null,
  raw?: RawMetrics | null,
): number {
  // Guard flag: unverified_income_cap > 0 means the listing's rent was estimated,
  // not disclosed. We clamp only the yield factors below (not the whole score) so
  // fabricated rent can't inflate cap_rate/cash_flow/grm while a discount-/days-
  // driven verdict is still free to exceed 59. Mirrors backend verdict.py.
  const incomeEstimated = (components.unverified_income_cap ?? 0) > 0
  let total = 0
  for (const factor of SCORE_FACTORS) {
    const targetKey = FACTOR_TARGET_KEY[factor]
    const target = targetKey && buyBox ? buyBox[targetKey] : undefined
    const rawVal = raw ? raw[factor] : undefined
    // Target-relative: the broker's own number defines "fully satisfies me" (=100).
    // Falls back to the stored component when there's no target or no raw value —
    // so a broker with no buy box scores identically to before.
    let comp: number | undefined
    if (target != null && target > 0 && rawVal != null) {
      comp = clamp((rawVal / target) * 100)
    } else {
      comp = components[factor]
    }
    if (comp == null) continue
    // Neutralize a yield factor when income is only estimated — see INCOME_FACTORS.
    if (INCOME_FACTORS.has(factor) && incomeEstimated) {
      comp = Math.min(comp, UNVERIFIED_INCOME_FACTOR_CEILING)
    }
    total += comp * weights[factor]
  }
  return clamp(Math.round(total))
}

export interface YourVerdictRow {
  factor: ScoreFactor
  weightPct: number    // 0-100
  score: number        // effective sub-score used (post target-relative + income clamp)
  contribution: number // score × weight, rounded to 0.1 (the points it adds)
  targeted: boolean    // scored against the broker's own buy-box number, not the global band
  capped: boolean      // yield-factor income ceiling actually lowered this sub-score
}

export interface YourVerdictBreakdown {
  rows: YourVerdictRow[]
  total: number // === computeWeightedScore(...) for the same inputs
}

/**
 * The per-factor breakdown behind "Your Verdict" — the transparency answer to the
 * client's "I don't know how I got to 100 points". Replays computeWeightedScore's
 * exact loop (target-relative sub-scores + the per-yield-factor income ceiling)
 * and emits one row per factor plus the same total, so the rows visibly add up to
 * the Your Verdict number. Kept beside computeWeightedScore so the two never drift;
 * a test asserts `total` equals it for shared inputs.
 */
export function buildYourVerdictRows(
  components: ScoreComponents,
  weights: ScoreWeights,
  buyBox?: Record<string, number | undefined> | null,
  raw?: RawMetrics | null,
): YourVerdictBreakdown {
  const incomeEstimated = (components.unverified_income_cap ?? 0) > 0
  const rows: YourVerdictRow[] = []
  let total = 0
  for (const factor of SCORE_FACTORS) {
    const targetKey = FACTOR_TARGET_KEY[factor]
    const target = targetKey && buyBox ? buyBox[targetKey] : undefined
    const rawVal = raw ? raw[factor] : undefined
    let comp: number | undefined
    let targeted = false
    if (target != null && target > 0 && rawVal != null) {
      comp = clamp((rawVal / target) * 100)
      targeted = true
    } else {
      comp = components[factor]
    }
    const weight = weights[factor] ?? 0
    if (comp == null) {
      rows.push({ factor, weightPct: Math.round(weight * 100), score: 0, contribution: 0, targeted, capped: false })
      continue
    }
    let capped = false
    if (INCOME_FACTORS.has(factor) && incomeEstimated) {
      const clamped = Math.min(comp, UNVERIFIED_INCOME_FACTOR_CEILING)
      capped = clamped < comp
      comp = clamped
    }
    total += comp * weight
    rows.push({
      factor,
      weightPct: Math.round(weight * 100),
      score: Math.round(comp),
      contribution: Math.round(comp * weight * 10) / 10,
      targeted,
      capped,
    })
  }
  return { rows, total: clamp(Math.round(total)) }
}

export type VerdictCategory =
  | 'strong_opportunity'
  | 'worth_investigating'
  | 'market_price'
  | 'not_recommended'

/** Same thresholds as backend ScoreCategory. */
export function categoryForScore(score: number): VerdictCategory {
  if (score >= 80) return 'strong_opportunity'
  if (score >= 60) return 'worth_investigating'
  if (score >= 40) return 'market_price'
  return 'not_recommended'
}

/** True when weights cover all 7 factors and sum to ~1.0 (backend accepts ±0.01). */
export function weightsAreValid(weights: Partial<ScoreWeights>): weights is ScoreWeights {
  const keys = SCORE_FACTORS.every((f) => typeof weights[f] === 'number')
  if (!keys) return false
  const sum = SCORE_FACTORS.reduce((acc, f) => acc + (weights[f] as number), 0)
  return Math.abs(sum - 1.0) <= 0.01
}

/**
 * Recompute the cap_rate + cash_flow components from live financing-derived
 * values, leaving all other components (discount, grm, confidence, etc.) at
 * their stored backend values. Used by PropertyPage when the FinancingWorkbench
 * inputs change so both verdicts react live.
 */
export function withLiveFinancials(
  base: ScoreComponents,
  live: { capRatePct?: number | null; monthlyCashFlow?: number | null },
): ScoreComponents {
  const next: ScoreComponents = { ...base }
  if (live.capRatePct !== undefined) next.cap_rate = capRateComponent(live.capRatePct)
  if (live.monthlyCashFlow !== undefined) next.cash_flow = cashFlowComponent(live.monthlyCashFlow)
  return next
}
