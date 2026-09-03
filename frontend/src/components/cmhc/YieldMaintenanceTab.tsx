import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { Panel, Row, Field, FieldGrid, NumField, StatTile, fmt$, toNum } from './primitives'
import { calcYieldMaintenance } from '../../lib/cmhcUnderwriting'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'
import { useCmhcT } from './i18n'

type Updater = <K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) => void

export default function YieldMaintenanceTab({ inputs, update }: { inputs: CmhcUnderwritingInputs; update: Updater }) {
  const t = useCmhcT()
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
        title={t('ymTitle')}
        icon={<RotateCcw size={13} />}
        aside={<span className="text-[11px] text-muted/70">{t('ymAside')}</span>}
      >
        <FieldGrid>
          <Field label={t('outstandingBalance')}>
            <NumField label={t('outstandingBalance')} value={ym.outstandingBalance} onChange={v => setYm({ outstandingBalance: v })} suffix="$" width="w-full" />
          </Field>
          <Field label={t('remainingTerm')} sub={t('months')}>
            <NumField label={t('remainingTerm')} value={ym.remainingTermMonths} onChange={v => setYm({ remainingTermMonths: v })} width="w-full" />
          </Field>
          <Field label={t('remainingAmort')} sub={t('months')}>
            <NumField label={t('remainingAmort')} value={ym.remainingAmortMonths} onChange={v => setYm({ remainingAmortMonths: v })} width="w-full" />
          </Field>
          <Field label={t('mortgageRate')} sub={t('mortgageRateSub')}>
            <NumField label={t('mortgageRate')} value={ym.mortgageRatePct} onChange={v => setYm({ mortgageRatePct: v })} suffix="%" width="w-full" />
          </Field>
          <Field label={t('bondYield')} sub={t('bondYieldSub')}>
            <NumField label={t('bondYield')} value={ym.bondYieldPct} onChange={v => setYm({ bondYieldPct: v })} suffix="%" width="w-full" />
          </Field>
        </FieldGrid>
      </Panel>

      {result ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label={t('monthlyPayment')} value={fmt$(result.monthlyPayment)} />
            <StatTile label={t('ymBalanceMaturity')} value={fmt$(result.balanceAtMaturity)} />
            <StatTile
              label={t('ymPenalty')} value={fmt$(result.penalty)}
              valueClass={result.penalty > 0 ? 'text-score-notrecommended' : 'text-score-strong'}
            />
          </div>
          <Panel title={t('ymDetail')} icon={<RotateCcw size={13} />}>
            <Row label={t('ymValuePayout')} value={fmt$(result.valueAtPayout)} />
            <Row label={t('ymLessBalance')} value={fmt$(outstandingBalance)} negative />
            <Row label={t('ymPenalty')} value={fmt$(result.penalty)} bold red={result.penalty > 0} />
          </Panel>
        </>
      ) : (
        <p className="text-sm text-muted px-1">{t('ymEmpty')}</p>
      )}

      <p className="text-[11px] text-muted/70 leading-relaxed px-1">{t('ymFootnote')}</p>
    </div>
  )
}
