import { Plus, Trash2, ListChecks, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { Panel, StatTile, fmt$, toNum } from './primitives'
import { summarizeRentRoll, type RentRollUnit, type SuiteType } from '../../lib/cmhcUnderwriting'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'
import { useCmhcT, suiteLabel } from './i18n'

type Updater = <K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) => void

const SUITE_TYPES: SuiteType[] = ['bachelor', '1br', '2br', '3br_plus']

export default function RentRollTab({ inputs, update }: { inputs: CmhcUnderwritingInputs; update: Updater }) {
  const t = useCmhcT()
  const summary = summarizeRentRoll(inputs.rentRoll)
  const incomplete = inputs.rentRoll.some(u => u.suiteType == null || u.monthlyRent <= 0)

  function updateUnit(id: string, patch: Partial<RentRollUnit>) {
    update('rentRoll', inputs.rentRoll.map(u => u.id === id ? { ...u, ...patch } : u))
  }
  function addUnit() {
    const nextIndex = inputs.rentRoll.length + 1
    update('rentRoll', [...inputs.rentRoll, {
      id: `unit-${nextIndex}-${Date.now()}`, unitLabel: String(nextIndex), suiteType: null, suiteSizeSqft: null, monthlyRent: 0, parkingMonthly: 0,
    }])
  }
  function removeUnit(id: string) {
    if (inputs.rentRoll.length <= 1) return
    update('rentRoll', inputs.rentRoll.filter(u => u.id !== id))
  }

  const cell = 'py-1.5 pr-2 align-middle'
  const inputBase = 'input py-1.5 text-sm w-full'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label={t('totalUnits')} value={String(summary.totalUnits)} />
        <StatTile label={t('grossResidentialRevenue')} value={fmt$(summary.grossResidentialAnnual)} formula={t('grossResidentialSub')} />
        <StatTile label={t('parkingRevenue')} value={fmt$(summary.parkingAnnual)} />
        <StatTile label={t('avgRentUnit')} value={fmt$(summary.totalUnits > 0 ? summary.grossResidentialAnnual / summary.totalUnits / 12 : 0)} formula={t('perMonth')} />
      </div>

      {incomplete && (
        <div className="rounded-xl border border-score-market/30 bg-score-market/5 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={15} className="text-score-market shrink-0" />
          <p className="text-xs text-ink">{t('rentRollIncomplete')}</p>
        </div>
      )}

      <Panel title={t('summaryBySuite')} icon={<ListChecks size={13} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary.byType.map(row => (
            <div key={row.suiteType} className="bg-surface rounded-lg px-3 py-3">
              <p className="text-xs text-muted mb-1">{suiteLabel(t, row.suiteType)}</p>
              <p className="font-mono font-bold text-ink text-base">{row.unitCount} {t('unitsLabel')}</p>
              <p className="text-xs text-muted mt-0.5">{t('avg')} {fmt$(row.avgMonthlyRent)}{t('perMonth')}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-ink">{t('detailedRentRoll')}</h3>
          <button type="button" onClick={addUnit} className="btn-ghost text-xs py-1.5 hover:border-accent/40 hover:text-accent transition-colors">
            <Plus size={13} /> {t('addUnit')}
          </button>
        </div>
        <table className="w-full text-sm table-fixed min-w-[760px]">
          <colgroup>
            <col className="w-[9%]" />
            <col className="w-[23%]" />
            <col className="w-[15%]" />
            <col className="w-[17%]" />
            <col className="w-[15%]" />
            <col className="w-[16%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-surface-border">
              <th className="py-2 pr-2 font-semibold">{t('col_unit')}</th>
              <th className="py-2 pr-2 font-semibold">{t('col_suiteType')}</th>
              <th className="py-2 pr-2 font-semibold">{t('col_size')}</th>
              <th className="py-2 pr-2 font-semibold text-right">{t('col_monthlyRent')}</th>
              <th className="py-2 pr-2 font-semibold text-right">{t('col_parking')}</th>
              <th className="py-2 pr-2 font-semibold text-right">{t('col_annualRent')}</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {inputs.rentRoll.map(u => (
              <tr key={u.id} className="border-b border-surface-border last:border-b-0">
                <td className={cell}>
                  <input
                    type="text" value={u.unitLabel} onChange={e => updateUnit(u.id, { unitLabel: e.target.value })}
                    className={inputBase} aria-label={t('col_unit')}
                  />
                </td>
                <td className={cell}>
                  <select
                    value={u.suiteType ?? ''} onChange={e => updateUnit(u.id, { suiteType: (e.target.value || null) as SuiteType | null })}
                    className={clsx('select py-1.5 text-sm w-full', u.suiteType == null && 'border-score-market/60 ring-1 ring-score-market/30')}
                    aria-label={t('col_suiteType')} title={u.suiteType == null ? t('suiteRequired') : undefined}
                  >
                    <option value="">{t('select')}</option>
                    {SUITE_TYPES.map(st => <option key={st} value={st}>{suiteLabel(t, st)}</option>)}
                  </select>
                </td>
                <td className={cell}>
                  <input
                    type="text" inputMode="numeric" value={u.suiteSizeSqft ?? ''} placeholder="—"
                    onChange={e => updateUnit(u.id, { suiteSizeSqft: e.target.value ? toNum(e.target.value) : null })}
                    className={clsx(inputBase, 'text-right font-mono')} aria-label={t('col_size')}
                  />
                </td>
                <td className={cell}>
                  <input
                    type="text" inputMode="decimal" value={u.monthlyRent || ''} placeholder="0"
                    onChange={e => updateUnit(u.id, { monthlyRent: toNum(e.target.value) })}
                    className={clsx(inputBase, 'text-right font-mono', u.monthlyRent <= 0 && 'border-score-market/60 ring-1 ring-score-market/30')}
                    aria-label={t('col_monthlyRent')} title={u.monthlyRent <= 0 ? t('rentRequired') : undefined}
                  />
                </td>
                <td className={cell}>
                  <input
                    type="text" inputMode="decimal" value={u.parkingMonthly || ''} placeholder="0"
                    onChange={e => updateUnit(u.id, { parkingMonthly: toNum(e.target.value) })}
                    className={clsx(inputBase, 'text-right font-mono')} aria-label={t('col_parking')}
                  />
                </td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-ink align-middle">{fmt$(u.monthlyRent * 12)}</td>
                <td className="py-1.5 text-center align-middle">
                  <button
                    type="button" onClick={() => removeUnit(u.id)} disabled={inputs.rentRoll.length <= 1}
                    className="text-muted hover:text-score-notrecommended disabled:opacity-30 disabled:cursor-not-allowed p-1 transition-colors"
                    aria-label={t('removeUnit')}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-border font-semibold">
              <td className="py-2.5" colSpan={3}>{t('total')}</td>
              <td className="py-2.5 pr-2 text-right font-mono tabular-nums">{fmt$(inputs.rentRoll.reduce((s, u) => s + u.monthlyRent, 0))}</td>
              <td className="py-2.5 pr-2 text-right font-mono tabular-nums">{fmt$(inputs.rentRoll.reduce((s, u) => s + u.parkingMonthly, 0))}</td>
              <td className="py-2.5 pr-2 text-right font-mono tabular-nums">{fmt$(summary.grossResidentialAnnual)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
