import { useState } from 'react'

interface Props {
  askingPrice: number | null | undefined
}

type Frequency = 'weekly' | 'biweekly' | 'monthly'
type Amortization = 5 | 10 | 15 | 20 | 25

/**
 * Canadian mortgage — semi-annual compounding
 * Interest Act, RSC 1985, c I-15, s 6
 */
function calcPayment(principal: number, annualRatePct: number, amortYears: number, freq: Frequency): number | null {
  if (!principal || !annualRatePct || !amortYears) return null
  const paymentsPerYear = freq === 'weekly' ? 52 : freq === 'biweekly' ? 26 : 12
  const semiAnnual = annualRatePct / 100 / 2
  const r = Math.pow(1 + semiAnnual, 1 / (paymentsPerYear / 2)) - 1
  const n = amortYears * paymentsPerYear
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function toNum(s: string) { return parseFloat(s.replace(/[^0-9.]/g, '')) || 0 }
function fmtCAD(v: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(v)
}

export default function DesjardinsCalculator({ askingPrice }: Props) {
  const initPrice = askingPrice != null ? Math.round(askingPrice) : 0
  const initDown  = Math.round(initPrice * 0.2)

  const [property, setProperty] = useState(initPrice > 0 ? initPrice.toString() : '')
  const [down,     setDown]     = useState(initDown  > 0 ? initDown.toString()  : '')
  const [rate,     setRate]     = useState('4.89')
  const [amort,    setAmort]    = useState<Amortization>(25)
  const [freq,     setFreq]     = useState<Frequency>('biweekly')
  const [result,   setResult]   = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)

  const propNum  = toNum(property)
  const downNum  = toNum(down)
  const loanNum  = Math.max(0, propNum - downNum)
  const downPct  = propNum > 0 ? ((downNum / propNum) * 100).toFixed(1) + ' %' : ''
  const freqLabel = freq === 'weekly' ? 'per week' : freq === 'biweekly' ? 'every 2 weeks' : 'per month'

  function calculate() {
    const r = parseFloat(rate) || 0
    setResult(calcPayment(loanNum, r, amort, freq))
    setShowResult(true)
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-border bg-white">
        <img
          src="https://www.desjardins.com/content/dam/desjardins/images/logo/logo-desjardins.svg"
          alt="Desjardins"
          className="h-6"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <h2 className="text-base font-semibold text-ink">Mortgage payment calculator</h2>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Cost of property */}
          <Field label="Cost of property" suffix="$">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Cost of property"
              value={property}
              onChange={e => setProperty(e.target.value)}
              className="field-input"
            />
          </Field>

          {/* Down payment */}
          <div>
            <label className="field-label">Down payment</label>
            <div className="flex gap-2">
              <div className="field-wrap flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Down payment"
                  value={down}
                  onChange={e => setDown(e.target.value)}
                  className="field-input pr-8"
                />
                <span className="field-suffix">$</span>
              </div>
              <div className="w-24 rounded-lg border border-surface-border bg-gray-50 px-3 py-2.5 text-sm text-muted text-center select-none">
                {downPct}
              </div>
            </div>
          </div>

          {/* Loan amount — disabled */}
          <Field label="Loan amount" suffix="$" disabled>
            <input
              type="text"
              disabled
              value={loanNum > 0 ? loanNum.toLocaleString('en-CA') : ''}
              className="field-input bg-gray-50 cursor-not-allowed text-muted"
            />
          </Field>

          {/* Interest rate */}
          <Field label="Interest rate" suffix="%">
            <div className="flex items-center">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rate}
                onChange={e => setRate(e.target.value)}
                className="field-input flex-1"
              />
              <div className="flex flex-col border-l border-surface-border">
                <button
                  type="button"
                  onClick={() => setRate(r => (Math.min(100, parseFloat(r || '0') + 0.01)).toFixed(2))}
                  className="px-2 py-1 text-muted hover:text-ink hover:bg-gray-50 text-xs border-b border-surface-border"
                >▲</button>
                <button
                  type="button"
                  onClick={() => setRate(r => (Math.max(0, parseFloat(r || '0') - 0.01)).toFixed(2))}
                  className="px-2 py-1 text-muted hover:text-ink hover:bg-gray-50 text-xs"
                >▼</button>
              </div>
            </div>
          </Field>

          {/* Amortization period */}
          <div>
            <label className="field-label">Amortization period</label>
            <select
              value={amort}
              onChange={e => setAmort(Number(e.target.value) as Amortization)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              {([5, 10, 15, 20, 25] as Amortization[]).map(y => (
                <option key={y} value={y}>{y} years</option>
              ))}
            </select>
          </div>

          {/* Payment frequency */}
          <div>
            <label className="field-label">Payment frequency</label>
            <select
              value={freq}
              onChange={e => setFreq(e.target.value as Frequency)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Calculate button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={calculate}
              disabled={loanNum <= 0 || !rate}
              className="w-full rounded-lg bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 text-sm transition-colors"
            >
              Calculate
            </button>
          </div>

          {/* Result */}
          <div className="flex items-center gap-3 min-h-[44px]">
            {showResult && (
              <>
                <span className="text-lg font-bold text-ink">
                  {result != null ? `${fmtCAD(result)} ${freqLabel}` : '—'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legal note */}
        <div className="mt-4 pt-4 border-t border-surface-border text-center">
          <button
            type="button"
            onClick={() => alert('This calculator is for illustration purposes only. Contact Desjardins for your actual mortgage rate and terms. Uses Canadian semi-annual compounding as required by the Interest Act, RSC 1985, c I-15, s 6.')}
            className="text-xs text-muted hover:text-ink underline inline-flex items-center gap-1"
          >
            Legal note
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared field wrapper ───────────────────────────────────────────────────────
function Field({ label, suffix, disabled, children }: {
  label: string
  suffix: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className={`field-wrap ${disabled ? 'opacity-60' : ''}`}>
        {children}
        <span className={`field-suffix ${disabled ? 'text-gray-400' : ''}`}>{suffix}</span>
      </div>
    </div>
  )
}
