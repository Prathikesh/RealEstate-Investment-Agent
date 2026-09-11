import { useMemo, useState, useEffect } from 'react'
import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'
import { ShieldCheck, SlidersHorizontal, RotateCcw, Landmark, FileText, Percent, ClipboardList } from 'lucide-react'
import type { PropertyDetail } from '../api'
import VerdictCompare from './VerdictCompare'
import {
  loadFinancingScenario, saveFinancingScenario, clearFinancingScenario,
  type FinancingLive,
} from '../lib/financingScenario'

/**
 * Financing analysis — broker underwriting sheet.
 *
 * Swiss/minimal statement layout (ui-ux-pro-max: Minimalism & Swiss style,
 * Real Estate/Property palette — trust teal #0F766E, professional blue accent).
 * Provenance is shown with a consistent Lucide icon pair + visible legend:
 *   ShieldCheck (teal)        = scraped from the Centris listing, read-only
 *   SlidersHorizontal (slate) = broker assumption, editable
 *
 * Mortgage payment uses Canadian semi-annual compounding
 * (Interest Act, RSC 1985, c I-15, s 6).
 */

type Frequency = 'monthly' | 'biweekly' | 'weekly'

const PAYMENTS_PER_YEAR: Record<Frequency, number> = { monthly: 12, biweekly: 26, weekly: 52 }

const TEAL       = '#0F766E'   // --color-primary   (trust teal)
const TEAL_TINT  = '#F0FDFA'   // --color-background tint
const INK_TEAL   = '#134E4A'   // --color-foreground

function mortgagePayment(principal: number, annualRatePct: number, amortYears: number, freq: Frequency): number {
  if (principal <= 0 || annualRatePct <= 0 || amortYears <= 0) return 0
  const perYear = PAYMENTS_PER_YEAR[freq]
  const r = Math.pow(1 + annualRatePct / 200, 2 / perYear) - 1
  const n = amortYears * perYear
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function cmhcPremiumPct(downPct: number): number {
  if (downPct >= 20) return 0
  if (downPct >= 15) return 2.8
  if (downPct >= 10) return 3.1
  return 4.0
}

const fmt$ = (v: number, dec = 0) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v)
const toNum = (s: string) => parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0

// ── Provenance tags (SVG icons, consistent stroke — no symbols/emoji) ─────────

function SourceTag({ kind }: { kind: 'centris' | 'assumption' }) {
  const { t } = useLang()
  return kind === 'centris' ? (
    <span title={t('fw_fromCentris')} className="inline-flex shrink-0" aria-label={t('fw_fromCentrisShort')}>
      <ShieldCheck size={12} strokeWidth={2} style={{ color: TEAL }} />
    </span>
  ) : (
    <span title={t('fw_brokerAssumption')} className="inline-flex shrink-0" aria-label={t('fw_brokerAssumptionShort')}>
      <SlidersHorizontal size={12} strokeWidth={2} className="text-slate-400" />
    </span>
  )
}

function Legend() {
  const { t } = useLang()
  return (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck size={12} strokeWidth={2} style={{ color: TEAL }} /> {t('fw_fromCentrisShort')}
      </span>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <SlidersHorizontal size={12} strokeWidth={2} className="text-slate-400" /> {t('fw_brokerAssumptionShort')}
      </span>
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Field({ value, onChange, suffix, width = 'w-28', label }: {
  value: string; onChange: (v: string) => void; suffix?: string; width?: string; label: string
}) {
  return (
    <span className={clsx('relative inline-block', width)}>
      <input
        type="text" inputMode="decimal" value={value} aria-label={label}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'w-full rounded-md border border-slate-300 bg-surface-card px-2 py-1 text-base sm:text-sm text-right font-mono tabular-nums text-ink',
          'hover:border-slate-400 focus:outline-none transition-colors duration-200',
          suffix && 'pr-6',
        )}
        style={{ caretColor: TEAL }}
        onFocus={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.boxShadow = `0 0 0 3px ${TEAL}22` }}
        onBlur={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}
      />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{suffix}</span>}
    </span>
  )
}

function Section({ icon: Icon, title, aside, children }: {
  icon: typeof Landmark; title: string; aside?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-surface-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200">
        <h4 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: INK_TEAL }}>
          <Icon size={13} strokeWidth={2} style={{ color: TEAL }} />
          {title}
        </h4>
        {aside}
      </header>
      <div className="px-4 py-1">{children}</div>
    </section>
  )
}

function Line({ label, value, source, bold, negative, indent, red }: {
  label: string; value: string; source?: 'centris' | 'assumption'
  bold?: boolean; negative?: boolean; indent?: boolean; red?: boolean
}) {
  return (
    <div className={clsx(
      'flex items-center justify-between gap-4 py-[7px]',
      indent && 'pl-4',
      bold && '-mx-4 px-4',
    )} style={bold ? { backgroundColor: TEAL_TINT } : undefined}>
      <span className={clsx('inline-flex items-center gap-1.5 text-sm', bold ? 'font-semibold' : 'text-slate-600')}
            style={bold ? { color: INK_TEAL } : undefined}>
        {label}
        {source && <SourceTag kind={source} />}
      </span>
      <span className={clsx(
        'font-mono tabular-nums text-sm whitespace-nowrap',
        bold && 'font-semibold',
        red ? 'text-red-700' : 'text-ink',
      )}>
        {negative ? `(${value})` : value}
      </span>
    </div>
  )
}

function InputLine({ label, sub, source = 'assumption', children }: {
  label: string; sub?: string; source?: 'centris' | 'assumption' | null; children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px]">
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
        {label}
        {source && <SourceTag kind={source} />}
        {sub && <span className="text-slate-400 font-mono tabular-nums text-xs">{sub}</span>}
      </span>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

// Mirrors backend fallback (calculator._estimate_rent): $1,200/unit, units inferred from type
const UNITS_BY_TYPE: Record<string, number> = {
  duplex: 2, triplex: 3, quadruplex: 4, quintuplex_plus: 5,
  single_family: 1, condo: 1, townhouse: 1,
}
const DEFAULT_RENT_PER_UNIT = 1200

export default function FinancingWorkbench({ prop, pricePerSqft, onScenarioChange }: {
  prop: PropertyDetail
  pricePerSqft?: number | null
  /** Lifts the live cap-rate/cash-flow up so PropertyPage can drive the AI Verdict
   *  tab's verdict too (undefined = user is at listing defaults). */
  onScenarioChange?: (live: FinancingLive | undefined) => void
}) {
  const { t } = useLang()
  const listPrice   = prop.asking_price ?? 0
  const hasRentData = prop.rental_income_monthly != null && prop.rental_income_monthly > 0
  const estUnits    = prop.unit_count ?? UNITS_BY_TYPE[prop.property_type] ?? 2
  const rentFallback = DEFAULT_RENT_PER_UNIT * estUnits

  const defaults = useMemo(() => ({
    offer:      listPrice > 0 ? String(Math.round(listPrice)) : '',
    downPct:    '20',
    rate:       '5.50',
    amort:      25,
    freq:       'monthly' as Frequency,
    rentEst:    hasRentData ? '' : String(rentFallback),
    vacancyPct: '0',
    mgmtPct:    '0',
    insurance:  '0',
    maintPct:   '0',
  }), [prop.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Restore a previously-saved scenario for this property (survives reload/nav).
  const saved = useMemo(() => loadFinancingScenario(prop.id)?.inputs, [prop.id])
  const init = saved ?? defaults

  const [offer, setOffer]           = useState(init.offer)
  const [downPctS, setDownPctS]     = useState(init.downPct)
  const [rate, setRate]             = useState(init.rate)
  const [amort, setAmort]           = useState(init.amort)
  const [freq, setFreq]             = useState<Frequency>(init.freq)
  const [rentEst, setRentEst]       = useState(init.rentEst)
  const [vacancyPct, setVacancyPct] = useState(init.vacancyPct)
  const [mgmtPct, setMgmtPct]       = useState(init.mgmtPct)
  const [insurance, setInsurance]   = useState(init.insurance)
  const [maintPct, setMaintPct]     = useState(init.maintPct)

  const reset = () => {
    setOffer(defaults.offer); setDownPctS(defaults.downPct)
    setRate(defaults.rate); setAmort(defaults.amort); setFreq(defaults.freq)
    setRentEst(defaults.rentEst); setVacancyPct(defaults.vacancyPct); setMgmtPct(defaults.mgmtPct)
    setInsurance(defaults.insurance); setMaintPct(defaults.maintPct)
    clearFinancingScenario(prop.id)
    onScenarioChange?.(undefined)
  }

  const modified =
    offer !== defaults.offer || downPctS !== defaults.downPct || rate !== defaults.rate ||
    amort !== defaults.amort || freq !== defaults.freq || rentEst !== defaults.rentEst ||
    vacancyPct !== defaults.vacancyPct || mgmtPct !== defaults.mgmtPct ||
    insurance !== defaults.insurance || maintPct !== defaults.maintPct

  // ── Derived ─────────────────────────────────────────────────────────────────
  const p        = toNum(offer)
  const dPct     = Math.min(100, Math.max(0, toNum(downPctS)))
  const dAmt     = p * (dPct / 100)
  const baseLoan = Math.max(0, p - dAmt)
  const cmhcPct  = cmhcPremiumPct(dPct)
  const cmhcPrem = baseLoan * (cmhcPct / 100)
  const loan     = baseLoan + cmhcPrem

  const payment     = mortgagePayment(loan, toNum(rate), amort, freq)
  const monthlyDebt = payment * PAYMENTS_PER_YEAR[freq] / 12
  const annualDebt  = monthlyDebt * 12

  const rentMonthly = hasRentData ? prop.rental_income_monthly! : toNum(rentEst)
  const grossAnnual = rentMonthly * 12
  const hasRent     = grossAnnual > 0

  const muniTax     = prop.municipal_taxes_annual ?? 0
  const schoolTax   = prop.school_taxes_annual ?? 0
  const vacancyLoss = grossAnnual * (toNum(vacancyPct) / 100)
  const mgmtFee     = grossAnnual * (toNum(mgmtPct) / 100)
  const maintenance = p * (toNum(maintPct) / 100)
  const insuranceN  = toNum(insurance)

  const noi       = grossAnnual - vacancyLoss - muniTax - schoolTax - insuranceN - maintenance - mgmtFee
  const annualCF  = noi - annualDebt
  const capRate   = p > 0 ? (noi / p) * 100 : 0
  const monthlyCF = annualCF / 12
  const grm       = grossAnnual > 0 ? p / grossAnnual : null

  const transferTax = prop.welcome_tax
  const cashToClose = dAmt + (transferTax ?? 0)
  const coc         = cashToClose > 0 ? (annualCF / cashToClose) * 100 : 0

  // At rest (no what-if edits yet), show the one stored analysis everywhere on
  // the page — not this panel's own live recompute — so NOI/cash-flow/cap-rate/
  // CoC/GRM here are always identical to the top summary and AI-verdict figures
  // by construction, never by coincidence. Once the user changes a term, switch
  // to the live numbers computed above (the "Your Scenario" labeling below makes
  // that divergence intentional and self-explanatory, not a bug).
  const hasStoredNoi     = prop.noi_annual != null
  const hasStoredCF      = prop.monthly_cash_flow != null
  const hasStoredCapRate = prop.cap_rate != null
  const hasStoredCoc     = prop.cash_on_cash_return != null
  const hasStoredGrm     = prop.grm != null

  const displayNoi       = modified ? noi       : (prop.noi_annual ?? 0)
  const displayMonthlyCF = modified ? monthlyCF : (prop.monthly_cash_flow ?? 0)
  const displayAnnualCF  = modified ? annualCF  : (prop.monthly_cash_flow ?? 0) * 12
  const displayCapRate   = modified ? capRate   : (prop.cap_rate ?? 0)
  const displayCoc       = modified ? coc       : (prop.cash_on_cash_return ?? 0)
  const displayGrm       = modified ? grm       : prop.grm
  const noiKnown         = modified ? hasRent : hasStoredNoi
  const cfKnown          = modified ? hasRent : hasStoredCF
  const capRateKnown     = modified ? hasRent : hasStoredCapRate
  const cocKnown         = modified ? hasRent : hasStoredCoc
  const grmKnown         = modified ? grm != null : hasStoredGrm

  // Persist the scenario (per property) and lift the live values up so the AI
  // Verdict tab reacts to the same "what if" numbers. Only the derived cap-rate/
  // cash-flow matter to the verdict; we gate on `modified` to stay identical to
  // the stored analysis until the user actually changes a term.
  const live: FinancingLive | undefined = modified
    ? { capRatePct: capRate, monthlyCashFlow: monthlyCF }
    : undefined
  useEffect(() => {
    if (modified) {
      saveFinancingScenario(prop.id, {
        inputs: { offer, downPct: downPctS, rate, amort, freq, rentEst, vacancyPct, mgmtPct, insurance, maintPct },
        live, modified: true,
      })
    } else {
      clearFinancingScenario(prop.id)
    }
    onScenarioChange?.(live)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, offer, downPctS, rate, amort, freq, rentEst, vacancyPct, mgmtPct, insurance, maintPct])

  const freqNoun = freq === 'monthly' ? 'per month' : freq === 'biweekly' ? 'every two weeks' : 'per week'

  const selectCls =
    'rounded-md border border-slate-300 bg-surface-card px-2 py-1 text-base sm:text-sm text-ink cursor-pointer ' +
    'hover:border-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 transition-colors duration-200'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-slate-200 bg-surface-card shadow-sm overflow-hidden">

      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b-2" style={{ borderColor: TEAL }}>
        <div>
          <h3 className="text-base font-bold" style={{ color: INK_TEAL }}>{t("fw_analysis")}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Adjust the terms — every figure recalculates as you type</p>
        </div>
        <div className="flex items-center gap-4">
          <Legend />
          {modified && (
            <button
              type="button" onClick={reset}
              className="inline-flex items-center gap-1.5 shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md border cursor-pointer transition-colors duration-200 hover:bg-teal-50"
              style={{ borderColor: TEAL, color: TEAL }}
            >
              <RotateCcw size={12} strokeWidth={2} />
              Reset to listing
            </button>
          )}
        </div>
      </div>

      {/* Verdict — matches the stored analysis at rest, then recomputes live
          from the cap rate / cash flow below once the user changes a term.
          Gating on `modified` keeps this consistent with the static card on the
          AI Verdict tab until the user actually starts running scenarios. */}
      <div className="px-4 sm:px-5 pt-4">
        <VerdictCompare prop={prop} live={live} />
      </div>

      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ── Left column: listing data + scenario ── */}
        <div className="lg:col-span-2 space-y-4">

          <Section icon={ShieldCheck} title={t("fw_listingData")}
                   aside={<span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t("fw_readOnly")}</span>}>
            <div className="divide-y divide-slate-100">
              <Line label={t("fw_askingPrice")} value={listPrice > 0 ? fmt$(listPrice) : '—'} />
              <Line label={t("fw_grossRent")} value={hasRentData ? `${fmt$(prop.rental_income_monthly!)} / month` : 'not listed'} />
              <Line label={t("fw_municipalTax")} value={prop.municipal_taxes_annual != null ? `${fmt$(prop.municipal_taxes_annual)} / year` : 'not listed'} />
              <Line label={t("fw_schoolTax")} value={prop.school_taxes_annual != null ? `${fmt$(prop.school_taxes_annual)} / year` : 'not listed'} />
              <Line label={t("fw_transferTaxLong")} value={transferTax != null ? fmt$(transferTax) : 'not listed'} />
              {prop.condo_fees_monthly != null && (
                <Line label={t("fw_condoFees")} value={`${fmt$(prop.condo_fees_monthly)} / month`} />
              )}
              {pricePerSqft != null && (
                <Line label={t("fw_pricePerSqft")} value={fmt$(pricePerSqft)} />
              )}
            </div>
          </Section>

          <Section icon={Landmark} title={t("fw_financingTerms")}>
            <div className="divide-y divide-slate-100">
              <InputLine label={t("fw_offerPrice")} source={null}>
                <Field label={t("fw_offerPrice")} value={offer} onChange={setOffer} suffix="$" width="w-32" />
              </InputLine>
              <InputLine label={t("fw_downPayment")} sub={fmt$(dAmt)} source={null}>
                <Field label={t("fw_downPayment")} value={downPctS} onChange={setDownPctS} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label={t("fw_interestRate")} source={null}>
                <Field label={t("fw_interestRate")} value={rate} onChange={setRate} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label={t("fw_amortization")} source={null}>
                <select value={amort} onChange={e => setAmort(Number(e.target.value))} className={selectCls} aria-label={t("fw_amortization")}>
                  {[20, 25, 30].map(y => <option key={y} value={y}>{y} years</option>)}
                </select>
              </InputLine>
              <InputLine label={t("fw_paymentFreq")} source={null}>
                <select value={freq} onChange={e => setFreq(e.target.value as Frequency)} className={selectCls} aria-label={t("fw_paymentFreq")}>
                  <option value="monthly">{t("fw_monthly")}</option>
                  <option value="biweekly">{t("fw_biweekly")}</option>
                  <option value="weekly">{t("fw_weekly")}</option>
                </select>
              </InputLine>
            </div>
            {cmhcPct > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2 mt-1">
                Down payment below 20% — CMHC insurance of {cmhcPct.toFixed(1)}% ({fmt$(cmhcPrem)}) is added to the loan.
              </p>
            )}
          </Section>

          <Section icon={SlidersHorizontal} title={t("fw_operatingAssumptions")}
                   aside={<span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t("fw_editable")}</span>}>
            <div className="divide-y divide-slate-100">
              {!hasRentData && (
                <InputLine label={t("fw_grossRentNotListed")} sub={`est. $${DEFAULT_RENT_PER_UNIT.toLocaleString()}/unit × ${estUnits}`}>
                  <Field label={t("fw_grossRentNotListed")} value={rentEst} onChange={setRentEst} suffix="$" width="w-28" />
                </InputLine>
              )}
              <InputLine label={t("fw_vacancy")}>
                <Field label={t("fw_vacancy")} value={vacancyPct} onChange={setVacancyPct} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label={t("fw_mgmtFee")}>
                <Field label={t("fw_mgmtFee")} value={mgmtPct} onChange={setMgmtPct} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label={t("fw_insuranceYr")}>
                <Field label={t("fw_insuranceYr")} value={insurance} onChange={setInsurance} suffix="$" width="w-28" />
              </InputLine>
              <InputLine label={t("fw_maintPct")}>
                <Field label={t("fw_maintPct")} value={maintPct} onChange={setMaintPct} suffix="%" width="w-20" />
              </InputLine>
            </div>
          </Section>
        </div>

        {/* ── Right column: results ── */}
        <div className="lg:col-span-3 space-y-4">

          <Section icon={FileText} title={t("fw_mortgage")}>
            <div className="flex items-baseline justify-between py-3 -mx-4 px-4 border-b border-slate-100"
                 style={{ backgroundColor: TEAL_TINT }}>
              <span className="text-sm font-medium" style={{ color: INK_TEAL }}>Payment, {freqNoun}</span>
              <span className="font-mono tabular-nums text-[26px] font-bold" style={{ color: TEAL }}>{fmt$(payment, 0)}</span>
            </div>
            <div className="divide-y divide-slate-100">
              <Line label={`Loan amount${cmhcPrem > 0 ? ' (incl. CMHC premium)' : ''}`} value={fmt$(loan)} />
              <Line label={`Down payment (${dPct.toFixed(1)}%)`} value={fmt$(dAmt)} />
              <Line label={t("fw_transferTax")} source="centris" value={transferTax != null ? fmt$(transferTax) : '—'} />
              <Line label={t("fw_cashToClose")} value={fmt$(cashToClose)} bold />
            </div>
          </Section>

          <Section icon={ClipboardList} title={t("fw_annualStatement")} aside={<Legend />}>
            <div className="divide-y divide-slate-100">
              <Line label={t("fw_grossIncome")} source={hasRentData ? 'centris' : 'assumption'} value={hasRent ? fmt$(grossAnnual) : '—'} />
              <Line label={`Vacancy allowance, ${toNum(vacancyPct).toFixed(1)}%`} source="assumption" value={hasRent ? fmt$(vacancyLoss) : '—'} negative indent />
              <Line label={t("fw_municipalTax")} source="centris" value={prop.municipal_taxes_annual != null ? fmt$(muniTax) : 'not listed'} negative={prop.municipal_taxes_annual != null} indent />
              <Line label={t("fw_schoolTax")} source="centris" value={prop.school_taxes_annual != null ? fmt$(schoolTax) : 'not listed'} negative={prop.school_taxes_annual != null} indent />
              <Line label={t("fw_insurance")} source="assumption" value={fmt$(insuranceN)} negative indent />
              <Line label={`Maintenance, ${toNum(maintPct).toFixed(2)}% of price`} source="assumption" value={fmt$(maintenance)} negative indent />
              {toNum(mgmtPct) > 0 && (
                <Line label={`Management, ${toNum(mgmtPct).toFixed(1)}%`} source="assumption" value={fmt$(mgmtFee)} negative indent />
              )}
              <Line label={t("fw_noi")} value={noiKnown ? fmt$(displayNoi) : '—'} bold red={noiKnown && displayNoi < 0} />
              <Line
                label={t("fw_cashFlowAnnual")}
                value={cfKnown ? `${fmt$(displayAnnualCF)}${displayMonthlyCF !== 0 ? `  ·  ${fmt$(displayMonthlyCF)}/mo` : ''}` : '—'}
                bold red={cfKnown && displayAnnualCF < 0}
              />
            </div>
          </Section>

          <Section icon={Percent} title={t("fw_keyRatios")}
                   aside={
                     <span
                       className="text-[10px] font-medium uppercase tracking-wide"
                       style={{ color: modified ? TEAL : '#94a3b8' }}
                       title={modified
                         ? 'Recalculated live from the terms you changed above'
                         : 'Matches the stored analysis shown at the top of this page'}
                     >
                       {modified ? 'Your Scenario' : 'Listing Analysis'}
                     </span>
                   }>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 -mx-4">
              {[
                { label: t("fw_capRate"), value: capRateKnown ? `${displayCapRate.toFixed(2)}%` : '—', red: capRateKnown && displayCapRate < 4.5,
                  formula: t("fw_f_capRate") },
                { label: t("fw_coc"), value: cocKnown ? `${displayCoc.toFixed(1)}%` : '—', red: cocKnown && displayCoc < 0,
                  formula: t("fw_f_coc") },
                { label: t("fw_grm"), value: grmKnown && displayGrm != null ? `${displayGrm.toFixed(1)}×` : '—', red: false,
                  formula: t("fw_f_grm") },
              ].map(m => (
                <div key={m.label} className="px-4 py-3">
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className={clsx('font-mono tabular-nums text-xl font-bold mt-0.5', m.red ? 'text-red-700' : 'text-ink')}>
                    {m.value}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">= {m.formula}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 sm:px-6 py-3 border-t border-slate-200" style={{ backgroundColor: '#F8FAFC' }}>
        <p className="text-[11px] text-slate-500 leading-relaxed">{t('fw_footer')}</p>
      </div>
    </div>
  )
}
