import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X, Building2, ExternalLink, GitCompareArrows, ArrowLeft } from 'lucide-react'
import clsx from 'clsx'
import { fetchProperty } from '../api'
import type { PropertyDetail } from '../api'
import { useCompare } from '../context/CompareContext'
import ScoreBadge from '../components/ScoreBadge'

function fmtCAD(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}
function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('en-CA', { maximumFractionDigits: decimals })
}
function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}%`
}
// vfenvioefnveifnver
// ── Row definitions ───────────────────────────────────────────────────────────

interface Row {
  label: string
  group?: string
  getValue: (p: PropertyDetail) => string
  getRaw: (p: PropertyDetail) => number | null
  higherIsBetter?: boolean   // undefined = no winner highlight
  lowerIsBetter?: boolean
}

const ROWS: Row[] = [
  // Price
  { group: 'Pricing', label: 'Asking Price',    getValue: p => fmtCAD(p.asking_price),      getRaw: p => p.asking_price,      lowerIsBetter: true },
  { group: 'Pricing', label: 'Price / sqft',    getValue: p => fmtCAD(p.price_per_sqft),    getRaw: p => p.price_per_sqft,    lowerIsBetter: true },
  { group: 'Pricing', label: 'Below Market',    getValue: p => p.discount_pct != null ? `${p.discount_pct > 0 ? '↓' : '↑'} ${Math.abs(p.discount_pct).toFixed(1)}%` : '—', getRaw: p => p.discount_pct, higherIsBetter: true },
  // Returns
  { group: 'Returns', label: 'AI Score',         getValue: p => p.score != null ? `${p.score}/100` : '—', getRaw: p => p.score, higherIsBetter: true },
  { group: 'Returns', label: 'Yearly Return',    getValue: p => fmtPct(p.cap_rate, 2),       getRaw: p => p.cap_rate,          higherIsBetter: true },
  { group: 'Returns', label: 'Monthly Profit',   getValue: p => fmtCAD(p.monthly_cash_flow), getRaw: p => p.monthly_cash_flow, higherIsBetter: true },
  { group: 'Returns', label: 'Cash-on-Cash',     getValue: p => fmtPct(p.cash_on_cash_return, 2), getRaw: p => p.cash_on_cash_return, higherIsBetter: true },
  { group: 'Returns', label: 'Annual NOI',       getValue: p => fmtCAD(p.noi_annual),        getRaw: p => p.noi_annual,        higherIsBetter: true },
  { group: 'Returns', label: 'Monthly Rent',     getValue: p => fmtCAD(p.rental_income_monthly), getRaw: p => p.rental_income_monthly, higherIsBetter: true },
  // Property
  { group: 'Property', label: 'Type',            getValue: p => p.property_type.replace(/_/g, ' '), getRaw: () => null },
  { group: 'Property', label: 'Units',           getValue: p => fmtNum(p.unit_count),        getRaw: p => p.unit_count,        higherIsBetter: true },
  { group: 'Property', label: 'Bedrooms',        getValue: p => fmtNum(p.bedrooms_total),    getRaw: p => p.bedrooms_total,    higherIsBetter: true },
  { group: 'Property', label: 'Bathrooms',       getValue: p => fmtNum(p.bathrooms_total),   getRaw: p => p.bathrooms_total },
  { group: 'Property', label: 'Total sqft',      getValue: p => p.sqft_total != null ? `${p.sqft_total.toLocaleString('en-CA')} sqft` : '—', getRaw: p => p.sqft_total, higherIsBetter: true },
  { group: 'Property', label: 'Lot sqft',        getValue: p => p.lot_sqft != null ? `${p.lot_sqft.toLocaleString('en-CA')} sqft` : '—', getRaw: p => p.lot_sqft },
  { group: 'Property', label: 'Year Built',      getValue: p => p.year_built != null ? String(p.year_built) : '—', getRaw: p => p.year_built, higherIsBetter: true },
  { group: 'Property', label: 'Parking',         getValue: p => fmtNum(p.parking_spaces),    getRaw: p => p.parking_spaces },
  // Costs
  { group: 'Costs',   label: 'Municipal Tax',    getValue: p => fmtCAD(p.municipal_taxes_annual), getRaw: p => p.municipal_taxes_annual, lowerIsBetter: true },
  { group: 'Costs',   label: 'School Tax',       getValue: p => fmtCAD(p.school_taxes_annual),    getRaw: p => p.school_taxes_annual,    lowerIsBetter: true },
  { group: 'Costs',   label: 'Condo Fees/mo',    getValue: p => fmtCAD(p.condo_fees_monthly),     getRaw: p => p.condo_fees_monthly,     lowerIsBetter: true },
  { group: 'Costs',   label: 'Welcome Tax',      getValue: p => fmtCAD(p.welcome_tax),            getRaw: p => p.welcome_tax,            lowerIsBetter: true },
  { group: 'Costs',   label: 'Down Payment 20%', getValue: p => fmtCAD(p.down_payment_20pct),     getRaw: p => p.down_payment_20pct,     lowerIsBetter: true },
  { group: 'Costs',   label: 'Monthly Mortgage', getValue: p => fmtCAD(p.monthly_mortgage),       getRaw: p => p.monthly_mortgage,       lowerIsBetter: true },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function winnerIndex(row: Row, props: PropertyDetail[]): number | null {
  if (!row.higherIsBetter && !row.lowerIsBetter) return null
  const vals = props.map(p => row.getRaw(p))
  if (vals.every(v => v == null)) return null
  const best = row.higherIsBetter
    ? Math.max(...vals.filter((v): v is number => v != null))
    : Math.min(...vals.filter((v): v is number => v != null))
  const idx = vals.indexOf(best)
  // only highlight if it's actually different from the rest
  const others = vals.filter((_, i) => i !== idx)
  if (others.every(v => v === best)) return null
  return idx
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Compare() {
  const { items, remove, clear } = useCompare()

  const results = useQueries({
    queries: items.map(item => ({
      queryKey: ['property', item.id],
      queryFn: () => fetchProperty(item.id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const props = results.map(r => r.data).filter((d): d is PropertyDetail => d != null)
  const loading = results.some(r => r.isLoading)

  if (items.length === 0) {
    return (
      <div className="p-6 animate-slide-up">
        <div className="card py-20 text-center space-y-4">
          <GitCompareArrows size={40} className="text-muted mx-auto" />
          <div>
            <p className="font-bold text-ink text-lg">No properties to compare</p>
            <p className="text-sm text-muted mt-1">Use the + button on property cards to add up to 3 properties.</p>
          </div>
          <Link to="/properties" className="btn-primary inline-flex mx-auto">
            Browse properties
          </Link>
        </div>
      </div>
    )
  }

  // Group rows by group label for section dividers
  const groups = [...new Set(ROWS.map(r => r.group))]

  return (
    <div className="p-6 space-y-6 animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/properties" className="btn-ghost p-2">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-ink">Property Comparison</h1>
            <p className="text-sm text-muted mt-0.5">
              Comparing {items.length} {items.length === 1 ? 'property' : 'properties'} side-by-side
            </p>
          </div>
        </div>
        <button onClick={clear} className="btn-ghost text-xs">
          Clear all
        </button>
      </div>

      {loading ? (
        <div className="card py-16 text-center text-muted text-sm animate-pulse">Loading property data…</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">

            {/* ── Property header row ── */}
            <thead>
              <tr className="border-b border-surface-border">
                <th className="w-40 px-5 py-4 text-left text-xs font-semibold text-muted uppercase tracking-wider bg-surface sticky left-0 z-10 border-r border-surface-border">
                  Metric
                </th>
                {items.map((item, i) => {
                  const prop = props[i]
                  return (
                    <th key={item.id} className="px-4 py-4 text-left align-top min-w-[200px]">
                      <div className="space-y-2">
                        {/* Photo */}
                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-surface-hover relative">
                          {item.photos[0]
                            ? <img src={item.photos[0]} referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                              />
                            : <Building2 size={24} className="text-surface-border absolute inset-0 m-auto" />
                          }
                          {prop && (
                            <div className="absolute top-2 left-2">
                              <ScoreBadge score={prop.score} category={prop.score_category} size="sm" />
                            </div>
                          )}
                          <button
                            onClick={() => remove(item.id)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center text-muted hover:text-ink transition-colors"
                          >
                            <X size={11} />
                          </button>
                        </div>
                        {/* Address */}
                        <div>
                          <p className="text-sm font-bold text-ink leading-tight line-clamp-2">{item.full_address}</p>
                          <p className="text-xs text-muted mt-0.5">{item.city}</p>
                        </div>
                        {/* Quick links */}
                        <div className="flex gap-2">
                          <Link to={`/properties/${item.id}`}
                            className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
                          >
                            View details <ExternalLink size={10} />
                          </Link>
                          {prop?.listing_url && (
                            <a href={prop.listing_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-muted hover:text-ink flex items-center gap-1"
                            >
                              Listing <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </th>
                  )
                })}
                {/* Empty add-slot if < 3 */}
                {items.length < 3 && (
                  <th className="px-4 py-4 align-top min-w-[180px]">
                    <Link to="/properties"
                      className="flex flex-col items-center justify-center gap-2 aspect-video w-full rounded-xl border-2 border-dashed border-surface-border hover:border-accent/40 transition-colors text-muted hover:text-accent"
                    >
                      <span className="text-2xl font-bold leading-none">+</span>
                      <span className="text-xs font-medium">Add property</span>
                    </Link>
                  </th>
                )}
              </tr>
            </thead>

            {/* ── Metric rows ── */}
            <tbody>
              {groups.map(group => {
                const groupRows = ROWS.filter(r => r.group === group)
                return (
                  <>
                    {/* Group header */}
                    <tr key={`g-${group}`} className="bg-surface border-b border-surface-border">
                      <td colSpan={items.length + (items.length < 3 ? 2 : 1)}
                        className="px-5 py-2 text-[10px] font-bold text-muted uppercase tracking-widest"
                      >
                        {group}
                      </td>
                    </tr>

                    {groupRows.map(row => {
                      const winner = props.length >= 2 ? winnerIndex(row, props) : null
                      return (
                        <tr key={row.label} className="border-b border-surface-border last:border-0 hover:bg-surface/40 transition-colors">
                          {/* Label cell */}
                          <td className="px-5 py-3 text-xs font-semibold text-muted sticky left-0 bg-white border-r border-surface-border z-10">
                            {row.label}
                          </td>

                          {/* Value cells */}
                          {items.map((item, i) => {
                            const prop = props[i]
                            const isWinner = winner === i
                            return (
                              <td key={item.id}
                                className={clsx(
                                  'px-4 py-3 text-sm tabular-nums font-mono transition-colors',
                                  isWinner
                                    ? 'bg-score-strong/5 text-score-strong font-bold'
                                    : 'text-ink font-semibold',
                                )}
                              >
                                <span className="flex items-center gap-1">
                                  {isWinner && <span className="text-score-strong text-[10px] font-bold">★</span>}
                                  {prop ? row.getValue(prop) : <span className="text-muted/40">—</span>}
                                </span>
                              </td>
                            )
                          })}

                          {/* Empty slot spacer */}
                          {items.length < 3 && <td className="px-4 py-3" />}
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted text-center pb-4">
        ★ marks the best value for each metric. Green = winner.
      </p>
    </div>
  )
}
