/**
 * CMHC MLI (multi-unit insured lending) underwriting math — mirrors the
 * client-provided "Multi-Res Income Analysis Template" workbook, formula for
 * formula, for 4+ unit properties (quadruplex / quintuplex_plus).
 *
 * A few things fixed relative to the source spreadsheet (found by directly
 * inspecting its live formulas, not just its printed values):
 *  - The CMHC premium LTV band tops out at 86%, not 85% (source cell J76).
 *  - The 1st-mortgage LTV divides by Appraised (or Purchase) Value; the
 *    COMBINED (1st+2nd) LTV divides by the Underwritten Value instead — two
 *    genuinely different denominators in the source file, both preserved
 *    here as separate functions rather than unified into one.
 *  - Average/Breakeven Rent per Unit use residential gross revenue only
 *    (excludes commercial/lockers/parking), matching the source's `G15`.
 *  - The source's "Combined Breakeven Rent/Unit" cell is a copy-paste bug —
 *    byte-identical to "Combined Loan per Unit" above it (same cached value,
 *    $495,000, which is nonsense as a monthly rent). calcBreakevenRentPerUnit
 *    below implements the CORRECT formula (by analogy with the working
 *    1st-mortgage-only version) for both cases — see its regression test.
 *  - Structural Reserve is two independent inputs in the source (an opex
 *    line feeding NOI, and a separate below-NOI % feeding Net Cash Flow) —
 *    kept as two separate parameters here, not one toggle.
 *
 * This is a SEPARATE, PARALLEL program from FinancingWorkbench.tsx's own
 * cmhcPremiumPct() (standard high-ratio HOMEOWNER mortgage insurance,
 * down-payment-tier based: 4.0/3.1/2.8/0%). Do not conflate the two — this
 * file implements CMHC's *multi-res* MLI premium (LTV-band + amortization
 * surcharge), a different CMHC program entirely. FinancingWorkbench.tsx is
 * not modified by this feature.
 */
import { CMHC_QC_BENCHMARK_TIERS, type CmhcBuildingTier } from './cmhcQuebecBenchmarks'

// ── A. Eligibility ───────────────────────────────────────────────────────────

export const CMHC_ELIGIBLE_PROPERTY_TYPES = new Set(['quadruplex', 'quintuplex_plus'])

export function isCmhcUnderwritingEligible(prop: { property_type: string; listing_type: string }): boolean {
  return CMHC_ELIGIBLE_PROPERTY_TYPES.has(prop.property_type) && prop.listing_type === 'for_sale'
}

// ── B. Rent roll ─────────────────────────────────────────────────────────────

export type SuiteType = 'bachelor' | '1br' | '2br' | '3br_plus'

export const SUITE_TYPE_LABELS: Record<SuiteType, string> = {
  bachelor: 'Bachelor', '1br': '1 Bedroom', '2br': '2 Bedroom', '3br_plus': '3+ Bedroom',
}

export interface RentRollUnit {
  id: string
  unitLabel: string
  suiteType: SuiteType | null
  suiteSizeSqft: number | null
  monthlyRent: number
  parkingMonthly: number
}

export interface RentRollTypeSummary {
  suiteType: SuiteType
  unitCount: number
  avgMonthlyRent: number
  annualRent: number
}

export interface RentRollSummary {
  byType: RentRollTypeSummary[]
  totalUnits: number
  grossResidentialAnnual: number
  parkingAnnual: number
}

export function summarizeRentRoll(units: RentRollUnit[]): RentRollSummary {
  const types: SuiteType[] = ['bachelor', '1br', '2br', '3br_plus']
  const byType: RentRollTypeSummary[] = types.map(suiteType => {
    const matching = units.filter(u => u.suiteType === suiteType)
    const unitCount = matching.length
    const totalMonthly = matching.reduce((sum, u) => sum + u.monthlyRent, 0)
    return {
      suiteType,
      unitCount,
      avgMonthlyRent: unitCount > 0 ? totalMonthly / unitCount : 0,
      annualRent: totalMonthly * 12,
    }
  })
  const grossResidentialAnnual = units.reduce((sum, u) => sum + u.monthlyRent, 0) * 12
  const parkingAnnual = units.reduce((sum, u) => sum + u.parkingMonthly, 0) * 12
  return { byType, totalUnits: units.length, grossResidentialAnnual, parkingAnnual }
}

// ── C. Revenue / vacancy / EGI ───────────────────────────────────────────────

export function calcTotalGrossIncome(residentialAnnual: number, commercialAnnual: number, lockersAnnual: number, parkingAnnual: number): number {
  return residentialAnnual + commercialAnnual + lockersAnnual + parkingAnnual
}

export function calcVacancyAllowance(totalGrossIncome: number, vacancyPct: number): number {
  return -(vacancyPct / 100) * totalGrossIncome
}

export function calcEGI(totalGrossIncome: number, vacancyAllowance: number): number {
  return totalGrossIncome + vacancyAllowance // vacancyAllowance is already negative
}

// ── D. Expense benchmarking ───────────────────────────────────────────────────
// CMHC's rule: taxes/insurance/utilities are always actual (no benchmark
// comparison at all). Management/Salaries/Maintenance/Other Costs/Reserve use
// the greater of actual or benchmark.

export type BenchmarkSource = 'actual_exceeds_benchmark' | 'benchmark_exceeds_actual' | 'benchmark_only'

export interface BenchmarkedLine {
  actual: number | null
  benchmark: number
  applied: number
  source: BenchmarkSource
}

export function applyExpenseBenchmark(actual: number | null, benchmark: number): BenchmarkedLine {
  if (actual == null) {
    return { actual, benchmark, applied: benchmark, source: 'benchmark_only' }
  }
  if (actual >= benchmark) {
    return { actual, benchmark, applied: actual, source: 'actual_exceeds_benchmark' }
  }
  return { actual, benchmark, applied: benchmark, source: 'benchmark_exceeds_actual' }
}

export interface ReplacementReserveCounts {
  applianceCount: number      // fridges + stoves + dishwashers + washers + dryers, summed
  heatPumpOrAcCount: number
  elevatorCount: number
}

export function computeReplacementReserveBenchmark(tier: CmhcBuildingTier, counts: ReplacementReserveCounts): number {
  // CMHC benchmarks: appliances ($60 each) and A/C units ($190 each) are annual
  // allowances; only the elevator ($315) is quoted per month. So appliances and
  // A/C are added as-is per year, and the elevator is annualized (× 12).
  const t = CMHC_QC_BENCHMARK_TIERS[tier]
  const elevatorAnnual = t.replacementReserve.perElevatorPerMonth != null
    ? t.replacementReserve.perElevatorPerMonth * counts.elevatorCount * 12
    : 0
  return (
    t.replacementReserve.perAppliancePerYear * counts.applianceCount +
    t.replacementReserve.perAcPerYear * counts.heatPumpOrAcCount +
    elevatorAnnual
  )
}

export interface ExpenseActuals {
  managementActual: number | null
  salariesActual: number | null
  maintenanceActual: number | null
  otherCostsActual: number | null
  replacementReserveActual: number | null
}

export interface BenchmarkedExpenses {
  management: BenchmarkedLine
  salaries: BenchmarkedLine
  maintenance: BenchmarkedLine
  otherCosts: BenchmarkedLine
  replacementReserve: BenchmarkedLine
}

export function computeBenchmarkedExpenses(
  tier: CmhcBuildingTier, units: number, egi: number, actuals: ExpenseActuals, reserveCounts: ReplacementReserveCounts,
): BenchmarkedExpenses {
  const t = CMHC_QC_BENCHMARK_TIERS[tier]
  return {
    management: applyExpenseBenchmark(actuals.managementActual, (t.managementPctEgi / 100) * egi),
    salaries: applyExpenseBenchmark(actuals.salariesActual, t.salariesPupa * units),
    maintenance: applyExpenseBenchmark(actuals.maintenanceActual, t.maintenancePupa * units),
    otherCosts: applyExpenseBenchmark(actuals.otherCostsActual, (t.otherCostsPctEgi / 100) * egi),
    replacementReserve: applyExpenseBenchmark(actuals.replacementReserveActual, computeReplacementReserveBenchmark(tier, reserveCounts)),
  }
}

// ── E. Operating expenses & NOI ───────────────────────────────────────────────

export interface OperatingExpenseLines {
  management: number
  municipalTax: number
  schoolTax: number
  water: number
  gas: number
  hydroCommon: number
  insurance: number
  maintenance: number
  salaries: number
  otherCosts: number
  elevatorOperating: number
  replacementReserve: number
}

export function calcTotalExpenses(lines: OperatingExpenseLines): number {
  return (
    lines.management + lines.municipalTax + lines.schoolTax + lines.water + lines.gas +
    lines.hydroCommon + lines.insurance + lines.maintenance + lines.salaries +
    lines.otherCosts + lines.elevatorOperating + lines.replacementReserve
  )
}

export function calcNOI(egi: number, totalExpenses: number): number {
  return egi - totalExpenses
}

/** structuralReservePctForNcf: the separate BELOW-NOI reserve % of EGI (row 45 in the source) — independent of the opex-embedded replacementReserve line above. */
export function calcNetCashFlow(noi: number, structuralReservePctForNcf: number, egi: number): number {
  return noi - (structuralReservePctForNcf / 100) * egi
}

export function calcExpensesLessTaxesPerUnit(totalExpenses: number, municipalTax: number, schoolTax: number, units: number): number {
  if (units <= 0) return 0
  return (totalExpenses - municipalTax - schoolTax) / units
}

// ── F. Valuation ───────────────────────────────────────────────────────────────

export function calcUnderwrittenValue(noi: number, capRatePct: number): number {
  if (capRatePct <= 0) return 0
  return Math.round(noi / (capRatePct / 100) / 10000) * 10000
}

export function calcAdjustedValue(underwrittenValue: number, capexAdjustment: number): number {
  return underwrittenValue - capexAdjustment
}

export function perUnit(value: number, units: number): number {
  return units > 0 ? value / units : 0
}

// ── G. Mortgage math ─────────────────────────────────────────────────────────
// Canadian mortgages compound semi-annually by law (Interest Act, RSC 1985,
// c I-15, s 6) regardless of payment frequency — same convention already
// used in FinancingWorkbench.tsx, reimplemented here as a standalone helper
// (deliberately not imported from there — see file header).

export function canadianEffectiveMonthlyRate(annualRatePct: number): number {
  return Math.pow(1 + annualRatePct / 100 / 2, 1 / 6) - 1
}

export function monthlyMortgagePayment(principal: number, annualRatePct: number, amortYears: number): number {
  if (principal <= 0 || annualRatePct <= 0 || amortYears <= 0) return 0
  const r = canadianEffectiveMonthlyRate(annualRatePct)
  const n = amortYears * 12
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

export function calcDSCR(noi: number, annualDebtService: number): number | null {
  return annualDebtService > 0 ? noi / annualDebtService : null
}

export function calcLTV(loanAmount: number, value: number): number | null {
  return value > 0 ? (loanAmount / value) * 100 : null
}

// ── Loan sizing ───────────────────────────────────────────────────────────────
// A CMHC MLI 1st mortgage is sized as the LESSER of (a) the amount the NOI can
// service at the required DSCR and (b) the LTV cap on value — "based on CCD and
// Value" in the source workbook. DSCR requirement follows the term: 1.30x for a
// 5-yr term, 1.20x for a 10-yr term (per the client's underwriter walkthrough).

/** CMHC MLI standard maximum loan-to-value for a purchase. */
export const CMHC_MAX_LTV_PCT = 85

export function requiredDscrForTerm(termYears: number): number {
  return termYears >= 10 ? 1.20 : 1.30
}

/** Largest principal whose annual payment (at rate/amort) the NOI covers at the target DSCR. */
export function loanFromDscr(noi: number, annualRatePct: number, amortYears: number, dscrTarget: number): number {
  if (noi <= 0 || annualRatePct <= 0 || amortYears <= 0 || dscrTarget <= 0) return 0
  const maxMonthlyPayment = (noi / dscrTarget) / 12
  const r = canadianEffectiveMonthlyRate(annualRatePct)
  const n = amortYears * 12
  const paymentPerDollar = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  return maxMonthlyPayment / paymentPerDollar
}

export interface SizedLoan {
  loan: number
  dscrTarget: number
  boundBy: 'dscr' | 'ltv'
}

export function sizeCmhcFirstMortgage(opts: {
  noi: number; annualRatePct: number; amortYears: number; termYears: number; value: number; maxLtvPct?: number
}): SizedLoan {
  const dscrTarget = requiredDscrForTerm(opts.termYears)
  const dscrLoan = loanFromDscr(opts.noi, opts.annualRatePct, opts.amortYears, dscrTarget)
  const ltvLoan = Math.max(0, opts.value) * ((opts.maxLtvPct ?? CMHC_MAX_LTV_PCT) / 100)
  return dscrLoan <= ltvLoan
    ? { loan: dscrLoan, dscrTarget, boundBy: 'dscr' }
    : { loan: ltvLoan, dscrTarget, boundBy: 'ltv' }
}

/** $150/unit under 100 units; $15,000 flat + $100/unit over 100 for the excess; capped at $50,000. */
export function cmhcApplicationFee(units: number): number {
  const fee = units < 100 ? units * 150 : 15000 + (units - 100) * 100
  return Math.min(50000, fee)
}

export interface CmhcPremiumRate {
  ltvBandPct: number | null       // null = not insurable (LTV > 86%)
  amortSurchargePct: number | null // null = not eligible (amort > 40yr)
}

export function cmhcPremiumRate(ltvPct: number, amortYears: number): CmhcPremiumRate {
  let ltvBandPct: number | null
  if (ltvPct <= 65) ltvBandPct = 1.75
  else if (ltvPct <= 70) ltvBandPct = 2.00
  else if (ltvPct <= 75) ltvBandPct = 2.25
  else if (ltvPct <= 80) ltvBandPct = 3.50
  else if (ltvPct <= 86) ltvBandPct = 4.50
  else ltvBandPct = null

  let amortSurchargePct: number | null
  if (amortYears <= 25) amortSurchargePct = 0
  else if (amortYears <= 30) amortSurchargePct = 0.25
  else if (amortYears <= 35) amortSurchargePct = 0.50
  else if (amortYears <= 40) amortSurchargePct = 0.75
  else amortSurchargePct = null

  return { ltvBandPct, amortSurchargePct }
}

export interface CmhcPremiumResult {
  ltvPct: number
  ltvBandPct: number | null
  amortSurchargePct: number | null
  premiumAmount: number | null   // null when not insurable/eligible
  insurable: boolean
}

/** LTV for the premium lookup = Loan ÷ (Appraised Value, falling back to Purchase Price). */
export function cmhcPremiumAmount(loanAmount: number, appraisedValue: number | null, purchasePrice: number, amortYears: number): CmhcPremiumResult {
  const value = appraisedValue ?? purchasePrice
  const ltvPct = value > 0 ? (loanAmount / value) * 100 : 0
  const { ltvBandPct, amortSurchargePct } = cmhcPremiumRate(ltvPct, amortYears)
  const insurable = ltvBandPct != null && amortSurchargePct != null
  const premiumAmount = insurable ? loanAmount * ((ltvBandPct! + amortSurchargePct!) / 100) : null
  return { ltvPct, ltvBandPct, amortSurchargePct, premiumAmount, insurable }
}

export function totalCmhcLoanAmount(loanAmount: number, applicationFee: number, premium: number): number {
  return loanAmount + applicationFee + premium
}

/** Residential revenue only (excludes commercial/lockers/parking), matching the source sheet's G15-based cells. */
export function calcAverageRentPerUnit(grossResidentialAnnual: number, units: number): number {
  return units > 0 ? (grossResidentialAnnual / units) / 12 : 0
}

/**
 * Average rent needed per unit, per month, just to break even (cover
 * expenses + debt service). Works for both the 1st-mortgage-only case and
 * the combined (1st+2nd) case — pass the appropriate annualDebtService.
 * (Fixes the source workbook's row-93 copy-paste bug for the combined case —
 * see file header and the regression test in cmhcUnderwriting.test.ts.)
 */
export function calcBreakevenRentPerUnit(grossResidentialAnnual: number, noi: number, annualDebtService: number, units: number): number {
  if (units <= 0) return 0
  return ((grossResidentialAnnual - (noi - annualDebtService)) / units) / 12
}

// ── H. Refinance ─────────────────────────────────────────────────────────────

export function calcEquityTakeOut(combinedNewLoan: number, existingDebt: number): number {
  return combinedNewLoan - existingDebt
}

// ── I. Amortization schedule ──────────────────────────────────────────────────

export interface AmortizationRow {
  paymentNum: number
  interestPortion: number
  principalPortion: number
  endingBalance: number
}

export function buildAmortizationSchedule(principal: number, annualRatePct: number, amortYears: number, capMonths?: number): AmortizationRow[] {
  if (principal <= 0 || annualRatePct <= 0 || amortYears <= 0) return []
  const r = canadianEffectiveMonthlyRate(annualRatePct)
  const payment = monthlyMortgagePayment(principal, annualRatePct, amortYears)
  const totalMonths = amortYears * 12
  const rows: AmortizationRow[] = []
  let balance = principal
  const n = capMonths != null ? Math.min(capMonths, totalMonths) : totalMonths
  for (let i = 1; i <= n; i++) {
    const interestPortion = balance * r
    const principalPortion = Math.min(payment - interestPortion, balance)
    balance = Math.max(0, balance - principalPortion)
    rows.push({ paymentNum: i, interestPortion, principalPortion, endingBalance: balance })
  }
  return rows
}

/** Standard remaining-balance formula — reused by the Amortization tab and Yield Maintenance's "Balance at Maturity." */
export function balanceAfterNPayments(principal: number, monthlyRate: number, payment: number, nPayments: number): number {
  if (monthlyRate === 0) return Math.max(0, principal - payment * nPayments)
  const growth = Math.pow(1 + monthlyRate, nPayments)
  return Math.max(0, principal * growth - payment * ((growth - 1) / monthlyRate))
}

// ── J. Yield Maintenance (prepayment penalty) ─────────────────────────────────

export interface YieldMaintenanceInputs {
  outstandingBalance: number
  remainingTermMonths: number
  remainingAmortMonths: number
  mortgageRatePct: number
  bondYieldPct: number
}

export interface YieldMaintenanceResult {
  monthlyPayment: number
  balanceAtMaturity: number
  valueAtPayout: number
  penalty: number
}

export function calcYieldMaintenance(inputs: YieldMaintenanceInputs): YieldMaintenanceResult {
  const { outstandingBalance, remainingTermMonths, remainingAmortMonths, mortgageRatePct, bondYieldPct } = inputs

  const mortgageMonthlyRate = canadianEffectiveMonthlyRate(mortgageRatePct)
  const monthlyPayment = monthlyMortgagePayment(outstandingBalance, mortgageRatePct, remainingAmortMonths / 12)
  const balanceAtMaturity = balanceAfterNPayments(outstandingBalance, mortgageMonthlyRate, monthlyPayment, remainingTermMonths)

  const bondMonthlyRate = canadianEffectiveMonthlyRate(bondYieldPct)
  const pvPayments = bondMonthlyRate > 0
    ? monthlyPayment * ((1 - Math.pow(1 + bondMonthlyRate, -remainingTermMonths)) / bondMonthlyRate)
    : monthlyPayment * remainingTermMonths
  const pvBalloon = balanceAtMaturity / Math.pow(1 + bondMonthlyRate, remainingTermMonths)
  const valueAtPayout = pvPayments + pvBalloon

  // Floors at $0 — a real prepayment penalty can't be negative (a deliberate
  // improvement over the raw Excel, which doesn't floor it).
  const penalty = Math.max(0, valueAtPayout - outstandingBalance)

  return { monthlyPayment, balanceAtMaturity, valueAtPayout, penalty }
}
