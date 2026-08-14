/**
 * Tests for buildScoreLedger — the AI Verdict reconciliation that closes the gap
 * between the factor subtotal and the authoritative header score (the client's
 * "21 out of 36 / 200 points doesn't make sense" complaint). The core invariant:
 * subtotal + Σ row deltas === final, for every combination of backend modifiers.
 * Run: npm test
 */
import { describe, it, expect } from 'vitest'
import { buildScoreLedger, type VerdictFactorRow } from './propertyVerdict'
import type { ScoreComponents } from './verdict'

// A single-factor row set summing to `subtotal` — enough to exercise the ledger,
// which only reads `contribution` off the rows.
const rows = (subtotal: number): VerdictFactorRow[] => [
  { factor: 'discount', label: 'Price Discount', weightPct: 100, score: subtotal, contribution: subtotal, value: '' },
]

const reconciles = (l: ReturnType<typeof buildScoreLedger>) =>
  Math.round((l.subtotal + l.rows.reduce((s, r) => s + r.delta, 0)) * 10) / 10 === l.final

describe('buildScoreLedger reconciliation invariant', () => {
  const comps = (o: Partial<ScoreComponents>): ScoreComponents => ({
    risk_modifier: 0, neighbourhood_modifier: 0, unverified_income_cap: 0, ...o,
  })

  it('a clean listing reconciles (only a rounding row, if any)', () => {
    const l = buildScoreLedger(rows(36.4), comps({}), 36)
    expect(reconciles(l)).toBe(true)
    expect(l.rows.every(r => r.kind === 'rounding')).toBe(true)
  })

  it('labels a material unexplained gap as an adjustment, not rounding (the live 82.4 -> 87 case)', () => {
    // Legacy row: components reconstructed with risk=None, so the +4.6 risk/market
    // context isn't itemised — it must read as an adjustment, never "rounding".
    const l = buildScoreLedger(rows(82.4), comps({}), 87)
    expect(reconciles(l)).toBe(true)
    const gap = l.rows.find(r => r.kind === 'adjustment')!
    expect(gap.delta).toBe(4.6)
    expect(l.rows.some(r => r.kind === 'rounding')).toBe(false)
  })

  it('labels a negative unexplained gap as an adjustment too (the 69.9 -> 62 case)', () => {
    const l = buildScoreLedger(rows(69.9), comps({}), 62)
    expect(reconciles(l)).toBe(true)
    expect(l.rows.find(r => r.kind === 'adjustment')!.delta).toBe(-7.9)
  })

  it('still calls a sub-0.5 residue plain rounding', () => {
    const l = buildScoreLedger(rows(36.4), comps({}), 36)
    expect(l.rows.find(r => r.kind === 'rounding')!.delta).toBe(-0.4)
  })

  it('reconciles the 36 -> 21 case from the Loom (2+ high risks)', () => {
    const l = buildScoreLedger(rows(36.4), comps({ risk_modifier: -15 }), 21)
    expect(reconciles(l)).toBe(true)
    expect(l.rows.find(r => r.kind === 'risk')!.reason).toBe('high2')
  })

  it('critical risk shows a hard clamp to 35, not an additive delta', () => {
    const l = buildScoreLedger(rows(80), comps({ risk_modifier: -99 }), 35)
    expect(reconciles(l)).toBe(true)
    const risk = l.rows.find(r => r.kind === 'risk')!
    expect(risk.reason).toBe('critical')
    expect(risk.delta).toBe(-45) // 80 -> 35
  })

  it('income cap only appears when it actually bites', () => {
    const bites = buildScoreLedger(rows(80), comps({ unverified_income_cap: 59 }), 59)
    expect(bites.rows.some(r => r.kind === 'income')).toBe(true)
    expect(reconciles(bites)).toBe(true)

    const noBite = buildScoreLedger(rows(40), comps({ unverified_income_cap: 59 }), 40)
    expect(noBite.rows.some(r => r.kind === 'income')).toBe(false)
    expect(reconciles(noBite)).toBe(true)
  })

  it('stacks risk + neighbourhood + rounding and still closes to final', () => {
    const l = buildScoreLedger(rows(50.6), comps({ risk_modifier: -8, neighbourhood_modifier: 5 }), 48)
    expect(reconciles(l)).toBe(true)
    expect(l.rows.map(r => r.kind)).toContain('neighbourhood')
  })
})
