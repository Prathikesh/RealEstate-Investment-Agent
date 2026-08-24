import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { Panel, Row, InputRow, NumField, StatTile, fmt$, toNum } from './primitives'
import { calcYieldMaintenance } from '../../lib/cmhcUnderwriting'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'

type Updater = <K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) => void

export default function YieldMaintenanceTab({ inputs, update }: { inputs: CmhcUnderwritingInputs; update: Updater }) {
  const ym = inputs.yieldMaintenance
  const setYm = (patch: Partial<typeof ym>) => update('yieldMaintenance', { ...ym, ...patch })

  // Seed from the 1st mortgage once, if the broker hasn't touched this tab yet.
  useEffect(() => {
    if (ym.outstandingBalance === '' && toNum(inputs.mortgage1.loanAmount) > 0) {
      setYm({
        outstandingBalance: inputs.mortgage1.loanAmount,
        remainingTermMonths: String(toNum(inputs.mortgage1.termYears) * 12),
        remainingAmortMonths: String(toNum(inputs.mortgage1.amortYears) * 12),
        mortgageRatePct: inputs.mortgage1.ratePct,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.mortgage1.loanAmount])

  const outstandingBalance = toNum(ym.outstandingBalance)
  const remainingTermMonths = toNum(ym.remainingTermMonths)
  const remainingAmortMonths = toNum(ym.remainingAmortMonths)
  const mortgageRatePct = toNum(ym.mortgageRatePct)
  const bondYieldPct = toNum(ym.bondYieldPct)

  const ready = outstandingBalance > 0 && remainingTermMonths > 0 && remainingAmortMonths > 0 && mortgageRatePct > 0 && bondYieldPct > 0
  const result = ready ? calcYieldMaintenance({ outstandingBalance, remainingTermMonths, remainingAmortMonths, mortgageRatePct, bondYieldPct }) : null

  return (
    <div className="space-y-5">
      <Panel
        title="Yield Maintenance Calculator"
        icon={<RotateCcw size={13} />}
        aside={<span className="text-[11px] text-muted/70">Prepayment penalty when breaking an existing CMHC-insured mortgage</span>}
      >
        <InputRow label="Outstanding Balance">
          <NumField label="Outstanding Balance" value={ym.outstandingBalance} onChange={v => setYm({ outstandingBalance: v })} suffix="$" />
        </InputRow>
        <InputRow label="Remaining Term" sub="months">
          <NumField label="Remaining Term (months)" value={ym.remainingTermMonths} onChange={v => setYm({ remainingTermMonths: v })} width="w-24" />
        </InputRow>
        <InputRow label="Remaining Amortization" sub="months">
          <NumField label="Remaining Amortization (months)" value={ym.remainingAmortMonths} onChange={v => setYm({ remainingAmortMonths: v })} width="w-24" />
        </InputRow>
        <InputRow label="Mortgage Rate" sub="the existing (old) rate on this loan">
          <NumField label="Mortgage Rate" value={ym.mortgageRatePct} onChange={v => setYm({ mortgageRatePct: v })} suffix="%" width="w-20" />
        </InputRow>
        <InputRow label="GOC Bond Yield" sub="matching the remaining term, as of today">
          <NumField label="Bond Yield" value={ym.bondYieldPct} onChange={v => setYm({ bondYieldPct: v })} suffix="%" width="w-20" />
        </InputRow>
      </Panel>

      {result ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="Monthly Payment" value={fmt$(result.monthlyPayment)} />
            <StatTile label="Balance at Maturity" value={fmt$(result.balanceAtMaturity)} />
            <StatTile
              label="Yield Maintenance Penalty" value={fmt$(result.penalty)}
              valueClass={result.penalty > 0 ? 'text-score-notrecommended' : 'text-score-strong'}
            />
          </div>
          <Panel title="Detail" icon={<RotateCcw size={13} />}>
            <Row label="Value at Payout (discounted at bond yield)" value={fmt$(result.valueAtPayout)} />
            <Row label="Less: Outstanding Balance" value={fmt$(outstandingBalance)} negative />
            <Row label="Yield Maintenance Penalty" value={fmt$(result.penalty)} bold red={result.penalty > 0} />
          </Panel>
        </>
      ) : (
        <p className="text-sm text-muted px-1">Fill in all five fields above to calculate the prepayment penalty.</p>
      )}

      <p className="text-[11px] text-muted/70 leading-relaxed px-1">
        Plug in the outstanding balance, remaining term and amortization, the mortgage's original rate, and the current
        GOC bond yield matching the remaining term. When the bond yield has dropped below the mortgage rate, the lender's
        penalty compensates for the interest-rate spread they'd lose on early repayment; when the bond yield is at or
        above the mortgage rate, the penalty floors at $0.
      </p>
    </div>
  )
}
