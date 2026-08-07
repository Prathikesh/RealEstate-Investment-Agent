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

/** Weight per factor (0-1). Must sum to 1.0. Matches backend WEIGHTS. */
export type ScoreWeights = Record<ScoreFactor, number>

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
): number {
  let total = 0
  for (const factor of SCORE_FACTORS) {
    const c = components[factor]
    if (c != null) total += c * weights[factor]
  }
  // Data-integrity guard, mirroring backend verdict.py: when the listing's income
  // was estimated (not disclosed), honour the same hard cap the AI applies so a
  // broker weighting yield high can't push a fabricated-income listing to the top.
  // This is the one backend modifier we DO re-apply client-side, because its value
  // (unverified_income_cap) is carried in the stored components — unlike the risk /
  // neighbourhood modifiers, which need data the client doesn't have.
  const cap = components.unverified_income_cap
  if (cap != null && cap > 0) total = Math.min(total, cap)
  return clamp(Math.round(total))
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
