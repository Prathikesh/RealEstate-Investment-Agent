/**
 * Verdict scoring.
 *
 * TWO separate things live here:
 *
 *  1. AI-score helpers (SCORE_FACTORS, STRATEGY_WEIGHTS, ScoreComponents, normalize,
 *     FACTOR_LABEL) — the platform's fixed score. Used by lib/propertyVerdict.ts to
 *     render the "how is this an 87?" AI breakdown. UNCHANGED.
 *
 *  2. "Your Verdict" — the broker-personalized BUY-BOX FIT score. The broker sets
 *     real-number targets (buy box); a listing scores how well it FITS them. No
 *     hidden weights, no hard filters. This is the twin of backend app/agent/verdict.py
 *     — keep the constants and math in sync with it.
 */

// ── AI-score factors (platform score; unchanged) ──────────────────────────────
export const SCORE_FACTORS = [
  'discount', 'cap_rate', 'cash_flow', 'grm',
  'confidence', 'dom_bonus', 'price_history',
] as const

export type ScoreFactor = (typeof SCORE_FACTORS)[number]

/** Weight per factor (0-1). Must sum to 1.0. Matches backend scorer.py WEIGHTS. */
export type ScoreWeights = Record<ScoreFactor, number>

/**
 * Per-factor normalized 0-100 sub-scores from the backend AI scorer, plus the
 * post-weighting modifier fields it records (used by the AI-score ledger).
 */
export type ScoreComponents = Partial<Record<ScoreFactor, number>> & {
  risk_modifier?: number
  neighbourhood_modifier?: number
  unverified_income_cap?: number
}

// AI strategy weight presets — mirror scorer.py WEIGHTS. Used only by the AI-score
// breakdown fallback (prop.ai_weights ?? STRATEGY_WEIGHTS.both) in propertyVerdict.
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

// Human-readable labels for each AI factor (i18n keys handled in the components).
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

/** True when weights cover all 7 factors and sum to ~1.0 (AI-side helper). */
export function weightsAreValid(weights: Partial<ScoreWeights>): weights is ScoreWeights {
  const keys = SCORE_FACTORS.every((f) => typeof weights[f] === 'number')
  if (!keys) return false
  const sum = SCORE_FACTORS.reduce((acc, f) => acc + (weights[f] as number), 0)
  return Math.abs(sum - 1.0) <= 0.01
}

export type VerdictCategory =
  | 'strong_opportunity'
  | 'worth_investigating'
  | 'market_price'
  | 'not_recommended'

/** Same thresholds as backend ScoreCategory. */
export function categoryForScore(score: number | null): VerdictCategory {
  const s = score ?? 0
  if (s >= 80) return 'strong_opportunity'
  if (s >= 60) return 'worth_investigating'
  if (s >= 40) return 'market_price'
  return 'not_recommended'
}

// ══════════════════════════════════════════════════════════════════════════════
// "Your Verdict" — buy-box FIT model (twin of backend app/agent/verdict.py)
// ══════════════════════════════════════════════════════════════════════════════

/** The five buy-box targets that drive Your Verdict. Keys match lib/buybox.ts. */
export type FitTargetKey =
  | 'cash_flow_min' | 'cap_rate_min' | 'discount_min' | 'days_on_market_min' | 'grm_max'

/** Same-unit raw metric per factor, for a single property. */
export interface FitRaw {
  cash_flow?: number | null
  cap_rate?: number | null
  discount?: number | null
  days?: number | null
  grm?: number | null
}

interface FitCfg { raw: keyof FitRaw; bad: number; higher: boolean; income: boolean }

/** Per-factor fit config — bad anchors reused from scorer.py bands. Sync with verdict.py. */
export const FIT_CONFIG: Record<FitTargetKey, FitCfg> = {
  cash_flow_min:      { raw: 'cash_flow', bad: -3000, higher: true,  income: true },
  cap_rate_min:       { raw: 'cap_rate',  bad: 1.0,   higher: true,  income: true },
  discount_min:       { raw: 'discount',  bad: -10,   higher: true,  income: false },
  days_on_market_min: { raw: 'days',      bad: 0,     higher: true,  income: false },
  grm_max:            { raw: 'grm',       bad: 18,    higher: false, income: true },
}

export const RANK_CEILING = 150
export const INCOME_FACTOR_CEILING = 50
const BLEND_AVG = 0.65
const BLEND_WORST = 0.35

// Friendly label per buy-box factor (components translate via i18n keys).
export const FIT_LABEL: Record<FitTargetKey, string> = {
  cash_flow_min: 'Cash Flow',
  cap_rate_min: 'Cap Rate',
  discount_min: 'Price Discount',
  days_on_market_min: 'Days Listed',
  grm_max: 'GRM',
}

function targetIsValid(key: FitTargetKey, t: number): boolean {
  const cfg = FIT_CONFIG[key]
  return cfg.higher ? t > cfg.bad : (t > 0 && t < cfg.bad)
}

/** (key, target) pairs for the buy-box factors with a valid target set. */
function activeTargets(buyBox?: Partial<Record<FitTargetKey, number | undefined>> | null): [FitTargetKey, number][] {
  const out: [FitTargetKey, number][] = []
  if (!buyBox) return out
  for (const key of Object.keys(FIT_CONFIG) as FitTargetKey[]) {
    const t = buyBox[key]
    if (t != null && targetIsValid(key, Number(t))) out.push([key, Number(t)])
  }
  return out
}

/** One factor's fit, 0–RANK_CEILING (0 when the raw metric is missing). */
function factorFit(key: FitTargetKey, target: number, raw: FitRaw, incomeEstimated: boolean): number {
  const cfg = FIT_CONFIG[key]
  const rv = raw[cfg.raw]
  let fit: number
  if (rv == null) {
    fit = 0
  } else {
    fit = cfg.higher
      ? ((Number(rv) - cfg.bad) / (target - cfg.bad)) * 100
      : ((cfg.bad - Number(rv)) / (cfg.bad - target)) * 100
    fit = clamp(fit, 0, RANK_CEILING)
  }
  if (cfg.income && incomeEstimated) fit = Math.min(fit, INCOME_FACTOR_CEILING)
  return fit
}

/**
 * "Your Verdict" = 0.65 × average(fits) + 0.35 × worst(fit) over the factors the
 * broker set a target for (weak-spot aware). No targets → returns `aiScore`.
 * Clamped 0–100 for display. Mirrors backend compute_fit_score / fit_score_expr.
 */
export function computeFitScore(
  buyBox: Partial<Record<FitTargetKey, number | undefined>> | null | undefined,
  raw: FitRaw,
  incomeEstimated = false,
  aiScore: number | null = null,
): number | null {
  const targets = activeTargets(buyBox)
  if (targets.length === 0) return aiScore
  const fits = targets.map(([k, t]) => factorFit(k, t, raw, incomeEstimated))
  const avg = fits.reduce((a, b) => a + b, 0) / fits.length
  const worst = Math.min(...fits)
  return clamp(Math.round(BLEND_AVG * avg + BLEND_WORST * worst))
}

export interface FitRow {
  key: FitTargetKey
  label: string
  target: number        // the broker's own number
  fit: number           // 0-100 (display clamp)
  isWorst: boolean       // the weak spot weighted extra in the blend
  capped: boolean        // estimated-income ceiling lowered this fit
}

export interface FitBreakdown {
  rows: FitRow[]
  total: number         // === computeFitScore(...) for the same inputs
}

/**
 * The per-factor breakdown behind Your Verdict — the "how did I get this number?"
 * answer. Emits one row per target the broker set, marks the worst factor (which
 * the blend weights extra), and returns the same total as computeFitScore.
 */
export function buildFitRows(
  buyBox: Partial<Record<FitTargetKey, number | undefined>> | null | undefined,
  raw: FitRaw,
  incomeEstimated = false,
): FitBreakdown {
  const targets = activeTargets(buyBox)
  if (targets.length === 0) return { rows: [], total: 0 }

  const rawFits = targets.map(([k, t]) => ({
    key: k,
    target: t,
    rankFit: factorFit(k, t, raw, incomeEstimated),
  }))
  const worstVal = Math.min(...rawFits.map(f => f.rankFit))
  const avg = rawFits.reduce((a, f) => a + f.rankFit, 0) / rawFits.length
  const total = clamp(Math.round(BLEND_AVG * avg + BLEND_WORST * worstVal))

  let worstMarked = false
  const rows: FitRow[] = rawFits.map(f => {
    const cfg = FIT_CONFIG[f.key]
    const rv = raw[cfg.raw]
    const uncapped = rv == null ? 0 : clamp(
      cfg.higher
        ? ((Number(rv) - cfg.bad) / (f.target - cfg.bad)) * 100
        : ((cfg.bad - Number(rv)) / (cfg.bad - f.target)) * 100,
      0, RANK_CEILING,
    )
    const isWorst = !worstMarked && f.rankFit === worstVal
    if (isWorst) worstMarked = true
    return {
      key: f.key,
      label: FIT_LABEL[f.key],
      target: f.target,
      fit: clamp(Math.round(f.rankFit)),
      isWorst,
      capped: cfg.income && incomeEstimated && uncapped > INCOME_FACTOR_CEILING,
    }
  })
  return { rows, total }
}
