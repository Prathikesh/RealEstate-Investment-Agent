import { describe, it, expect } from 'vitest'
import { computeFitScore, buildFitRows, INCOME_FACTOR_CEILING } from './verdict'

// Frontend twin of backend/tests/test_verdict.py — the two must agree.

describe('computeFitScore — buy-box fit', () => {
  it('scores full when a target is met', () => {
    expect(computeFitScore({ days_on_market_min: 30 }, { days: 60 })).toBe(100)
  })

  it('honours a NEGATIVE cash-flow target (old model ignored target<=0)', () => {
    expect(computeFitScore({ cash_flow_min: -600 }, { cash_flow: 100 })).toBe(100)
  })

  it('scores proportionally below target', () => {
    // cap target=6 (bad=1); 3.5% -> (3.5-1)/(6-1) = 50%
    expect(computeFitScore({ cap_rate_min: 6 }, { cap_rate: 3.5 })).toBe(50)
  })

  it('treats GRM as lower-is-better', () => {
    // grm target<=10 (bad=18); grm=14 -> (18-14)/(18-10) = 50%
    expect(computeFitScore({ grm_max: 10 }, { grm: 14 })).toBe(50)
  })

  it('pulls the score toward the weakest factor', () => {
    // cap (6-1)/(5-1)=125 ; discount (0+10)/(20+10)=33.33
    // avg=79.17, worst=33.33 -> 0.65*79.17 + 0.35*33.33 = 63.1 -> 63
    expect(computeFitScore(
      { cap_rate_min: 5, discount_min: 20 },
      { cap_rate: 6, discount: 0 },
    )).toBe(63)
  })

  it('caps a yield factor when income is estimated', () => {
    expect(computeFitScore({ cash_flow_min: 500 }, { cash_flow: 2000 }, true)).toBe(INCOME_FACTOR_CEILING)
  })

  it('does not cap disclosed income', () => {
    expect(computeFitScore({ cash_flow_min: 500 }, { cash_flow: 2000 }, false)).toBe(100)
  })

  it('scopes the income guard to yield factors only', () => {
    expect(computeFitScore({ discount_min: 10 }, { discount: 20 }, true)).toBe(100)
  })

  it('falls back to the AI score when no targets are set', () => {
    expect(computeFitScore({}, {}, false, 73)).toBe(73)
    expect(computeFitScore({}, {})).toBe(null)
  })

  it('scores a missing raw metric as 0, not a crash', () => {
    expect(computeFitScore({ cap_rate_min: 6 }, { cap_rate: null })).toBe(0)
  })

  it('treats days=0 as "no target" -> AI fallback', () => {
    expect(computeFitScore({ days_on_market_min: 0 }, { days: 40 }, false, 55)).toBe(55)
  })
})

describe('buildFitRows — breakdown', () => {
  it('total equals computeFitScore for the same inputs', () => {
    const buyBox = { cap_rate_min: 5, discount_min: 20 }
    const raw = { cap_rate: 6, discount: 0 }
    const { rows, total } = buildFitRows(buyBox, raw)
    expect(total).toBe(computeFitScore(buyBox, raw))
    expect(rows).toHaveLength(2)
    // the weakest factor (discount) is flagged
    expect(rows.find(r => r.key === 'discount_min')?.isWorst).toBe(true)
  })

  it('is empty with no targets', () => {
    expect(buildFitRows({}, {}).rows).toHaveLength(0)
  })
})
