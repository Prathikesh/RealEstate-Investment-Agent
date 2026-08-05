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
  weightPct: number   // 0-100
  score: number       // 0-100 component sub-score
  value: string       // raw display value
}

/** Build the breakdown rows for a given weight set. Reused for AI and Your Verdict. */
export function buildFactorRows(
  prop: PropertyDetail,
  weights: ScoreWeights,
  components: ScoreComponents = componentsForProperty(prop),
): VerdictFactorRow[] {
  return SCORE_FACTORS.map(f => ({
    factor: f,
    label: FACTOR_LABEL[f],
    weightPct: Math.round((weights[f] ?? 0) * 100),
    score: Math.round(components[f] ?? 0),
    value: factorDisplayValue(prop, f),
  }))
}
