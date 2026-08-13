/**
 * Twin tests for computeWeightedScore — these mirror backend/tests/test_verdict.py
 * case-for-case, so if the frontend Your Verdict math ever drifts from the server
 * (the two are hand-kept in sync, no codegen) a test breaks. Run: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  SCORE_FACTORS, UNVERIFIED_INCOME_FACTOR_CEILING,
  computeWeightedScore, type ScoreComponents, type ScoreWeights,
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
