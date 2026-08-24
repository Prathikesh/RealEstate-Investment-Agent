/**
 * Per-property CMHC underwriting scenario persistence — mirrors
 * financingScenario.ts exactly (same localStorage-per-property pattern), so
 * a broker's deal inputs (rent roll, expenses, both mortgages, yield
 * maintenance) survive reload/navigation without needing a backend. This
 * tool is explicitly informational/parallel — not wired into the automated
 * pipeline or persisted server-side (see the plan for the tradeoffs).
 */
import type { CmhcBuildingTier } from './cmhcQuebecBenchmarks'
import { defaultBenchmarkTier } from './cmhcQuebecBenchmarks'
import type { RentRollUnit, SuiteType } from './cmhcUnderwriting'

export interface MortgageTerms {
  loanAmount: string
  ratePct: string
  termYears: string
  amortYears: string
}

export interface ReplacementReserveCountsInput {
  applianceCount: string
  heatPumpOrAcCount: string
  elevatorCount: string
}

export interface YieldMaintenanceScenarioInputs {
  outstandingBalance: string
  remainingTermMonths: string
  remainingAmortMonths: string
  mortgageRatePct: string
  bondYieldPct: string
}

export interface CmhcUnderwritingInputs {
  constructionTier: CmhcBuildingTier
  rentRoll: RentRollUnit[]
  commercialAnnual: string
  lockersAnnual: string
  vacantUnits: string
  vacancyPct: string

  municipalTax: string
  schoolTax: string
  water: string
  gas: string
  hydroCommon: string
  insurance: string
  elevatorOperating: string

  managementActual: string
  salariesActual: string
  maintenanceActual: string
  otherCostsActual: string
  replacementReserveActual: string
  reserveCounts: ReplacementReserveCountsInput

  structuralReservePctForNcf: string
  capRatePct: string
  capexAdjustment: string
  appraisedValue: string
  purchasePrice: string

  mortgage1: MortgageTerms
  mortgage2Enabled: boolean
  mortgage2: MortgageTerms

  existingDebt: string
  prepaymentPenalty: string

  yieldMaintenance: YieldMaintenanceScenarioInputs
}

export function defaultUnit(index: number, suiteType: SuiteType | null = null): RentRollUnit {
  return { id: `unit-${index}-${Date.now()}`, unitLabel: String(index), suiteType, suiteSizeSqft: null, monthlyRent: 0, parkingMonthly: 0 }
}

export function buildDefaultInputs(opts: {
  unitCount: number
  municipalTax: number | null
  schoolTax: number | null
  purchasePrice: number
  seedMonthlyRentPerUnit: number
}): CmhcUnderwritingInputs {
  const units = Math.max(1, opts.unitCount)
  return {
    constructionTier: defaultBenchmarkTier(units),
    rentRoll: Array.from({ length: units }, (_, i) => ({
      ...defaultUnit(i + 1),
      monthlyRent: opts.seedMonthlyRentPerUnit,
    })),
    commercialAnnual: '0',
    lockersAnnual: '0',
    vacantUnits: '0',
    vacancyPct: '5',

    municipalTax: opts.municipalTax != null ? String(opts.municipalTax) : '0',
    schoolTax: opts.schoolTax != null ? String(opts.schoolTax) : '0',
    water: '0', gas: '0', hydroCommon: '0', insurance: '0', elevatorOperating: '0',

    managementActual: '', salariesActual: '', maintenanceActual: '', otherCostsActual: '', replacementReserveActual: '',
    reserveCounts: { applianceCount: String(units), heatPumpOrAcCount: '0', elevatorCount: '0' },

    structuralReservePctForNcf: '0',
    capRatePct: '5.5',
    capexAdjustment: '0',
    appraisedValue: opts.purchasePrice > 0 ? String(Math.round(opts.purchasePrice)) : '',
    purchasePrice: opts.purchasePrice > 0 ? String(Math.round(opts.purchasePrice)) : '',

    mortgage1: { loanAmount: '', ratePct: '5.50', termYears: '5', amortYears: '25' },
    mortgage2Enabled: false,
    mortgage2: { loanAmount: '0', ratePct: '8.00', termYears: '1', amortYears: '25' },

    existingDebt: '0',
    prepaymentPenalty: '0',

    yieldMaintenance: { outstandingBalance: '', remainingTermMonths: '', remainingAmortMonths: '', mortgageRatePct: '', bondYieldPct: '' },
  }
}

export interface CmhcUnderwritingScenario {
  inputs: CmhcUnderwritingInputs
}

const keyFor = (propertyId: string) => `plexa.cmhcUnderwriting.${propertyId}`

export function loadCmhcScenario(propertyId: string): CmhcUnderwritingScenario | null {
  try {
    const raw = localStorage.getItem(keyFor(propertyId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CmhcUnderwritingScenario
    if (!parsed || typeof parsed !== 'object' || !parsed.inputs) return null
    return parsed
  } catch {
    return null
  }
}

export function saveCmhcScenario(propertyId: string, scenario: CmhcUnderwritingScenario): void {
  try {
    localStorage.setItem(keyFor(propertyId), JSON.stringify(scenario))
  } catch {
    /* storage full / disabled — scenario stays in-memory for the session */
  }
}

export function clearCmhcScenario(propertyId: string): void {
  try {
    localStorage.removeItem(keyFor(propertyId))
  } catch {
    /* no-op */
  }
}
