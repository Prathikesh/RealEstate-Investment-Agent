import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, AlertCircle, Building2, ListChecks, TrendingUp, RotateCcw, Printer } from 'lucide-react'
import clsx from 'clsx'
import { fetchProperty } from '../api'
import { isCmhcUnderwritingEligible } from '../lib/cmhcUnderwriting'
import {
  buildDefaultInputs, loadCmhcScenario, saveCmhcScenario, clearCmhcScenario,
  type CmhcUnderwritingInputs,
} from '../lib/cmhcUnderwritingScenario'
import { defaultBenchmarkTier } from '../lib/cmhcQuebecBenchmarks'
import IncomeAnalysisTab from '../components/cmhc/IncomeAnalysisTab'
import RentRollTab from '../components/cmhc/RentRollTab'

const AmortizationTab = lazy(() => import('../components/cmhc/AmortizationTab'))
const YieldMaintenanceTab = lazy(() => import('../components/cmhc/YieldMaintenanceTab'))

const TABS = [
  { key: 'income', label: 'Income Analysis', icon: TrendingUp },
  { key: 'rentRoll', label: 'Rent Roll', icon: ListChecks },
  { key: 'amortization', label: 'Amortization', icon: Building2 },
  { key: 'yieldMaintenance', label: 'Yield Maintenance', icon: RotateCcw },
] as const
type TabKey = typeof TABS[number]['key']

const UNITS_BY_TYPE: Record<string, number> = {
  duplex: 2, triplex: 3, quadruplex: 4, quintuplex_plus: 5,
  single_family: 1, condo: 1, townhouse: 1,
}
const DEFAULT_RENT_PER_UNIT = 1200

export default function CmhcUnderwritingPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<TabKey>('income')

  const { data: prop, isLoading, error } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetchProperty(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })

  const eligible = prop ? isCmhcUnderwritingEligible(prop) : null

  const defaults = useMemo(() => {
    if (!prop) return null
    const estUnits = prop.unit_count ?? UNITS_BY_TYPE[prop.property_type] ?? 4
    const seedMonthlyRentPerUnit = prop.rental_income_monthly
      ? Math.round((prop.rental_income_monthly / estUnits) * 100) / 100
      : DEFAULT_RENT_PER_UNIT
    return buildDefaultInputs({
      unitCount: estUnits,
      municipalTax: prop.municipal_taxes_annual,
      schoolTax: prop.school_taxes_annual,
      purchasePrice: prop.asking_price ?? 0,
      seedMonthlyRentPerUnit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop?.id])

  const [inputs, setInputs] = useState<CmhcUnderwritingInputs | null>(null)

  useEffect(() => {
    if (!defaults || !prop) return
    const saved = loadCmhcScenario(prop.id)?.inputs
    setInputs(saved ?? defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop?.id, defaults])

  const modified = useMemo(() => {
    if (!inputs || !defaults) return false
    return JSON.stringify(inputs) !== JSON.stringify(defaults)
  }, [inputs, defaults])

  useEffect(() => {
    if (!prop || !inputs) return
    if (modified) saveCmhcScenario(prop.id, { inputs })
    else clearCmhcScenario(prop.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop?.id, inputs, modified])

  function update<K extends keyof CmhcUnderwritingInputs>(key: K, value: CmhcUnderwritingInputs[K]) {
    setInputs(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function reset() {
    if (!prop || !defaults) return
    setInputs(defaults)
    clearCmhcScenario(prop.id)
  }

  if (isLoading || (prop && !inputs)) return <CmhcSkeleton />
  if (error || !prop) return <CmhcError id={id} reason="Could not load this property." />
  if (!eligible) {
    return (
      <CmhcError
        id={id}
        reason="CMHC MLI underwriting is only available for quadruplex / quintuplex+ properties currently for sale."
      />
    )
  }
  if (!inputs) return <CmhcSkeleton />

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto animate-fade-in print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link to={`/properties/${prop.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Back to property
        </Link>
        <div className="flex items-center gap-2">
          {modified && (
            <button type="button" onClick={reset} className="btn-ghost">
              <RotateCcw size={13} /> Reset
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="btn-ghost">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      <div className="card">
        <p className="text-xs font-bold text-accent uppercase tracking-widest mb-1">CMHC MLI Underwriting</p>
        <h1 className="text-xl font-bold text-ink">{prop.full_address}</h1>
        <p className="text-sm text-muted mt-1">
          {prop.city} · {prop.property_type.replace(/_/g, ' ')} · {inputs.rentRoll.length} units
          {modified && <span className="ml-2 text-accent font-semibold">· Scenario in progress</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-surface-border print:hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="tab-enter">
        {tab === 'income' && <IncomeAnalysisTab inputs={inputs} update={update} defaultTier={defaultBenchmarkTier(inputs.rentRoll.length)} />}
        {tab === 'rentRoll' && <RentRollTab inputs={inputs} update={update} />}
        {tab === 'amortization' && (
          <Suspense fallback={<div className="card animate-pulse h-64" />}>
            <AmortizationTab inputs={inputs} />
          </Suspense>
        )}
        {tab === 'yieldMaintenance' && (
          <Suspense fallback={<div className="card animate-pulse h-64" />}>
            <YieldMaintenanceTab inputs={inputs} update={update} />
          </Suspense>
        )}
      </div>

      <p className="text-[11px] text-muted/70 leading-relaxed print:hidden">
        Informational underwriting worksheet based on CMHC's 2025-26 published Quebec benchmarks and the
        MLI premium/fee schedule. Not a commitment to lend — confirm current rates, fees and eligibility
        with CMHC and your lender before submitting an application.
      </p>
    </div>
  )
}

function CmhcSkeleton() {
  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto animate-pulse">
      <div className="h-4 w-32 bg-surface-border rounded" />
      <div className="card space-y-3">
        <div className="h-5 w-72 bg-surface-border rounded" />
        <div className="h-3 w-48 bg-surface-border rounded" />
      </div>
      {[0, 1, 2].map(i => <div key={i} className="card h-32 bg-surface-border/30" />)}
    </div>
  )
}

function CmhcError({ id, reason }: { id: string | undefined; reason: string }) {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link to={id ? `/properties/${id}` : '/properties'} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> Back
      </Link>
      <div className="card text-center py-16 space-y-3">
        <AlertCircle className="mx-auto text-muted" size={32} />
        <p className="text-ink font-semibold">CMHC underwriting tool unavailable</p>
        <p className="text-sm text-muted max-w-md mx-auto">{reason}</p>
        <Link to={id ? `/properties/${id}` : '/properties'} className="inline-block mt-4 text-sm text-accent hover:underline">
          Return to property
        </Link>
      </div>
    </div>
  )
}
