import { Plus, Trash2, ListChecks } from 'lucide-react'
import { Panel, StatTile, fmt$, toNum } from './primitives'
import { summarizeRentRoll, SUITE_TYPE_LABELS, type RentRollUnit, type SuiteType } from '../../lib/cmhcUnderwriting'
import type { CmhcUnderwritingInputs } from '../../lib/cmhcUnderwritingScenario'

type Updater = <K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) => void

const SUITE_TYPES: SuiteType[] = ['bachelor', '1br', '2br', '3br_plus']

export default function RentRollTab({ inputs, update }: { inputs: CmhcUnderwritingInputs; update: Updater }) {
  const summary = summarizeRentRoll(inputs.rentRoll)

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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Units" value={String(summary.totalUnits)} />
        <StatTile label="Gross Residential Revenue" value={fmt$(summary.grossResidentialAnnual)} formula="/year, feeds the Income Analysis tab" />
        <StatTile label="Parking Revenue" value={fmt$(summary.parkingAnnual)} />
        <StatTile label="Avg. Rent / Unit" value={fmt$(summary.totalUnits > 0 ? summary.grossResidentialAnnual / summary.totalUnits / 12 : 0)} formula="/month" />
      </div>

      <Panel title="Summary by Suite Type" icon={<ListChecks size={13} />}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {summary.byType.map(t => (
            <div key={t.suiteType} className="bg-surface rounded-lg px-3 py-3">
              <p className="text-xs text-muted mb-1">{SUITE_TYPE_LABELS[t.suiteType]}</p>
              <p className="font-mono font-bold text-ink text-base">{t.unitCount} units</p>
              <p className="text-xs text-muted mt-0.5">avg {fmt$(t.avgMonthlyRent)}/mo</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="card space-y-0 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-muted uppercase tracking-widest">Detailed Rent Roll</h3>
          <button type="button" onClick={addUnit} className="btn-ghost text-xs py-1.5">
            <Plus size={13} /> Add unit
          </button>
        </div>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-surface-border">
              <th className="py-2 pr-2 font-semibold">Unit</th>
              <th className="py-2 pr-2 font-semibold">Suite Type</th>
              <th className="py-2 pr-2 font-semibold">Size (sqft)</th>
              <th className="py-2 pr-2 font-semibold text-right">Monthly Rent</th>
              <th className="py-2 pr-2 font-semibold text-right">Parking</th>
              <th className="py-2 pr-2 font-semibold text-right">Annual Rent</th>
              <th className="py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {inputs.rentRoll.map(u => (
              <tr key={u.id} className="border-b border-surface-border last:border-b-0">
                <td className="py-1.5 pr-2">
                  <input
                    type="text" value={u.unitLabel} onChange={e => updateUnit(u.id, { unitLabel: e.target.value })}
                    className="input py-1 text-sm w-20" aria-label="Unit label"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    value={u.suiteType ?? ''} onChange={e => updateUnit(u.id, { suiteType: (e.target.value || null) as SuiteType | null })}
                    className="select py-1 text-sm w-32" aria-label="Suite type"
                  >
                    <option value="">Select…</option>
                    {SUITE_TYPES.map(t => <option key={t} value={t}>{SUITE_TYPE_LABELS[t]}</option>)}
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text" inputMode="numeric" value={u.suiteSizeSqft ?? ''}
                    onChange={e => updateUnit(u.id, { suiteSizeSqft: e.target.value ? toNum(e.target.value) : null })}
                    className="input py-1 text-sm w-24" aria-label="Suite size"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text" inputMode="decimal" value={u.monthlyRent || ''}
                    onChange={e => updateUnit(u.id, { monthlyRent: toNum(e.target.value) })}
                    className="input py-1 text-sm w-28 text-right font-mono" aria-label="Monthly rent"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text" inputMode="decimal" value={u.parkingMonthly || ''}
                    onChange={e => updateUnit(u.id, { parkingMonthly: toNum(e.target.value) })}
                    className="input py-1 text-sm w-24 text-right font-mono" aria-label="Parking revenue"
                  />
                </td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-ink">{fmt$(u.monthlyRent * 12)}</td>
                <td className="py-1.5">
                  <button
                    type="button" onClick={() => removeUnit(u.id)} disabled={inputs.rentRoll.length <= 1}
                    className="text-muted hover:text-score-notrecommended disabled:opacity-30 disabled:cursor-not-allowed p-1"
                    aria-label="Remove unit"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-border font-semibold">
              <td className="py-2" colSpan={3}>Total</td>
              <td className="py-2 text-right font-mono tabular-nums">{fmt$(inputs.rentRoll.reduce((s, u) => s + u.monthlyRent, 0))}</td>
              <td className="py-2 text-right font-mono tabular-nums">{fmt$(inputs.rentRoll.reduce((s, u) => s + u.parkingMonthly, 0))}</td>
              <td className="py-2 text-right font-mono tabular-nums">{fmt$(summary.grossResidentialAnnual)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
