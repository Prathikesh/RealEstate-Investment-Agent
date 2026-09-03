import { TrendingUp, Receipt, Calculator, Landmark, ArrowLeftRight } from 'lucide-react'
import { Panel, Row, Field, FieldGrid, NumField, StatTile, ResultBox, fmt$, fmtPct, toNum, toNumOrNull } from './primitives'
import {
  summarizeRentRoll, calcTotalGrossIncome, calcVacancyAllowance, calcEGI,
  computeBenchmarkedExpenses, calcTotalExpenses, calcNOI, calcNetCashFlow, calcExpensesLessTaxesPerUnit,
  calcUnderwrittenValue, calcAdjustedValue, perUnit,
  monthlyMortgagePayment, calcDSCR, calcLTV, cmhcApplicationFee, cmhcPremiumAmount, totalCmhcLoanAmount,
  calcAverageRentPerUnit, calcBreakevenRentPerUnit, calcEquityTakeOut, sizeCmhcFirstMortgage, CMHC_MAX_LTV_PCT,
  type OperatingExpenseLines, type BenchmarkedLine,
} from '../../lib/cmhcUnderwriting'
import { type CmhcBuildingTier } from '../../lib/cmhcQuebecBenchmarks'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'
import { useCmhcT, tierOptions, type CmhcT } from './i18n'

type Updater = <K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) => void

export interface CapRateSource {
  bandLowPct: number
  bandHighPct: number
  label: string
  quarter: string
  cityKey: string
  caveat: string
}

function BenchmarkRow({ label, line, unit, t }: { label: string; line: BenchmarkedLine; unit: string; t: CmhcT }) {
  const sourceLabel =
    line.source === 'actual_exceeds_benchmark' ? t('src_actualExceeds') :
    line.source === 'benchmark_exceeds_actual' ? t('src_benchmarkExceeds') :
    t('src_benchmarkOnly')
  return (
    <div className="flex items-center justify-between gap-4 py-[7px] border-b border-surface-border last:border-b-0">
      <div className="flex-1">
        <p className="text-sm text-ink">{label}</p>
        <p className="text-[11px] text-muted/70">
          {t('bm_actual')}: {line.actual != null ? fmt$(line.actual) : '—'} &nbsp;·&nbsp; {t('bm_benchmark')}: {fmt$(line.benchmark)} {unit}
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

export default function IncomeAnalysisTab({ inputs, update, defaultTier, capRateSource }: {
  inputs: CmhcUnderwritingInputs
  update: Updater
  defaultTier: CmhcBuildingTier
  capRateSource?: CapRateSource | null
}) {
  const t = useCmhcT()
  const tiers = tierOptions(t)
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
  const term1 = toNum(inputs.mortgage1.termYears)
  // DSCR/LTV-sized loan suggestion (offered only while the loan field is blank).
  const suggestedLoan = sizeCmhcFirstMortgage({ noi, annualRatePct: rate1, amortYears: amort1, termYears: term1, value: underwrittenValue })
  const showLoanSuggestion = inputs.mortgage1.loanAmount.trim() === '' && suggestedLoan.loan > 0
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

      {/* ── Headline metrics (kept at top, horizontal) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label={t('kpi_egi')} value={fmt$(egi)} hint={t('hint_egi')} />
        <StatTile label={t('kpi_noi')} value={fmt$(noi)} tone={noi < 0 ? 'bad' : 'good'} hint={t('hint_noi')} />
        <StatTile label={t('kpi_uwValue')} value={fmt$(underwrittenValue)} formula={t('formula_uwValue', { cap: capRatePct })} />
        <StatTile
          label={t('kpi_dscr')}
          value={dscr1 != null ? `${dscr1.toFixed(2)}×` : '—'}
          tone={dscr1 == null ? 'default' : dscr1 < 1.2 ? 'bad' : 'good'}
          formula={t('formula_dscr')}
        />
      </div>

      {/* ── Calculator cards in 2 columns (masonry) to minimise scrolling ── */}
      <div className="columns-1 lg:columns-2 gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid">

      {/* ── Revenue ── */}
      <Panel title={t('revenue')} icon={<TrendingUp size={13} />}>
        <Row label={t('grossResidential')} sub={t('fromRentRoll')} value={fmt$(rentRollSummary.grossResidentialAnnual)} />
        <FieldGrid>
          <Field label={t('commercialRevenue')}>
            <NumField label={t('commercialRevenue')} value={inputs.commercialAnnual} onChange={v => update('commercialAnnual', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('lockersRevenue')}>
            <NumField label={t('lockersRevenue')} value={inputs.lockersAnnual} onChange={v => update('lockersAnnual', v)} suffix="$" width="w-full" />
          </Field>
        </FieldGrid>
        <div className="pt-2">
          <Row label={t('parkingRevenue')} sub={t('fromRentRoll')} value={fmt$(rentRollSummary.parkingAnnual)} />
          <Row label={t('totalGrossIncome')} value={fmt$(totalGrossIncome)} bold />
        </div>
        <FieldGrid>
          <Field label={t('vacancyPct')}>
            <NumField label={t('vacancyPct')} value={inputs.vacancyPct} onChange={v => update('vacancyPct', v)} suffix="%" width="w-full" />
          </Field>
          <div className="flex items-end">
            <div className="w-full"><Row label={t('vacancyAllowanceAmt')} value={fmt$(vacancyAllowance)} negative /></div>
          </div>
        </FieldGrid>
        <ResultBox label={t('egiFull')} value={fmt$(egi)} />
      </Panel>

      {/* ── Operating expenses ── */}
      <Panel
        title={t('operatingExpenses')}
        icon={<Receipt size={13} />}
        subtitle={t('expensesSubtitle', { units, tier: tiers.find(o => o.value === defaultTier)?.label ?? '' })}
        aside={
          <select
            value={inputs.constructionTier}
            onChange={e => update('constructionTier', e.target.value as CmhcBuildingTier)}
            className="select text-xs py-1"
            aria-label={t('operatingExpenses')}
          >
            {tiers.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        }
      >
        <FieldGrid>
          <Field label={t('municipalTaxes')} source="listing">
            <NumField label={t('municipalTaxes')} value={inputs.municipalTax} onChange={v => update('municipalTax', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('schoolTaxes')} source="listing">
            <NumField label={t('schoolTaxes')} value={inputs.schoolTax} onChange={v => update('schoolTax', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('water')}>
            <NumField label={t('water')} value={inputs.water} onChange={v => update('water', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('gas')}>
            <NumField label={t('gas')} value={inputs.gas} onChange={v => update('gas', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('hydroCommon')}>
            <NumField label={t('hydroCommon')} value={inputs.hydroCommon} onChange={v => update('hydroCommon', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('insurance')}>
            <NumField label={t('insurance')} value={inputs.insurance} onChange={v => update('insurance', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('elevatorOperating')}>
            <NumField label={t('elevatorOperating')} value={inputs.elevatorOperating} onChange={v => update('elevatorOperating', v)} suffix="$" width="w-full" />
          </Field>
        </FieldGrid>

        <div className="pt-3 mt-1 border-t border-surface-border space-y-2">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{t('benchmarkedHeader')}</p>
          <FieldGrid>
            <Field label={t('managementActual')}>
              <NumField label={t('managementActual')} value={inputs.managementActual} onChange={v => update('managementActual', v)} suffix="$" width="w-full" placeholder={t('blankBenchmark')} />
            </Field>
            <Field label={t('salariesActual')}>
              <NumField label={t('salariesActual')} value={inputs.salariesActual} onChange={v => update('salariesActual', v)} suffix="$" width="w-full" placeholder={t('blankBenchmark')} />
            </Field>
            <Field label={t('maintenanceActual')}>
              <NumField label={t('maintenanceActual')} value={inputs.maintenanceActual} onChange={v => update('maintenanceActual', v)} suffix="$" width="w-full" placeholder={t('blankBenchmark')} />
            </Field>
            <Field label={t('otherCostsActual')}>
              <NumField label={t('otherCostsActual')} value={inputs.otherCostsActual} onChange={v => update('otherCostsActual', v)} suffix="$" width="w-full" placeholder={t('blankBenchmark')} />
            </Field>
          </FieldGrid>

          <p className="text-[11px] text-muted/70 pt-1">{t('reserveNote')}</p>
          <FieldGrid cols={3}>
            <Field label={t('appliances')} sub={t('appliancesRate')}>
              <NumField label={t('appliances')} value={inputs.reserveCounts.applianceCount} onChange={v => setReserveCounts({ applianceCount: v })} width="w-full" />
            </Field>
            <Field label={t('heatPumpAc')} sub={t('heatPumpAcRate')}>
              <NumField label={t('heatPumpAc')} value={inputs.reserveCounts.heatPumpOrAcCount} onChange={v => setReserveCounts({ heatPumpOrAcCount: v })} width="w-full" />
            </Field>
            <Field label={t('elevators')} sub={t('elevatorsRate')}>
              <NumField label={t('elevators')} value={inputs.reserveCounts.elevatorCount} onChange={v => setReserveCounts({ elevatorCount: v })} width="w-full" />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label={t('replacementReserveActual')}>
              <NumField label={t('replacementReserveActual')} value={inputs.replacementReserveActual} onChange={v => update('replacementReserveActual', v)} suffix="$" width="w-full" placeholder={t('blankBenchmark')} />
            </Field>
          </FieldGrid>

          <div className="pt-2">
            <BenchmarkRow label={t('management')} line={benchmarked.management} unit={t('perYear')} t={t} />
            <BenchmarkRow label={t('salaries')} line={benchmarked.salaries} unit={t('perYear')} t={t} />
            <BenchmarkRow label={t('maintenance')} line={benchmarked.maintenance} unit={t('perYear')} t={t} />
            <BenchmarkRow label={t('otherCosts')} line={benchmarked.otherCosts} unit={t('perYear')} t={t} />
            <BenchmarkRow label={t('replacementReserve')} line={benchmarked.replacementReserve} unit={t('perYear')} t={t} />
          </div>
        </div>

        <Row label={t('totalExpensesLessTaxes')} value={fmt$(expensesLessTaxesPerUnit)} />
        <ResultBox label={t('totalExpenses')} value={fmt$(totalExpenses)} />
      </Panel>

      {/* ── NOI / Net Cash Flow ── */}
      <Panel title={t('noiCashFlow')} icon={<Calculator size={13} />}>
        <FieldGrid>
          <Field label={t('structuralReserve')} sub={t('structuralReserveSub')}>
            <NumField label={t('structuralReserve')} value={inputs.structuralReservePctForNcf} onChange={v => update('structuralReservePctForNcf', v)} suffix="%" width="w-full" />
          </Field>
        </FieldGrid>
        <ResultBox label={t('noiFull')} value={fmt$(noi)} tone={noi < 0 ? 'bad' : 'good'} />
        <ResultBox label={t('netCashFlow')} value={fmt$(netCashFlow)} tone={netCashFlow < 0 ? 'bad' : 'good'} />
      </Panel>

      {/* ── Valuation ── */}
      <Panel title={t('valuation')} icon={<Calculator size={13} />}>
        <FieldGrid>
          <Field label={t('capRate')}>
            <NumField label={t('capRate')} value={inputs.capRatePct} onChange={v => update('capRatePct', v)} suffix="%" width="w-full" />
          </Field>
        </FieldGrid>
        {capRateSource ? (
          <p className="text-[11px] text-muted/70 mb-1">
            {t('capSource', {
              label: capRateSource.label, quarter: capRateSource.quarter,
              city: capRateSource.cityKey.charAt(0).toUpperCase() + capRateSource.cityKey.slice(1),
              low: capRateSource.bandLowPct.toFixed(2), high: capRateSource.bandHighPct.toFixed(2),
            })}
          </p>
        ) : (
          <p className="text-[11px] text-score-market mb-1">{t('capNoBand')}</p>
        )}
        <FieldGrid>
          <Field label={t('capexAdjustment')}>
            <NumField label={t('capexAdjustment')} value={inputs.capexAdjustment} onChange={v => update('capexAdjustment', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('appraisedValue')} sub={t('appraisedValueSub')}>
            <NumField label={t('appraisedValue')} value={inputs.appraisedValue} onChange={v => update('appraisedValue', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('purchasePrice')} source="listing">
            <NumField label={t('purchasePrice')} value={inputs.purchasePrice} onChange={v => update('purchasePrice', v)} suffix="$" width="w-full" />
          </Field>
        </FieldGrid>
        <Row label={t('adjustedValue')} value={fmt$(adjustedValue)} sub={fmt$(perUnit(adjustedValue, units)) + t('perUnit')} bold />
        <ResultBox label={t('underwrittenValue')} value={fmt$(underwrittenValue)} sub={fmt$(perUnit(underwrittenValue, units)) + t('perUnit')} />
      </Panel>

      {/* ── 1st Mortgage ── */}
      <Panel title={t('firstMortgage')} icon={<Landmark size={13} />}>
        <FieldGrid cols={2}>
          <Field label={t('loanAmount')}>
            <NumField label={t('loanAmount')} value={inputs.mortgage1.loanAmount} onChange={v => setM1({ loanAmount: v })} suffix="$" width="w-full" />
          </Field>
          <Field label={t('rate')}>
            <NumField label={t('rate')} value={inputs.mortgage1.ratePct} onChange={v => setM1({ ratePct: v })} suffix="%" width="w-full" />
          </Field>
          <Field label={t('termYears')}>
            <NumField label={t('termYears')} value={inputs.mortgage1.termYears} onChange={v => setM1({ termYears: v })} width="w-full" />
          </Field>
          <Field label={t('amortYears')}>
            <NumField label={t('amortYears')} value={inputs.mortgage1.amortYears} onChange={v => setM1({ amortYears: v })} width="w-full" />
          </Field>
        </FieldGrid>
        {showLoanSuggestion && (
          <button
            type="button"
            onClick={() => setM1({ loanAmount: String(Math.round(suggestedLoan.loan)) })}
            className="w-full flex items-center justify-between gap-3 my-3 py-2 px-3 rounded-lg bg-accent/5 border border-accent/15 hover:bg-accent/10 transition-colors text-left"
          >
            <span className="text-xs text-muted">
              {suggestedLoan.boundBy === 'dscr'
                ? t('suggestedDscr', { dscr: suggestedLoan.dscrTarget.toFixed(2) })
                : t('suggestedLtv', { ltv: CMHC_MAX_LTV_PCT })}
              <span className="font-mono font-semibold text-ink">{fmt$(suggestedLoan.loan)}</span>
            </span>
            <span className="text-xs font-semibold text-accent shrink-0">{t('apply')}</span>
          </button>
        )}
        <div className="pt-1">
          <Row label={t('annualPayment')} value={fmt$(annualPmt1)} />
          <Row label={t('dscrLong')} value={dscr1 != null ? `${dscr1.toFixed(2)}×` : '—'} red={dscr1 != null && dscr1 < 1.2} />
          <Row label={t('ltvRatio')} value={ltv1 != null ? fmtPct(ltv1) : '—'} sub={premium1.insurable ? undefined : t('notInsurableLtv')} red={ltv1 != null && !premium1.insurable} />
          <Row label={t('loanPerUnit')} value={fmt$(perUnit(loan1, units))} />
          <Row label={t('avgRentPerUnit')} value={fmt$(avgRentPerUnit)} sub={t('avgRentSub')} />
          <Row label={t('breakevenRent')} value={fmt$(breakevenRentPerUnit1)} sub={t('perMonth')} />
          <Row label={t('applicationFee')} value={fmt$(appFee)} />
          <Row
            label={t('cmhcPremium')}
            value={premium1.insurable ? fmt$(premium1.premiumAmount ?? 0) : t('notInsurable')}
            sub={premium1.insurable ? t('premiumSub', { band: premium1.ltvBandPct ?? 0, surcharge: premium1.amortSurchargePct ?? 0 }) : undefined}
            red={!premium1.insurable}
          />
        </div>
        <ResultBox label={t('monthlyPayment')} value={fmt$(monthlyPmt1)} />
        <ResultBox label={t('totalCmhcLoan')} value={fmt$(totalCmhcLoan1)} />
      </Panel>

      {/* ── 2nd Mortgage ── */}
      <Panel
        title={t('secondMortgage')}
        icon={<Landmark size={13} />}
        aside={
          <label className="inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={inputs.mortgage2Enabled} onChange={e => update('mortgage2Enabled', e.target.checked)} />
            {t('include2nd')}
          </label>
        }
      >
        {inputs.mortgage2Enabled ? (
          <>
            <FieldGrid cols={2}>
              <Field label={t('loanAmount')}>
                <NumField label={t('loanAmount')} value={inputs.mortgage2.loanAmount} onChange={v => setM2({ loanAmount: v })} suffix="$" width="w-full" />
              </Field>
              <Field label={t('rate')}>
                <NumField label={t('rate')} value={inputs.mortgage2.ratePct} onChange={v => setM2({ ratePct: v })} suffix="%" width="w-full" />
              </Field>
              <Field label={t('termYears')}>
                <NumField label={t('termYears')} value={inputs.mortgage2.termYears} onChange={v => setM2({ termYears: v })} width="w-full" />
              </Field>
              <Field label={t('amortYears')}>
                <NumField label={t('amortYears')} value={inputs.mortgage2.amortYears} onChange={v => setM2({ amortYears: v })} width="w-full" />
              </Field>
            </FieldGrid>
            <div className="pt-1">
              <Row label={t('monthlyPayment2')} value={fmt$(monthlyPmt2)} />
              <Row label={t('combinedLoan')} value={fmt$(combinedLoan)} bold />
              <Row label={t('combinedAnnual')} value={fmt$(combinedAnnualPmt)} />
              <Row label={t('combinedDscr')} value={combinedDscr != null ? `${combinedDscr.toFixed(2)}×` : '—'} red={combinedDscr != null && combinedDscr < 1.2} />
              <Row label={t('combinedLtv')} value={combinedLtv != null ? fmtPct(combinedLtv) : '—'} sub={t('combinedLtvSub')} />
              <Row label={t('combinedLoanPerUnit')} value={fmt$(perUnit(combinedLoan, units))} />
              <Row label={t('combinedBreakeven')} value={fmt$(combinedBreakevenRentPerUnit)} sub={t('perMonth')} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted py-2">{t('not2nd')}</p>
        )}
      </Panel>

      {/* ── Refinance ── */}
      <Panel title={t('refinance')} icon={<ArrowLeftRight size={13} />}>
        <FieldGrid>
          <Field label={t('existingDebt')}>
            <NumField label={t('existingDebt')} value={inputs.existingDebt} onChange={v => update('existingDebt', v)} suffix="$" width="w-full" />
          </Field>
          <Field label={t('prepaymentPenalty')} sub={t('prepaymentSub')}>
            <NumField label={t('prepaymentPenalty')} value={inputs.prepaymentPenalty} onChange={v => update('prepaymentPenalty', v)} suffix="$" width="w-full" />
          </Field>
        </FieldGrid>
        <ResultBox label={t('equityTakeOut')} value={fmt$(equityTakeOut)} tone={equityTakeOut < 0 ? 'bad' : 'default'} />
      </Panel>

      </div>
    </div>
  )
}
