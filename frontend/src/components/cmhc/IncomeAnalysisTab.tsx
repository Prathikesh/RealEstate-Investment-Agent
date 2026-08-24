import { TrendingUp, Receipt, Calculator, Landmark, ArrowLeftRight } from 'lucide-react'
import { Panel, Row, InputRow, NumField, StatTile, fmt$, fmtPct, toNum, toNumOrNull } from './primitives'
import {
  summarizeRentRoll, calcTotalGrossIncome, calcVacancyAllowance, calcEGI,
  computeBenchmarkedExpenses, calcTotalExpenses, calcNOI, calcNetCashFlow, calcExpensesLessTaxesPerUnit,
  calcUnderwrittenValue, calcAdjustedValue, perUnit,
  monthlyMortgagePayment, calcDSCR, calcLTV, cmhcApplicationFee, cmhcPremiumAmount, totalCmhcLoanAmount,
  calcAverageRentPerUnit, calcBreakevenRentPerUnit, calcEquityTakeOut,
  type OperatingExpenseLines, type BenchmarkedLine,
} from '../../lib/cmhcUnderwriting'
import { CMHC_BENCHMARK_TIER_OPTIONS, type CmhcBuildingTier } from '../../lib/cmhcQuebecBenchmarks'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'

type Updater = <K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) => void

function BenchmarkRow({ label, line, unit }: { label: string; line: BenchmarkedLine; unit: string }) {
  const sourceLabel =
    line.source === 'actual_exceeds_benchmark' ? 'Actual (exceeds benchmark)' :
    line.source === 'benchmark_exceeds_actual' ? 'Benchmark (exceeds actual)' :
    'Benchmark (no actual entered)'
  return (
    <div className="flex items-center justify-between gap-4 py-[7px] border-b border-surface-border last:border-b-0">
      <div className="flex-1">
        <p className="text-sm text-ink">{label}</p>
        <p className="text-[11px] text-muted/70">
          Actual: {line.actual != null ? fmt$(line.actual) : '—'} &nbsp;·&nbsp; Benchmark: {fmt$(line.benchmark)} {unit}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono tabular-nums text-sm font-semibold text-ink">{fmt$(line.applied)}</p>
        <p className={line.source === 'benchmark_exceeds_actual' ? 'text-[10px] text-score-market font-medium' : 'text-[10px] text-muted/60'}>
          {sourceLabel}
        </p>
      </div>
    </div>
  )
}

export default function IncomeAnalysisTab({ inputs, update, defaultTier }: {
  inputs: CmhcUnderwritingInputs
  update: Updater
  defaultTier: CmhcBuildingTier
}) {
  const units = inputs.rentRoll.length
  const rentRollSummary = summarizeRentRoll(inputs.rentRoll)
  const commercialAnnual = toNum(inputs.commercialAnnual)
  const lockersAnnual = toNum(inputs.lockersAnnual)
  const totalGrossIncome = calcTotalGrossIncome(rentRollSummary.grossResidentialAnnual, commercialAnnual, lockersAnnual, rentRollSummary.parkingAnnual)
  const vacancyPct = toNum(inputs.vacancyPct)
  const vacancyAllowance = calcVacancyAllowance(totalGrossIncome, vacancyPct)
  const egi = calcEGI(totalGrossIncome, vacancyAllowance)

  const benchmarked = computeBenchmarkedExpenses(
    inputs.constructionTier, units, egi,
    {
      managementActual: toNumOrNull(inputs.managementActual),
      salariesActual: toNumOrNull(inputs.salariesActual),
      maintenanceActual: toNumOrNull(inputs.maintenanceActual),
      otherCostsActual: toNumOrNull(inputs.otherCostsActual),
      replacementReserveActual: toNumOrNull(inputs.replacementReserveActual),
    },
    {
      applianceCount: toNum(inputs.reserveCounts.applianceCount),
      heatPumpOrAcCount: toNum(inputs.reserveCounts.heatPumpOrAcCount),
      elevatorCount: toNum(inputs.reserveCounts.elevatorCount),
    },
  )

  const municipalTax = toNum(inputs.municipalTax)
  const schoolTax = toNum(inputs.schoolTax)
  const water = toNum(inputs.water)
  const gas = toNum(inputs.gas)
  const hydroCommon = toNum(inputs.hydroCommon)
  const insurance = toNum(inputs.insurance)
  const elevatorOperating = toNum(inputs.elevatorOperating)

  const lines: OperatingExpenseLines = {
    management: benchmarked.management.applied, municipalTax, schoolTax, water, gas, hydroCommon, insurance,
    maintenance: benchmarked.maintenance.applied, salaries: benchmarked.salaries.applied,
    otherCosts: benchmarked.otherCosts.applied, elevatorOperating, replacementReserve: benchmarked.replacementReserve.applied,
  }
  const totalExpenses = calcTotalExpenses(lines)
  const noi = calcNOI(egi, totalExpenses)
  const netCashFlow = calcNetCashFlow(noi, toNum(inputs.structuralReservePctForNcf), egi)
  const expensesLessTaxesPerUnit = calcExpensesLessTaxesPerUnit(totalExpenses, municipalTax, schoolTax, units)

  const capRatePct = toNum(inputs.capRatePct)
  const underwrittenValue = calcUnderwrittenValue(noi, capRatePct)
  const capexAdjustment = toNum(inputs.capexAdjustment)
  const adjustedValue = calcAdjustedValue(underwrittenValue, capexAdjustment)
  const appraisedValue = toNumOrNull(inputs.appraisedValue)
  const purchasePrice = toNum(inputs.purchasePrice)

  const loan1 = toNum(inputs.mortgage1.loanAmount)
  const rate1 = toNum(inputs.mortgage1.ratePct)
  const amort1 = toNum(inputs.mortgage1.amortYears)
  const monthlyPmt1 = monthlyMortgagePayment(loan1, rate1, amort1)
  const annualPmt1 = monthlyPmt1 * 12
  const dscr1 = calcDSCR(noi, annualPmt1)
  const ltv1 = calcLTV(loan1, appraisedValue ?? purchasePrice)
  const appFee = cmhcApplicationFee(units)
  const premium1 = cmhcPremiumAmount(loan1, appraisedValue, purchasePrice, amort1)
  const totalCmhcLoan1 = totalCmhcLoanAmount(loan1, appFee, premium1.premiumAmount ?? 0)
  const avgRentPerUnit = calcAverageRentPerUnit(rentRollSummary.grossResidentialAnnual, units)
  const breakevenRentPerUnit1 = calcBreakevenRentPerUnit(rentRollSummary.grossResidentialAnnual, noi, annualPmt1, units)

  const loan2 = inputs.mortgage2Enabled ? toNum(inputs.mortgage2.loanAmount) : 0
  const rate2 = toNum(inputs.mortgage2.ratePct)
  const amort2 = toNum(inputs.mortgage2.amortYears)
  const monthlyPmt2 = inputs.mortgage2Enabled && loan2 > 0 ? monthlyMortgagePayment(loan2, rate2, amort2) : 0
  const annualPmt2 = monthlyPmt2 * 12

  const combinedLoan = loan1 + loan2
  const combinedAnnualPmt = annualPmt1 + annualPmt2
  const combinedDscr = calcDSCR(noi, combinedAnnualPmt)
  const combinedLtv = calcLTV(combinedLoan, underwrittenValue) // source: combined LTV uses Underwritten Value, not appraised/purchase
  const combinedBreakevenRentPerUnit = calcBreakevenRentPerUnit(rentRollSummary.grossResidentialAnnual, noi, combinedAnnualPmt, units)

  const existingDebt = toNum(inputs.existingDebt)
  const equityTakeOut = calcEquityTakeOut(combinedLoan, existingDebt)

  const setM1 = (patch: Partial<typeof inputs.mortgage1>) => update('mortgage1', { ...inputs.mortgage1, ...patch })
  const setM2 = (patch: Partial<typeof inputs.mortgage2>) => update('mortgage2', { ...inputs.mortgage2, ...patch })
  const setReserveCounts = (patch: Partial<typeof inputs.reserveCounts>) => update('reserveCounts', { ...inputs.reserveCounts, ...patch })

  return (
    <div className="space-y-5">

      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Effective Gross Income" value={fmt$(egi)} />
        <StatTile label="Net Operating Income" value={fmt$(noi)} valueClass={noi < 0 ? 'text-score-notrecommended' : 'text-score-strong'} />
        <StatTile label="Underwritten Value" value={fmt$(underwrittenValue)} formula={`NOI ÷ ${capRatePct}% cap rate`} />
        <StatTile label="1st Mortgage DSCR" value={dscr1 != null ? `${dscr1.toFixed(2)}×` : '—'} valueClass={dscr1 != null && dscr1 < 1.2 ? 'text-score-notrecommended' : undefined} formula="NOI ÷ annual debt service" />
      </div>

      {/* ── Revenue ── */}
      <Panel title="Revenue" icon={<TrendingUp size={13} />}>
        <div>
          <Row label="Gross Residential Revenue" sub="(from Rent Roll tab)" value={fmt$(rentRollSummary.grossResidentialAnnual)} />
          <InputRow label="Commercial Revenue">
            <NumField label="Commercial Revenue" value={inputs.commercialAnnual} onChange={v => update('commercialAnnual', v)} suffix="$" />
          </InputRow>
          <InputRow label="Lockers Revenue">
            <NumField label="Lockers Revenue" value={inputs.lockersAnnual} onChange={v => update('lockersAnnual', v)} suffix="$" />
          </InputRow>
          <Row label="Parking Revenue" sub="(from Rent Roll tab)" value={fmt$(rentRollSummary.parkingAnnual)} />
          <Row label="Total Gross Income" value={fmt$(totalGrossIncome)} bold />
          <InputRow label="Vacancy Allowance">
            <NumField label="Vacancy %" value={inputs.vacancyPct} onChange={v => update('vacancyPct', v)} suffix="%" width="w-20" />
          </InputRow>
          <Row label="Vacancy Allowance $" value={fmt$(vacancyAllowance)} negative indent />
          <Row label="Effective Gross Income (EGI)" value={fmt$(egi)} bold />
        </div>
      </Panel>

      {/* ── Operating expenses ── */}
      <Panel
        title="Operating Expenses"
        icon={<Receipt size={13} />}
        aside={
          <select
            value={inputs.constructionTier}
            onChange={e => update('constructionTier', e.target.value as CmhcBuildingTier)}
            className="select text-xs py-1"
            aria-label="Construction type (for CMHC benchmark tier)"
          >
            {CMHC_BENCHMARK_TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        }
      >
        <p className="text-[11px] text-muted/70 -mt-1 mb-1">
          Default tier for {units} units: {CMHC_BENCHMARK_TIER_OPTIONS.find(o => o.value === defaultTier)?.label}.
          CMHC's rule: taxes/insurance/utilities always use actuals; the rest use the greater of actual or benchmark.
        </p>
        <div>
          <InputRow label="Municipal Taxes" source="listing" sourceTitle="From listing data">
            <NumField label="Municipal Taxes" value={inputs.municipalTax} onChange={v => update('municipalTax', v)} suffix="$" />
          </InputRow>
          <InputRow label="School Taxes" source="listing" sourceTitle="From listing data">
            <NumField label="School Taxes" value={inputs.schoolTax} onChange={v => update('schoolTax', v)} suffix="$" />
          </InputRow>
          <InputRow label="Water">
            <NumField label="Water" value={inputs.water} onChange={v => update('water', v)} suffix="$" />
          </InputRow>
          <InputRow label="Gas">
            <NumField label="Gas" value={inputs.gas} onChange={v => update('gas', v)} suffix="$" />
          </InputRow>
          <InputRow label="Hydro (common area)">
            <NumField label="Hydro (common area)" value={inputs.hydroCommon} onChange={v => update('hydroCommon', v)} suffix="$" />
          </InputRow>
          <InputRow label="Insurance">
            <NumField label="Insurance" value={inputs.insurance} onChange={v => update('insurance', v)} suffix="$" />
          </InputRow>
          <InputRow label="Elevator (operating)">
            <NumField label="Elevator (operating)" value={inputs.elevatorOperating} onChange={v => update('elevatorOperating', v)} suffix="$" />
          </InputRow>
        </div>

        <div className="pt-2 border-t border-surface-border space-y-1">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Benchmarked — enter actual to compare, leave blank to use the benchmark</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <InputRow label="Management, actual">
              <NumField label="Management, actual" value={inputs.managementActual} onChange={v => update('managementActual', v)} suffix="$" placeholder="blank = benchmark" />
            </InputRow>
            <InputRow label="Salaries, actual">
              <NumField label="Salaries, actual" value={inputs.salariesActual} onChange={v => update('salariesActual', v)} suffix="$" placeholder="blank = benchmark" />
            </InputRow>
            <InputRow label="Repairs &amp; Maintenance, actual">
              <NumField label="Repairs & Maintenance, actual" value={inputs.maintenanceActual} onChange={v => update('maintenanceActual', v)} suffix="$" placeholder="blank = benchmark" />
            </InputRow>
            <InputRow label="Other Costs, actual">
              <NumField label="Other Costs, actual" value={inputs.otherCostsActual} onChange={v => update('otherCostsActual', v)} suffix="$" placeholder="blank = benchmark" />
            </InputRow>
          </div>
          <div className="grid grid-cols-3 gap-2 py-2">
            <NumField label="Appliances count" value={inputs.reserveCounts.applianceCount} onChange={v => setReserveCounts({ applianceCount: v })} width="w-full" />
            <NumField label="Heat pump / AC count" value={inputs.reserveCounts.heatPumpOrAcCount} onChange={v => setReserveCounts({ heatPumpOrAcCount: v })} width="w-full" />
            <NumField label="Elevator count" value={inputs.reserveCounts.elevatorCount} onChange={v => setReserveCounts({ elevatorCount: v })} width="w-full" />
          </div>
          <InputRow label="Replacement Reserve, actual">
            <NumField label="Replacement Reserve, actual" value={inputs.replacementReserveActual} onChange={v => update('replacementReserveActual', v)} suffix="$" placeholder="blank = benchmark" />
          </InputRow>

          <div className="pt-2">
            <BenchmarkRow label="Management" line={benchmarked.management} unit="/yr" />
            <BenchmarkRow label="Salaries" line={benchmarked.salaries} unit="/yr" />
            <BenchmarkRow label="Repairs & Maintenance" line={benchmarked.maintenance} unit="/yr" />
            <BenchmarkRow label="Other Costs" line={benchmarked.otherCosts} unit="/yr" />
            <BenchmarkRow label="Replacement Reserve" line={benchmarked.replacementReserve} unit="/yr" />
          </div>
        </div>

        <Row label="Total Expenses" value={fmt$(totalExpenses)} bold />
        <Row label="Total Expenses less Taxes, per unit" value={fmt$(expensesLessTaxesPerUnit)} />
      </Panel>

      {/* ── NOI / Net Cash Flow ── */}
      <Panel title="NOI &amp; Net Cash Flow" icon={<Calculator size={13} />}>
        <Row label="Net Operating Income (NOI)" value={fmt$(noi)} bold red={noi < 0} />
        <InputRow label="Structural Reserve (below NOI)" sub="% of EGI, separate from the opex reserve line above">
          <NumField label="Structural Reserve %" value={inputs.structuralReservePctForNcf} onChange={v => update('structuralReservePctForNcf', v)} suffix="%" width="w-20" />
        </InputRow>
        <Row label="Net Cash Flow" value={fmt$(netCashFlow)} bold red={netCashFlow < 0} />
      </Panel>

      {/* ── Valuation ── */}
      <Panel title="Valuation" icon={<Calculator size={13} />}>
        <InputRow label="Capitalization Rate">
          <NumField label="Capitalization Rate" value={inputs.capRatePct} onChange={v => update('capRatePct', v)} suffix="%" width="w-20" />
        </InputRow>
        <Row label="Underwritten Value" value={fmt$(underwrittenValue)} sub={fmt$(perUnit(underwrittenValue, units)) + '/unit'} bold />
        <InputRow label="CAPEX Adjustment">
          <NumField label="CAPEX Adjustment" value={inputs.capexAdjustment} onChange={v => update('capexAdjustment', v)} suffix="$" />
        </InputRow>
        <Row label="Adjusted Value" value={fmt$(adjustedValue)} sub={fmt$(perUnit(adjustedValue, units)) + '/unit'} bold />
        <InputRow label="Appraised Value" sub="optional — leave blank to use Purchase Price for LTV">
          <NumField label="Appraised Value" value={inputs.appraisedValue} onChange={v => update('appraisedValue', v)} suffix="$" placeholder="optional" />
        </InputRow>
        <InputRow label="Purchase Price" source="listing" sourceTitle="From listing data">
          <NumField label="Purchase Price" value={inputs.purchasePrice} onChange={v => update('purchasePrice', v)} suffix="$" />
        </InputRow>
      </Panel>

      {/* ── 1st Mortgage ── */}
      <Panel title="1st Mortgage — CMHC MLI" icon={<Landmark size={13} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-surface-border">
          <div><label className="text-xs text-muted block mb-1">Loan Amount</label><NumField label="Loan Amount" value={inputs.mortgage1.loanAmount} onChange={v => setM1({ loanAmount: v })} suffix="$" width="w-full" /></div>
          <div><label className="text-xs text-muted block mb-1">Rate</label><NumField label="Rate" value={inputs.mortgage1.ratePct} onChange={v => setM1({ ratePct: v })} suffix="%" width="w-full" /></div>
          <div><label className="text-xs text-muted block mb-1">Term (yrs)</label><NumField label="Term" value={inputs.mortgage1.termYears} onChange={v => setM1({ termYears: v })} width="w-full" /></div>
          <div><label className="text-xs text-muted block mb-1">Amortization (yrs)</label><NumField label="Amortization" value={inputs.mortgage1.amortYears} onChange={v => setM1({ amortYears: v })} width="w-full" /></div>
        </div>
        <Row label="Monthly Payment" value={fmt$(monthlyPmt1)} bold />
        <Row label="Annual Payment" value={fmt$(annualPmt1)} />
        <Row label="Debt Service Coverage Ratio" value={dscr1 != null ? `${dscr1.toFixed(2)}×` : '—'} red={dscr1 != null && dscr1 < 1.2} />
        <Row label="Loan to Value Ratio" value={ltv1 != null ? fmtPct(ltv1) : '—'} sub={premium1.insurable ? undefined : 'not insurable above 86% LTV'} red={ltv1 != null && !premium1.insurable} />
        <Row label="Loan per Unit" value={fmt$(perUnit(loan1, units))} />
        <Row label="Average Rent per Unit" value={fmt$(avgRentPerUnit)} sub="/month, residential only" />
        <Row label="Breakeven Rent per Unit" value={fmt$(breakevenRentPerUnit1)} sub="/month" />
        <Row label="CMHC Application Fee" value={fmt$(appFee)} />
        <Row
          label="CMHC Premium"
          value={premium1.insurable ? fmt$(premium1.premiumAmount ?? 0) : 'not insurable'}
          sub={premium1.insurable ? `${premium1.ltvBandPct}% LTV band + ${premium1.amortSurchargePct}% amort surcharge` : undefined}
          red={!premium1.insurable}
        />
        <Row label="Total CMHC Loan Amount" value={fmt$(totalCmhcLoan1)} bold />
      </Panel>

      {/* ── 2nd Mortgage ── */}
      <Panel
        title="2nd Mortgage"
        icon={<Landmark size={13} />}
        aside={
          <label className="inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={inputs.mortgage2Enabled} onChange={e => update('mortgage2Enabled', e.target.checked)} />
            Include 2nd mortgage
          </label>
        }
      >
        {inputs.mortgage2Enabled ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-surface-border">
              <div><label className="text-xs text-muted block mb-1">Loan Amount</label><NumField label="Loan Amount 2" value={inputs.mortgage2.loanAmount} onChange={v => setM2({ loanAmount: v })} suffix="$" width="w-full" /></div>
              <div><label className="text-xs text-muted block mb-1">Rate</label><NumField label="Rate 2" value={inputs.mortgage2.ratePct} onChange={v => setM2({ ratePct: v })} suffix="%" width="w-full" /></div>
              <div><label className="text-xs text-muted block mb-1">Term (yrs)</label><NumField label="Term 2" value={inputs.mortgage2.termYears} onChange={v => setM2({ termYears: v })} width="w-full" /></div>
              <div><label className="text-xs text-muted block mb-1">Amortization (yrs)</label><NumField label="Amortization 2" value={inputs.mortgage2.amortYears} onChange={v => setM2({ amortYears: v })} width="w-full" /></div>
            </div>
            <Row label="Monthly Payment (2nd)" value={fmt$(monthlyPmt2)} />
            <Row label="Combined Loan (1st + 2nd)" value={fmt$(combinedLoan)} bold />
            <Row label="Combined Annual Payments" value={fmt$(combinedAnnualPmt)} />
            <Row label="Combined DSCR" value={combinedDscr != null ? `${combinedDscr.toFixed(2)}×` : '—'} red={combinedDscr != null && combinedDscr < 1.2} />
            <Row label="Combined LTV" value={combinedLtv != null ? fmtPct(combinedLtv) : '—'} sub="vs. Underwritten Value" />
            <Row label="Combined Loan per Unit" value={fmt$(perUnit(combinedLoan, units))} />
            <Row label="Combined Breakeven Rent per Unit" value={fmt$(combinedBreakevenRentPerUnit)} sub="/month" />
          </>
        ) : (
          <p className="text-sm text-muted py-2">Not included. Check "Include 2nd mortgage" to add secondary financing.</p>
        )}
      </Panel>

      {/* ── Refinance ── */}
      <Panel title="Refinance" icon={<ArrowLeftRight size={13} />}>
        <InputRow label="Existing Debt">
          <NumField label="Existing Debt" value={inputs.existingDebt} onChange={v => update('existingDebt', v)} suffix="$" />
        </InputRow>
        <Row label="Equity Take Out" value={fmt$(equityTakeOut)} bold negative={equityTakeOut < 0} />
        <InputRow label="Prepayment Penalty" sub="or use the Yield Maintenance tab">
          <NumField label="Prepayment Penalty" value={inputs.prepaymentPenalty} onChange={v => update('prepaymentPenalty', v)} suffix="$" />
        </InputRow>
      </Panel>
    </div>
  )
}
