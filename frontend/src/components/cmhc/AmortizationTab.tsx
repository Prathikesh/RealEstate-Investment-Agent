import { useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Panel, StatTile, fmt$, toNum } from './primitives'
import { buildAmortizationSchedule, monthlyMortgagePayment } from '../../lib/cmhcUnderwriting'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'
import { useCmhcT } from './i18n'

export default function AmortizationTab({ inputs }: { inputs: CmhcUnderwritingInputs }) {
  const t = useCmhcT()
  const [which, setWhich] = useState<'1' | '2'>('1')
  const terms = which === '1' ? inputs.mortgage1 : inputs.mortgage2
  const principal = toNum(terms.loanAmount)
  const rate = toNum(terms.ratePct)
  const amortYears = toNum(terms.amortYears)

  const schedule = useMemo(() => buildAmortizationSchedule(principal, rate, amortYears), [principal, rate, amortYears])
  const payment = monthlyMortgagePayment(principal, rate, amortYears)
  const totalInterest = schedule.reduce((s, r) => s + r.interestPortion, 0)

  const disabled2 = !inputs.mortgage2Enabled

  return (
    <div className="space-y-5">
      <Panel
        title={t('amortSchedule')}
        icon={<Building2 size={13} />}
        aside={
          <div className="inline-flex rounded-lg border border-surface-border overflow-hidden text-xs">
            <button
              type="button" onClick={() => setWhich('1')}
              className={`px-3 py-1.5 font-semibold ${which === '1' ? 'bg-accent text-white' : 'bg-white text-muted hover:text-ink'}`}
            >{t('firstMortgageShort')}</button>
            <button
              type="button" onClick={() => setWhich('2')} disabled={disabled2}
              className={`px-3 py-1.5 font-semibold border-l border-surface-border disabled:opacity-40 disabled:cursor-not-allowed ${which === '2' ? 'bg-accent text-white' : 'bg-white text-muted hover:text-ink'}`}
            >{t('secondMortgageShort')}</button>
          </div>
        }
      >
        {principal <= 0 || rate <= 0 || amortYears <= 0 ? (
          <p className="text-sm text-muted py-4">
            {t('amortEmpty', { which: which === '1' ? t('firstMortgageShort') : t('secondMortgageShort') })}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatTile label={t('monthlyPayment')} value={fmt$(payment)} />
              <StatTile label={t('totalPayments')} value={String(schedule.length)} />
              <StatTile label={t('totalInterest')} value={fmt$(totalInterest)} />
              <StatTile label={t('totalPrincipal')} value={fmt$(principal)} />
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-surface-border rounded-lg">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="sticky top-0 bg-surface-card">
                  <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-surface-border">
                    <th className="py-2 px-3 font-semibold">#</th>
                    <th className="py-2 px-3 font-semibold text-right">{t('col_interest')}</th>
                    <th className="py-2 px-3 font-semibold text-right">{t('col_principal')}</th>
                    <th className="py-2 px-3 font-semibold text-right">{t('col_endingBalance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(row => (
                    <tr key={row.paymentNum} className="border-b border-surface-border last:border-b-0">
                      <td className="py-1.5 px-3 text-muted">{row.paymentNum}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums">{fmt$(row.interestPortion, 2)}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums">{fmt$(row.principalPortion, 2)}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums font-semibold">{fmt$(row.endingBalance, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
