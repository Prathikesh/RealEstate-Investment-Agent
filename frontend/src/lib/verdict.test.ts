/**
 * Twin tests for computeWeightedScore — these mirror backend/tests/test_verdict.py
 * case-for-case, so if the frontend Your Verdict math ever drifts from the server
 * (the two are hand-kept in sync, no codegen) a test breaks. Run: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  SCORE_FACTORS, UNVERIFIED_INCOME_FACTOR_CEILING,
  computeWeightedScore, buildYourVerdictRows, type ScoreComponents, type ScoreWeights,
} from './verdict'

const only = (factor: string): ScoreWeights =>
  Object.fromEntries(SCORE_FACTORS.map(f => [f, f === factor ? 1 : 0])) as ScoreWeights

const base = (overrides: Partial<ScoreComponents> = {}): ScoreComponents => ({
  discount: 30, cap_rate: 30, cash_flow: 30, grm: 30,
  confidence: 30, dom_bonus: 30, price_history: 30,
  unverified_income_cap: 0,
  ...overrides,
})

describe('days-listed strategy (the client bug)', () => {
  it('scores 100 on the days factor when the target is beaten', () => {
    const score = computeWeightedScore(
      base({ dom_bonus: 30 }), only('dom_bonus'),
      { days_on_market_min: 30 }, { dom_bonus: 60 },
    )
    expect(score).toBe(100)
  })

  it('lets a days-driven verdict exceed 59 even with estimated income', () => {
    const score = computeWeightedScore(
      base({ dom_bonus: 30, unverified_income_cap: 59 }), only('dom_bonus'),
      { days_on_market_min: 30 }, { dom_bonus: 90 },
    )
    expect(score).toBe(100) // not clamped to 59
  })
})

describe('estimated income still cannot inflate the yield factors', () => {
  it('caps a yield factor at the neutral ceiling', () => {
    const score = computeWeightedScore(base({ cash_flow: 90, unverified_income_cap: 59 }), only('cash_flow'))
    expect(score).toBe(UNVERIFIED_INCOME_FACTOR_CEILING) // 90 -> 50
  })

  it('does not cap disclosed income', () => {
    const score = computeWeightedScore(base({ cash_flow: 90, unverified_income_cap: 0 }), only('cash_flow'))
    expect(score).toBe(90)
  })

  it('is scoped, not global — a discount-driven half still exceeds 59', () => {
    const weights = { ...only('discount') } as ScoreWeights
    weights.discount = 0.5
    weights.cash_flow = 0.5
    const score = computeWeightedScore(base({ discount: 100, cash_flow: 100, unverified_income_cap: 59 }), weights)
    expect(score).toBe(75) // 0.5*100 + 0.5*min(100,50)
  })

  it('caps a target-relative yield factor too', () => {
    const score = computeWeightedScore(
      base({ cash_flow: 10, unverified_income_cap: 59 }), only('cash_flow'),
      { cash_flow_min: 500 }, { cash_flow: 2000 }, // 400 -> clamp 100 -> cap 50
    )
    expect(score).toBe(UNVERIFIED_INCOME_FACTOR_CEILING)
  })
})

describe('invariants', () => {
  it('matches the stored component when no buy box is set', () => {
    expect(computeWeightedScore(base({ discount: 80 }), only('discount'))).toBe(80)
  })
})

describe('buildYourVerdictRows — the "how did I get to 100?" breakdown', () => {
  const even: ScoreWeights =
    Object.fromEntries(SCORE_FACTORS.map((f, i) => [f, i === 0 ? 0.28 : 0.12])) as ScoreWeights
  // weights: discount .28 + six × .12 = 1.0

  it('total always equals computeWeightedScore for the same inputs', () => {
    const cases: Array<[ScoreComponents, ScoreWeights, any, any]> = [
      [base(), even, null, null],
      [base({ discount: 80 }), only('discount'), null, null],
      [base({ dom_bonus: 30 }), only('dom_bonus'), { days_on_market_min: 30 }, { dom_bonus: 60 }],
      [base({ cash_flow: 90, unverified_income_cap: 59 }), only('cash_flow'), null, null],
      [base({ cash_flow: 10, unverified_income_cap: 59 }), only('cash_flow'), { cash_flow_min: 500 }, { cash_flow: 2000 }],
    ]
    for (const [c, w, bb, raw] of cases) {
      expect(buildYourVerdictRows(c, w, bb, raw).total).toBe(computeWeightedScore(c, w, bb, raw))
    }
  })

  it('emits one row per factor with weights that total 100%', () => {
    const { rows } = buildYourVerdictRows(base(), even)
    expect(rows).toHaveLength(SCORE_FACTORS.length)
    expect(rows.reduce((s, r) => s + r.weightPct, 0)).toBe(100)
  })

  it('flags a factor scored against the broker\'s own target', () => {
    const { rows } = buildYourVerdictRows(
      base(), only('dom_bonus'), { days_on_market_min: 30 }, { dom_bonus: 60 },
    )
    const dom = rows.find(r => r.factor === 'dom_bonus')!
    expect(dom.targeted).toBe(true)
    expect(dom.score).toBe(100) // 60/30 -> clamp 100
  })

  it('flags a yield factor capped by estimated income', () => {
    const { rows } = buildYourVerdictRows(base({ cash_flow: 90, unverified_income_cap: 59 }), only('cash_flow'))
    const cf = rows.find(r => r.factor === 'cash_flow')!
    expect(cf.capped).toBe(true)
    expect(cf.score).toBe(UNVERIFIED_INCOME_FACTOR_CEILING) // 90 -> 50
  })

  it('rows contributions are within rounding of the total', () => {
    const { rows, total } = buildYourVerdictRows(base({ discount: 73, cap_rate: 41, cash_flow: 88 }), even)
    const sum = rows.reduce((s, r) => s + r.contribution, 0)
    expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.5)
  })
})
