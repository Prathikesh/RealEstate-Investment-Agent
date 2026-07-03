import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ShieldCheck, SlidersHorizontal, RotateCcw, Landmark, FileText, Percent, ClipboardList } from 'lucide-react'
import type { PropertyDetail } from '../api'

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
  return kind === 'centris' ? (
    <span title="From the Centris listing — read-only" className="inline-flex shrink-0" aria-label="From the Centris listing">
      <ShieldCheck size={12} strokeWidth={2} style={{ color: TEAL }} />
    </span>
  ) : (
    <span title="Broker assumption — adjustable" className="inline-flex shrink-0" aria-label="Broker assumption">
      <SlidersHorizontal size={12} strokeWidth={2} className="text-slate-400" />
    </span>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck size={12} strokeWidth={2} style={{ color: TEAL }} /> Centris listing
      </span>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <SlidersHorizontal size={12} strokeWidth={2} className="text-slate-400" /> Your assumption
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
          'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-base sm:text-sm text-right font-mono tabular-nums text-ink',
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
    <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
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

export default function FinancingWorkbench({ prop, pricePerSqft }: { prop: PropertyDetail; pricePerSqft?: number | null }) {
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

  const [offer, setOffer]           = useState(defaults.offer)
  const [downPctS, setDownPctS]     = useState(defaults.downPct)
  const [rate, setRate]             = useState(defaults.rate)
  const [amort, setAmort]           = useState(defaults.amort)
  const [freq, setFreq]             = useState<Frequency>(defaults.freq)
  const [rentEst, setRentEst]       = useState(defaults.rentEst)
  const [vacancyPct, setVacancyPct] = useState(defaults.vacancyPct)
  const [mgmtPct, setMgmtPct]       = useState(defaults.mgmtPct)
  const [insurance, setInsurance]   = useState(defaults.insurance)
  const [maintPct, setMaintPct]     = useState(defaults.maintPct)

  const reset = () => {
    setOffer(defaults.offer); setDownPctS(defaults.downPct)
    setRate(defaults.rate); setAmort(defaults.amort); setFreq(defaults.freq)
    setRentEst(defaults.rentEst); setVacancyPct(defaults.vacancyPct); setMgmtPct(defaults.mgmtPct)
    setInsurance(defaults.insurance); setMaintPct(defaults.maintPct)
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

  const freqNoun = freq === 'monthly' ? 'per month' : freq === 'biweekly' ? 'every two weeks' : 'per week'

  const selectCls =
    'rounded-md border border-slate-300 bg-white px-2 py-1 text-base sm:text-sm text-ink cursor-pointer ' +
    'hover:border-slate-400 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 transition-colors duration-200'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b-2" style={{ borderColor: TEAL }}>
        <div>
          <h3 className="text-base font-bold" style={{ color: INK_TEAL }}>Financing Analysis</h3>
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

      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ── Left column: listing data + scenario ── */}
        <div className="lg:col-span-2 space-y-4">

          <Section icon={ShieldCheck} title="Listing data — Centris"
                   aside={<span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Read-only</span>}>
            <div className="divide-y divide-slate-100">
              <Line label="Asking price" value={listPrice > 0 ? fmt$(listPrice) : '—'} />
              <Line label="Gross rent" value={hasRentData ? `${fmt$(prop.rental_income_monthly!)} / month` : 'not listed'} />
              <Line label="Municipal tax" value={prop.municipal_taxes_annual != null ? `${fmt$(prop.municipal_taxes_annual)} / year` : 'not listed'} />
              <Line label="School tax" value={prop.school_taxes_annual != null ? `${fmt$(prop.school_taxes_annual)} / year` : 'not listed'} />
              <Line label="Transfer tax (droits de mutation)" value={transferTax != null ? fmt$(transferTax) : 'not listed'} />
              {prop.condo_fees_monthly != null && (
                <Line label="Condo fees" value={`${fmt$(prop.condo_fees_monthly)} / month`} />
              )}
              {pricePerSqft != null && (
                <Line label="Price per sqft" value={fmt$(pricePerSqft)} />
              )}
            </div>
          </Section>

          <Section icon={Landmark} title="Financing terms">
            <div className="divide-y divide-slate-100">
              <InputLine label="Offer price" source={null}>
                <Field label="Offer price" value={offer} onChange={setOffer} suffix="$" width="w-32" />
              </InputLine>
              <InputLine label="Down payment" sub={fmt$(dAmt)} source={null}>
                <Field label="Down payment percent" value={downPctS} onChange={setDownPctS} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label="Interest rate" source={null}>
                <Field label="Interest rate" value={rate} onChange={setRate} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label="Amortization" source={null}>
                <select value={amort} onChange={e => setAmort(Number(e.target.value))} className={selectCls} aria-label="Amortization">
                  {[20, 25, 30].map(y => <option key={y} value={y}>{y} years</option>)}
                </select>
              </InputLine>
              <InputLine label="Payment frequency" source={null}>
                <select value={freq} onChange={e => setFreq(e.target.value as Frequency)} className={selectCls} aria-label="Payment frequency">
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </InputLine>
            </div>
            {cmhcPct > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2 mt-1">
                Down payment below 20% — CMHC insurance of {cmhcPct.toFixed(1)}% ({fmt$(cmhcPrem)}) is added to the loan.
              </p>
            )}
          </Section>

          <Section icon={SlidersHorizontal} title="Operating assumptions"
                   aside={<span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Editable</span>}>
            <div className="divide-y divide-slate-100">
              {!hasRentData && (
                <InputLine label="Gross rent (not on listing)" sub={`est. $${DEFAULT_RENT_PER_UNIT.toLocaleString()}/unit × ${estUnits}`}>
                  <Field label="Gross rent per month" value={rentEst} onChange={setRentEst} suffix="$" width="w-28" />
                </InputLine>
              )}
              <InputLine label="Vacancy allowance">
                <Field label="Vacancy allowance" value={vacancyPct} onChange={setVacancyPct} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label="Management fee">
                <Field label="Management fee" value={mgmtPct} onChange={setMgmtPct} suffix="%" width="w-20" />
              </InputLine>
              <InputLine label="Insurance, per year">
                <Field label="Insurance per year" value={insurance} onChange={setInsurance} suffix="$" width="w-28" />
              </InputLine>
              <InputLine label="Maintenance, % of price">
                <Field label="Maintenance percent of price" value={maintPct} onChange={setMaintPct} suffix="%" width="w-20" />
              </InputLine>
            </div>
          </Section>
        </div>

        {/* ── Right column: results ── */}
        <div className="lg:col-span-3 space-y-4">

          <Section icon={FileText} title="Mortgage">
            <div className="flex items-baseline justify-between py-3 -mx-4 px-4 border-b border-slate-100"
                 style={{ backgroundColor: TEAL_TINT }}>
              <span className="text-sm font-medium" style={{ color: INK_TEAL }}>Payment, {freqNoun}</span>
              <span className="font-mono tabular-nums text-[26px] font-bold" style={{ color: TEAL }}>{fmt$(payment, 0)}</span>
            </div>
            <div className="divide-y divide-slate-100">
              <Line label={`Loan amount${cmhcPrem > 0 ? ' (incl. CMHC premium)' : ''}`} value={fmt$(loan)} />
              <Line label={`Down payment (${dPct.toFixed(1)}%)`} value={fmt$(dAmt)} />
              <Line label="Transfer tax" source="centris" value={transferTax != null ? fmt$(transferTax) : '—'} />
              <Line label="Cash required to close" value={fmt$(cashToClose)} bold />
            </div>
          </Section>

          <Section icon={ClipboardList} title="Annual operating statement" aside={<Legend />}>
            <div className="divide-y divide-slate-100">
              <Line label="Gross rental income" source={hasRentData ? 'centris' : 'assumption'} value={hasRent ? fmt$(grossAnnual) : '—'} />
              <Line label={`Vacancy allowance, ${toNum(vacancyPct).toFixed(1)}%`} source="assumption" value={hasRent ? fmt$(vacancyLoss) : '—'} negative indent />
              <Line label="Municipal tax" source="centris" value={prop.municipal_taxes_annual != null ? fmt$(muniTax) : 'not listed'} negative={prop.municipal_taxes_annual != null} indent />
              <Line label="School tax" source="centris" value={prop.school_taxes_annual != null ? fmt$(schoolTax) : 'not listed'} negative={prop.school_taxes_annual != null} indent />
              <Line label="Insurance" source="assumption" value={fmt$(insuranceN)} negative indent />
              <Line label={`Maintenance, ${toNum(maintPct).toFixed(2)}% of price`} source="assumption" value={fmt$(maintenance)} negative indent />
              {toNum(mgmtPct) > 0 && (
                <Line label={`Management, ${toNum(mgmtPct).toFixed(1)}%`} source="assumption" value={fmt$(mgmtFee)} negative indent />
              )}
              <Line label="Net operating income" value={hasRent ? fmt$(noi) : '—'} bold red={hasRent && noi < 0} />
              <Line
                label="Cash flow, annual"
                value={hasRent ? `${fmt$(annualCF)}${monthlyCF !== 0 ? `  ·  ${fmt$(monthlyCF)}/mo` : ''}` : '—'}
                bold red={hasRent && annualCF < 0}
              />
            </div>
          </Section>

          <Section icon={Percent} title="Key ratios">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 -mx-4">
              {[
                { label: 'Cap rate',     value: hasRent ? `${capRate.toFixed(2)}%` : '—', red: hasRent && capRate < 4.5,
                  formula: 'Net operating income ÷ purchase price' },
                { label: 'Cash-on-cash', value: hasRent ? `${coc.toFixed(1)}%` : '—', red: hasRent && coc < 0,
                  formula: 'Annual cash flow ÷ cash required to close' },
                { label: 'GRM',          value: grm != null ? `${grm.toFixed(1)}×` : '—', red: false,
                  formula: 'Purchase price ÷ gross annual rent' },
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
        <p className="text-[11px] text-slate-500 leading-relaxed">
          The transfer tax is Centris's own calculation for this property. Amounts in parentheses are deductions.
          Payments compound semi-annually per the Interest Act (RSC 1985, c I-15, s 6).
          For illustration only — verify rates and terms with the lender.
        </p>
      </div>
    </div>
  )
}
