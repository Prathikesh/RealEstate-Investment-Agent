/**
 * Bridges a PropertyDetail to the pure verdict-scoring helpers in ./verdict.
 *
 * Prefers the backend's stored `score_components` (accurate). For properties
 * analyzed before that field existed, it reconstructs an approximate breakdown
 * from the raw stored metrics — the same approximation the "Score Breakdown"
 * panel used before this feature, so old properties render unchanged instead of
 * showing zeros.
 */
import type { PropertyDetail } from '../api'
import {
  SCORE_FACTORS, FACTOR_LABEL, normalize,
  type ScoreComponents, type ScoreFactor, type ScoreWeights,
} from './verdict'

/** Approximate the 7 factor sub-scores from raw property fields (fallback only). */
function approximateComponents(prop: PropertyDetail): ScoreComponents {
  const dom = prop.days_on_market
  return {
    discount:      normalize(prop.discount_pct ?? 0, -10, 20),
    cap_rate:      normalize(prop.cap_rate ?? 0, 1.0, 6.0),
    cash_flow:     normalize(prop.monthly_cash_flow ?? 0, -3000, 500),
    grm:           prop.grm != null ? normalize(prop.grm, 18.0, 10.0) : 30,
    confidence:    normalize(prop.comparable_count ?? 0, 0, 10) ,
    dom_bonus:     dom == null ? 30 : dom > 90 ? 80 : dom > 45 ? 55 : dom < 7 ? 15 : 30,
    price_history: 30,
  }
}

/** Real backend components when available, else the approximation. */
export function componentsForProperty(prop: PropertyDetail): ScoreComponents {
  const real = prop.score_components
  if (real && SCORE_FACTORS.some(f => real[f] != null)) return real
  return approximateComponents(prop)
}

/** Human-readable raw value per factor, for the breakdown rows (e.g. "5.2%"). */
export function factorDisplayValue(prop: PropertyDetail, f: ScoreFactor): string {
  switch (f) {
    case 'discount':      return `${(prop.discount_pct ?? 0).toFixed(1)}%`
    case 'cap_rate':      return `${(prop.cap_rate ?? 0).toFixed(2)}%`
    case 'cash_flow':     return prop.monthly_cash_flow != null
      ? `${prop.monthly_cash_flow < 0 ? '-' : ''}$${Math.abs(Math.round(prop.monthly_cash_flow)).toLocaleString()}/mo`
      : '—'
    case 'grm':           return prop.grm != null ? `${prop.grm.toFixed(1)}x` : '—'
    case 'confidence':    return `${prop.comparable_count ?? 0} comps`
    case 'dom_bonus':     return prop.days_on_market != null ? `${prop.days_on_market}d` : '—'
    case 'price_history': return `${(prop.price_history?.length ?? 0)} changes`
  }
}

export interface VerdictFactorRow {
  factor: ScoreFactor
  label: string
  weightPct: number     // 0-100
  score: number         // 0-100 component sub-score
  contribution: number  // points this factor adds to the total (score × weight)
  value: string         // raw display value
}

/**
 * Build the breakdown rows for a given weight set. Reused for AI and Your Verdict.
 * `contribution` (= sub-score × weight) is the actual points each factor adds to
 * the total — the sum of all contributions IS the base score, which is what makes
 * "how is this an 87?" answerable at a glance.
 */
export function buildFactorRows(
  prop: PropertyDetail,
  weights: ScoreWeights,
  components: ScoreComponents = componentsForProperty(prop),
): VerdictFactorRow[] {
  return SCORE_FACTORS.map(f => {
    const score = components[f] ?? 0
    const weight = weights[f] ?? 0
    return {
      factor: f,
      label: FACTOR_LABEL[f],
      weightPct: Math.round(weight * 100),
      score: Math.round(score),
      contribution: Math.round(score * weight * 10) / 10,
      value: factorDisplayValue(prop, f),
    }
  })
}

const round1 = (n: number) => Math.round(n * 10) / 10

export type LedgerRowKind = 'risk' | 'neighbourhood' | 'income' | 'adjustment' | 'rounding'

export interface LedgerRow {
  kind: LedgerRowKind
  delta: number // signed points this step applied to the running total
  // For risk rows, the severity behind the modifier (drives the human reason).
  reason?: 'critical' | 'high2' | 'high1' | 'medium'
}

export interface ScoreLedger {
  subtotal: number // base weighted sum (= Σ factor contributions)
  rows: LedgerRow[] // only the steps that actually moved the score
  final: number // authoritative integer score (matches the header)
}

/**
 * Reconciles the factor subtotal with the authoritative final `score` by
 * replaying the backend's post-modifier order (scorer.py:199-247): risk →
 * neighbourhood → unverified-income cap → round. Critical risk and the income
 * cap are `min()` clamps (not additive), so each row records the *actual* delta
 * that step applied to the running total. By anchoring the last step to the real
 * `finalScore`, `subtotal + Σ rows === final` always — which is exactly what
 * makes "why is this a 21 when the factors add up to 36?" answerable on screen.
 *
 * Important: many properties were scored before per-factor components were
 * stored — their `score_components` were later reconstructed by a backfill that
 * ran with risk=None / neighbourhood=None (scripts/backfill_score_components.py),
 * so their stored `risk_modifier` / `neighbourhood_modifier` are 0 even though the
 * authoritative `score` already includes those adjustments. We therefore can't
 * always itemize the gap. Whatever's left after the modifiers we DO have is the
 * AI's risk / neighbourhood / market context: labelled an "adjustment" when it's
 * material, and plain "rounding" only when it's a sub-0.5 rounding artefact.
 *
 * The client never gets risk items / neighbourhood percentiles, so this runs
 * only for the AI verdict. Your Verdict is computed purely from components ×
 * weights (no such modifiers), so its rows always sum exactly to its score.
 */
export function buildScoreLedger(
  factors: VerdictFactorRow[],
  components: ScoreComponents,
  finalScore: number,
): ScoreLedger {
  const subtotal = round1(factors.reduce((s, f) => s + f.contribution, 0))
  const rows: LedgerRow[] = []
  let running = subtotal

  // 1. Risk (scorer.py:202). Critical risk is a hard clamp to 35, not additive.
  const risk = components.risk_modifier ?? 0
  if (risk === -99) {
    const post = Math.min(running, 35)
    if (post !== running) rows.push({ kind: 'risk', delta: round1(post - running), reason: 'critical' })
    running = post
  } else if (risk !== 0) {
    rows.push({ kind: 'risk', delta: round1(risk), reason: risk <= -15 ? 'high2' : risk <= -8 ? 'high1' : 'medium' })
    running = round1(running + risk)
  }

  // 2. Neighbourhood (scorer.py:220) — additive.
  const nb = components.neighbourhood_modifier ?? 0
  if (nb !== 0) {
    rows.push({ kind: 'neighbourhood', delta: round1(nb) })
    running = round1(running + nb)
  }

  // 3. Unverified-income cap (scorer.py:236) — a clamp; only surfaces when it bites.
  const incomeCap = components.unverified_income_cap ?? 0
  if (incomeCap > 0 && running > incomeCap) {
    rows.push({ kind: 'income', delta: round1(incomeCap - running) })
    running = incomeCap
  }

  // 4. Whatever's left to reach the authoritative score. A sub-0.5 residue is a
  //    rounding artefact; anything larger is the AI's risk / neighbourhood /
  //    market context that isn't itemised in this property's stored components
  //    (see the backfill note above) — an honest "adjustment", never "rounding".
  const residual = round1(finalScore - running)
  if (Math.abs(residual) >= 0.5) rows.push({ kind: 'adjustment', delta: residual })
  else if (Math.abs(residual) >= 0.1) rows.push({ kind: 'rounding', delta: residual })

  return { subtotal, rows, final: finalScore }
}
