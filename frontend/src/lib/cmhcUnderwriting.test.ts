/**
 * Golden-value tests for cmhcUnderwriting.ts, extracted directly from the
 * live cached cells of the client-provided "Multi-Res Income Analysis
 * Template" workbook (a real, filled-in deal — not a blank template), plus
 * boundary/regression tests for the LTV bands, amortization surcharge tiers,
 * and the source workbook's row-93 breakeven-rent bug. Run: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  isCmhcUnderwritingEligible, summarizeRentRoll, calcTotalGrossIncome, calcVacancyAllowance,
  calcEGI, applyExpenseBenchmark, computeReplacementReserveBenchmark, calcTotalExpenses, calcNOI,
  calcNetCashFlow, calcUnderwrittenValue, canadianEffectiveMonthlyRate, monthlyMortgagePayment,
  calcDSCR, calcLTV, cmhcApplicationFee, cmhcPremiumRate, cmhcPremiumAmount, calcAverageRentPerUnit,
  calcBreakevenRentPerUnit, buildAmortizationSchedule, balanceAfterNPayments, calcYieldMaintenance,
  requiredDscrForTerm, loanFromDscr, sizeCmhcFirstMortgage,
  type OperatingExpenseLines, type RentRollUnit,
} from './cmhcUnderwriting'

describe('eligibility', () => {
  it('is eligible for quintuplex_plus for-sale properties only (5+ units)', () => {
    expect(isCmhcUnderwritingEligible({ property_type: 'quintuplex_plus', listing_type: 'for_sale' })).toBe(true)
    expect(isCmhcUnderwritingEligible({ property_type: 'quadruplex', listing_type: 'for_sale' })).toBe(false)
    expect(isCmhcUnderwritingEligible({ property_type: 'triplex', listing_type: 'for_sale' })).toBe(false)
    expect(isCmhcUnderwritingEligible({ property_type: 'quintuplex_plus', listing_type: 'for_rent' })).toBe(false)
  })
})

describe('golden deal — 4-unit, $288,339 commercial revenue, 6% vacancy, 7% cap rate', () => {
  const totalGrossIncome = calcTotalGrossIncome(0, 288339, 0, 0)
  const vacancyAllowance = calcVacancyAllowance(totalGrossIncome, 6)
  const egi = calcEGI(totalGrossIncome, vacancyAllowance)

  it('EGI matches the workbook (G23)', () => {
    expect(totalGrossIncome).toBe(288339)
    expect(vacancyAllowance).toBeCloseTo(-17300.34, 2)
    expect(egi).toBeCloseTo(271038.66, 2)
  })

  const lines: OperatingExpenseLines = {
    management: 0.05 * egi, // 5% of EGI per the workbook's own input for this deal
    municipalTax: 31680 + 1537, // Realty Taxes: City + School combined in the source, split here per this platform's fields
    schoolTax: 0,
    water: 0, gas: 0, hydroCommon: 2000,
    insurance: 13894,
    maintenance: 13552,
    salaries: 0,
    otherCosts: 4600,
    elevatorOperating: 0,
    replacementReserve: 0,
  }
  const totalExpenses = calcTotalExpenses(lines)
  const noi = calcNOI(egi, totalExpenses)

  it('NOI matches the workbook (G41 = $190,223.73)', () => {
    expect(totalExpenses).toBeCloseTo(80814.933, 2)
    expect(noi).toBeCloseTo(190223.727, 2)
  })

  it('Underwritten Value matches the workbook (G52 = $2,720,000 at 7% cap rate)', () => {
    expect(calcUnderwrittenValue(noi, 7)).toBe(2720000)
  })

  const loanAmount = 1980000
  const rate = 6
  const amortYears = 25
  const monthly = monthlyMortgagePayment(loanAmount, rate, amortYears)
  const annual = monthly * 12

  it('1st mortgage monthly/annual payment matches the workbook (J65/J66)', () => {
    expect(monthly).toBeCloseTo(12668.1711, 2)
    expect(annual).toBeCloseTo(152018.0532, 1)
  })

  it('DSCR matches the workbook (J68 = 1.2513x)', () => {
    expect(calcDSCR(noi, annual)).toBeCloseTo(1.251323267, 4)
  })

  it('LTV against appraised value matches the workbook (J69 = 72%)', () => {
    expect(calcLTV(loanAmount, 2750000)).toBeCloseTo(72, 6)
  })

  it('CMHC application fee matches the workbook (J75 = $600, 4 units × $150)', () => {
    expect(cmhcApplicationFee(4)).toBe(600)
  })

  it('CMHC premium matches the workbook (J76 = $44,550 — 70-75% LTV band = 2.25%, 25yr amort = 0% surcharge)', () => {
    const result = cmhcPremiumAmount(loanAmount, 2750000, 2750000, amortYears)
    expect(result.ltvPct).toBeCloseTo(72, 6)
    expect(result.ltvBandPct).toBe(2.25)
    expect(result.amortSurchargePct).toBe(0)
    expect(result.premiumAmount).toBeCloseTo(44550, 2)
    expect(result.insurable).toBe(true)
  })
})

describe('loan sizing — DSCR-constrained, matching the 1212 Patriotes deal ($1.2M loan)', () => {
  it('DSCR requirement follows the term (1.30x ≤5yr, 1.20x ≥10yr)', () => {
    expect(requiredDscrForTerm(5)).toBe(1.30)
    expect(requiredDscrForTerm(10)).toBe(1.20)
  })
  it('sizes the loan the NOI can service at the target DSCR (Anthony: NOI $80,858 → ~$1.2M at 4.25%/40yr)', () => {
    const loan = loanFromDscr(80858, 4.25, 40, 1.30)
    expect(loan).toBeGreaterThan(1_180_000)
    expect(loan).toBeLessThan(1_220_000)
  })
  it('takes the LESSER of the DSCR loan and the LTV cap', () => {
    // Underwritten value $1.9M, 85% LTV cap = $1.615M → DSCR ($1.2M) binds.
    const dscrBound = sizeCmhcFirstMortgage({ noi: 80858, annualRatePct: 4.25, amortYears: 40, termYears: 5, value: 1_900_000 })
    expect(dscrBound.boundBy).toBe('dscr')
    // A tiny value makes the LTV cap bind instead.
    const ltvBound = sizeCmhcFirstMortgage({ noi: 80858, annualRatePct: 4.25, amortYears: 40, termYears: 5, value: 500_000 })
    expect(ltvBound.boundBy).toBe('ltv')
    expect(ltvBound.loan).toBeCloseTo(425_000, 0) // 500k × 85%
  })
})

describe('CMHC premium LTV band boundaries (source cell J76 — note the 86% top, not 85%)', () => {
  const cases: Array<[number, number | null]> = [
    [65, 1.75], [65.01, 2.00], [70, 2.00], [70.01, 2.25],
    [75, 2.25], [75.01, 3.50], [80, 3.50], [80.01, 4.50],
    [86, 4.50], [86.01, null],
  ]
  for (const [ltv, expected] of cases) {
    it(`LTV ${ltv}% -> ${expected == null ? 'not insurable' : expected + '%'}`, () => {
      expect(cmhcPremiumRate(ltv, 25).ltvBandPct).toBe(expected)
    })
  }
})

describe('CMHC amortization surcharge boundaries', () => {
  const cases: Array<[number, number | null]> = [
    [25, 0], [25.01, 0.25], [30, 0.25], [30.01, 0.50],
    [35, 0.50], [35.01, 0.75], [40, 0.75], [40.01, null],
  ]
  for (const [years, expected] of cases) {
    it(`${years}yr amort -> ${expected == null ? 'not eligible' : expected + '%'} surcharge`, () => {
      expect(cmhcPremiumRate(50, years).amortSurchargePct).toBe(expected)
    })
  }
})

describe('breakeven rent per unit — regression guard against the source workbook\'s row-93 bug', () => {
  // Source row 93 ("Combined Breakeven Rent/Unit") is byte-identical to row
  // 91 ("Combined Loan per Unit") — a copy-paste bug producing $495,000 as a
  // "monthly rent." Our implementation must never coincide with loan/unit.
  it('does not equal combined loan per unit (the bug value)', () => {
    const grossResidentialAnnual = 66756 // 6 units x avg $927.17/mo from the workbook's Rent Roll Analysis tab
    const noi = 190223.727
    const combinedAnnualDebtService = 152018.0532
    const units = 6
    const combinedLoanPerUnit = 1980000 / units // = 330000, the buggy row-93 style value

    const breakeven = calcBreakevenRentPerUnit(grossResidentialAnnual, noi, combinedAnnualDebtService, units)
    expect(breakeven).not.toBeCloseTo(combinedLoanPerUnit, 0)
    // Sanity: a real breakeven rent for a small residential building should
    // be a plausible monthly-rent-per-unit figure, not six figures.
    expect(Math.abs(breakeven)).toBeLessThan(50000)
  })

  it('average rent per unit uses residential revenue only (matches workbook G15-based J72)', () => {
    // 6 units, $66,756/yr residential -> ($66,756/6)/12 = $927.17/mo, matching
    // the Rent Roll Analysis tab's own average of $927.17.
    expect(calcAverageRentPerUnit(66756, 6)).toBeCloseTo(927.1666667, 2)
  })
})

describe('expense benchmarking — greater-of-actual-or-benchmark rule', () => {
  it('uses actual when actual exceeds benchmark', () => {
    const r = applyExpenseBenchmark(5000, 3000)
    expect(r.applied).toBe(5000)
    expect(r.source).toBe('actual_exceeds_benchmark')
  })
  it('uses benchmark when benchmark exceeds actual', () => {
    const r = applyExpenseBenchmark(2000, 3000)
    expect(r.applied).toBe(3000)
    expect(r.source).toBe('benchmark_exceeds_actual')
  })
  it('falls back to benchmark alone when no actual is entered', () => {
    const r = applyExpenseBenchmark(null, 3000)
    expect(r.applied).toBe(3000)
    expect(r.source).toBe('benchmark_only')
  })
})

describe('replacement reserve benchmark — Concrete tier has no separate elevator line', () => {
  it('appliances and A/C are annual allowances, not monthly ($60/appliance/yr, $190/AC/yr)', () => {
    // Per CMHC's Quebec benchmark + the client walkthrough: $60 per appliance
    // per YEAR and $190 per A/C per YEAR (only the elevator is per month).
    expect(computeReplacementReserveBenchmark('wood_frame_le11', { applianceCount: 5, heatPumpOrAcCount: 0, elevatorCount: 0 })).toBeCloseTo(300, 2)
    expect(computeReplacementReserveBenchmark('wood_frame_le11', { applianceCount: 0, heatPumpOrAcCount: 1, elevatorCount: 0 })).toBeCloseTo(190, 2)
    expect(computeReplacementReserveBenchmark('wood_frame_le11', { applianceCount: 0, heatPumpOrAcCount: 0, elevatorCount: 0 })).toBe(0)
  })
  it('wood-frame tier adds an elevator component (elevator is per month → × 12)', () => {
    const withElevator = computeReplacementReserveBenchmark('wood_frame_le11', { applianceCount: 5, heatPumpOrAcCount: 0, elevatorCount: 1 })
    const withoutElevator = computeReplacementReserveBenchmark('wood_frame_le11', { applianceCount: 5, heatPumpOrAcCount: 0, elevatorCount: 0 })
    expect(withElevator - withoutElevator).toBeCloseTo(315 * 12, 2)
  })
  it('concrete tier ignores elevatorCount entirely (already folded into maintenance PUPA)', () => {
    const withElevator = computeReplacementReserveBenchmark('concrete', { applianceCount: 5, heatPumpOrAcCount: 0, elevatorCount: 1 })
    const withoutElevator = computeReplacementReserveBenchmark('concrete', { applianceCount: 5, heatPumpOrAcCount: 0, elevatorCount: 0 })
    expect(withElevator).toBe(withoutElevator)
  })
})

describe('rent roll aggregation', () => {
  it('summarizes by suite type and computes residential + parking totals', () => {
    const units: RentRollUnit[] = [
      { id: '1', unitLabel: '1', suiteType: '2br', suiteSizeSqft: null, monthlyRent: 880, parkingMonthly: 0 },
      { id: '2', unitLabel: '2', suiteType: '2br', suiteSizeSqft: null, monthlyRent: 947, parkingMonthly: 50 },
      { id: '3', unitLabel: '3', suiteType: '1br', suiteSizeSqft: null, monthlyRent: 700, parkingMonthly: 0 },
    ]
    const summary = summarizeRentRoll(units)
    expect(summary.totalUnits).toBe(3)
    expect(summary.grossResidentialAnnual).toBeCloseTo((880 + 947 + 700) * 12, 2)
    expect(summary.parkingAnnual).toBeCloseTo(50 * 12, 2)
    const twoBr = summary.byType.find(t => t.suiteType === '2br')!
    expect(twoBr.unitCount).toBe(2)
    expect(twoBr.avgMonthlyRent).toBeCloseTo((880 + 947) / 2, 2)
  })
})

describe('amortization schedule', () => {
  it('first row payment (interest + principal) matches the headline monthly payment', () => {
    const principal = 1980000, rate = 6, amortYears = 25
    const schedule = buildAmortizationSchedule(principal, rate, amortYears)
    const payment = monthlyMortgagePayment(principal, rate, amortYears)
    expect(schedule[0].interestPortion + schedule[0].principalPortion).toBeCloseTo(payment, 2)
    expect(schedule.length).toBe(amortYears * 12)
  })

  it('balance reaches (approximately) zero at the final row', () => {
    const schedule = buildAmortizationSchedule(1980000, 6, 25)
    expect(schedule[schedule.length - 1].endingBalance).toBeLessThan(1)
  })

  it('balanceAfterNPayments matches the schedule\'s balance at the same payment number', () => {
    const principal = 1980000, rate = 6, amortYears = 25
    const schedule = buildAmortizationSchedule(principal, rate, amortYears)
    const r = canadianEffectiveMonthlyRate(rate)
    const payment = monthlyMortgagePayment(principal, rate, amortYears)
    const bal60 = balanceAfterNPayments(principal, r, payment, 60)
    expect(bal60).toBeCloseTo(schedule[59].endingBalance, 1)
  })
})

describe('yield maintenance', () => {
  it('produces a positive penalty when the bond yield has dropped below the mortgage rate', () => {
    const result = calcYieldMaintenance({
      outstandingBalance: 1980000, remainingTermMonths: 60, remainingAmortMonths: 300,
      mortgageRatePct: 6, bondYieldPct: 3,
    })
    expect(result.penalty).toBeGreaterThan(0)
    expect(result.valueAtPayout).toBeGreaterThan(result.balanceAtMaturity)
  })

  it('floors the penalty at $0 when the bond yield is above the mortgage rate (deliberate improvement over the raw Excel)', () => {
    const result = calcYieldMaintenance({
      outstandingBalance: 1980000, remainingTermMonths: 60, remainingAmortMonths: 300,
      mortgageRatePct: 4, bondYieldPct: 6,
    })
    expect(result.penalty).toBe(0)
  })
})

describe('net cash flow — independent of the opex-embedded replacement reserve', () => {
  it('subtracts the below-NOI structural reserve % of EGI, separate from any opex reserve line', () => {
    const noi = 190223.727
    const egi = 271038.66
    expect(calcNetCashFlow(noi, 0, egi)).toBeCloseTo(noi, 2)
    expect(calcNetCashFlow(noi, 2, egi)).toBeCloseTo(noi - 0.02 * egi, 2)
  })
})
