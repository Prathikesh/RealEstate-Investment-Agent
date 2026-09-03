import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
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
import { useCmhcT } from '../components/cmhc/i18n'

const AmortizationTab = lazy(() => import('../components/cmhc/AmortizationTab'))
const YieldMaintenanceTab = lazy(() => import('../components/cmhc/YieldMaintenanceTab'))

const TABS = [
  { key: 'income', tKey: 'tab_income', icon: TrendingUp },
  { key: 'rentRoll', tKey: 'tab_rentRoll', icon: ListChecks },
  { key: 'amortization', tKey: 'tab_amortization', icon: Building2 },
  { key: 'yieldMaintenance', tKey: 'tab_yield', icon: RotateCcw },
] as const
type TabKey = typeof TABS[number]['key']

const UNITS_BY_TYPE: Record<string, number> = {
  duplex: 2, triplex: 3, quadruplex: 4, quintuplex_plus: 5,
  single_family: 1, condo: 1, townhouse: 1,
}
// Fallback per-unit monthly rent used only when the listing carries no rent
// figure, so the calculator opens with workable numbers instead of $0. It is a
// starting estimate the broker overrides in the Rent Roll tab, not a fact.
const EST_RENT_PER_UNIT = 1100

export default function CmhcUnderwritingPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<TabKey>('income')
  const t = useCmhcT()
  const navigate = useNavigate()

  // Go back to the property WITHOUT pushing a new history entry — otherwise the
  // app's own "back to properties" (which uses browser-back) would land here
  // again. Fall back to a direct link if the user deep-linked with no history.
  function backToProperty() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(`/properties/${id ?? ''}`)
  }

  const { data: prop, isLoading, error } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetchProperty(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })

  const eligible = prop ? isCmhcUnderwritingEligible(prop) : null

  // Per-city market cap rate (Colliers band) sourced by the backend pipeline.
  // Answers the underwriter's "where does the cap rate come from?" — it seeds
  // the valuation default and shows its source, and it varies by city.
  const capRateInfo = useMemo(() => {
    const mb = prop?.market_benchmark
    if (!mb) return null
    const bandLowPct = mb.band_low * 100
    const bandHighPct = mb.band_high * 100
    return {
      defaultPct: Math.round(((bandLowPct + bandHighPct) / 2) * 100) / 100,
      bandLowPct,
      bandHighPct,
      label: mb.source_label,
      quarter: mb.source_quarter,
      cityKey: mb.city_key,
      caveat: mb.caveat,
    }
  }, [prop?.market_benchmark])

  const defaults = useMemo(() => {
    if (!prop) return null
    const estUnits = prop.unit_count ?? UNITS_BY_TYPE[prop.property_type] ?? 4
    // Seed the rent roll from the listing's actual rent when we have it,
    // otherwise from a per-unit estimate so the calculator opens populated
    // (the broker refines it in the Rent Roll tab).
    const seedMonthlyRentPerUnit = prop.rental_income_monthly
      ? Math.round((prop.rental_income_monthly / estUnits) * 100) / 100
      : EST_RENT_PER_UNIT
    return buildDefaultInputs({
      unitCount: estUnits,
      municipalTax: prop.municipal_taxes_annual,
      schoolTax: prop.school_taxes_annual,
      purchasePrice: prop.asking_price ?? 0,
      seedMonthlyRentPerUnit,
      capRatePctDefault: capRateInfo?.defaultPct,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop?.id, capRateInfo])

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
  if (error || !prop) return <CmhcError id={id} reason={t('errLoad')} />
  if (!eligible) {
    return <CmhcError id={id} reason={t('errEligibility')} />
  }
  if (!inputs) return <CmhcSkeleton />

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto animate-fade-in print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <button type="button" onClick={backToProperty} className="group inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
          <ArrowLeft size={14} className="transition-transform duration-200 group-hover:-translate-x-0.5" /> {t('backToProperty')}
        </button>
        <div className="flex items-center gap-2">
          {modified && (
            <button
              type="button" onClick={reset}
              className="group inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border text-muted hover:text-ink hover:border-score-market/40 hover:bg-score-market/5 transition-all duration-150 active:scale-95"
            >
              <RotateCcw size={13} className="transition-transform duration-300 group-hover:-rotate-180" /> {t('reset')}
            </button>
          )}
          <button
            type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-white font-medium shadow-sm hover:bg-accent-hover hover:shadow-md transition-all duration-150 active:scale-95"
          >
            <Printer size={13} /> {t('print')}
          </button>
        </div>
      </div>

      <div className="card relative overflow-hidden">
        <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-accent" aria-hidden />
        <div className="flex items-start gap-4 pl-2">
          <span className="hidden sm:inline-flex items-center justify-center h-11 w-11 rounded-xl bg-accent/10 text-accent shrink-0">
            <Building2 size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-accent uppercase tracking-widest mb-1">{t('eyebrow')}</p>
            <h1 className="text-xl font-bold text-ink leading-tight">{prop.full_address}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">{prop.city}</span>
              <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted capitalize">{prop.property_type.replace(/_/g, ' ')}</span>
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">{t('units', { n: inputs.rentRoll.length })}</span>
              {modified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-score-market/10 px-2.5 py-0.5 text-xs font-semibold text-score-market">
                  <span className="h-1.5 w-1.5 rounded-full bg-score-market" /> {t('scenarioInProgress')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-surface-border print:hidden">
        {TABS.map(({ key, tKey, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <Icon size={14} /> {t(tKey)}
          </button>
        ))}
      </div>

      <div className="tab-enter">
        {tab === 'income' && <IncomeAnalysisTab inputs={inputs} update={update} defaultTier={defaultBenchmarkTier(inputs.rentRoll.length)} capRateSource={capRateInfo} />}
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

      <p className="text-[11px] text-muted/70 leading-relaxed print:hidden">{t('disclaimer')}</p>
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
  const t = useCmhcT()
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link to={id ? `/properties/${id}` : '/properties'} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> {t('back')}
      </Link>
      <div className="card text-center py-16 space-y-3">
        <AlertCircle className="mx-auto text-muted" size={32} />
        <p className="text-ink font-semibold">{t('errTitle')}</p>
        <p className="text-sm text-muted max-w-md mx-auto">{reason}</p>
        <Link to={id ? `/properties/${id}` : '/properties'} className="inline-block mt-4 text-sm text-accent hover:underline">
          {t('returnToProperty')}
        </Link>
      </div>
    </div>
  )
}
