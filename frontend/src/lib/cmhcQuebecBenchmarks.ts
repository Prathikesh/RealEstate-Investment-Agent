/**
 * CMHC's published regional operating-expense benchmarks — Quebec column only.
 *
 * Source:  CMHC — "2025-2026 Benchmarks per Region" (National Operating
 *          Expense Benchmarks), Quebec sheet.
 * Scope:   Quebec only — this platform operates in Quebec exclusively (see
 *          MUNICIPAL_TAX_RATES_BY_CITY / welcome-tax formulas on the backend),
 *          so the other four regions in the source workbook are out of scope.
 * Update:  Annually — CMHC republishes this workbook each year.
 * Verified: 2026-08-24 (source file: "Copy of 2025-26 National Benchmarks by
 *          Region - Baremes nationaux par region.xlsx", Quebec sheet, cell-
 *          for-cell against the English Summary sheet's Québec column).
 *
 * CMHC's own underwriting rule (from that workbook's Q&A sheet, verbatim):
 * "For an existing property, the actuals are to be used for operating
 * expenses such as taxes, insurance and utilities. The greater of the
 * actuals (less capital expenses for repair and maintenance) or the
 * benchmarks... should be used for the remaining line items." I.e. Taxes /
 * Insurance / Utilities always use the real figures; Management / Salaries /
 * Maintenance / Other Costs / Replacement Reserve use MAX(actual, benchmark)
 * — see applyExpenseBenchmark() in cmhcUnderwriting.ts.
 */

export type CmhcBuildingTier = 'wood_frame_le11' | 'wood_frame_12plus' | 'concrete'

export interface CmhcBenchmarkTier {
  label: string
  /** Repairs & maintenance, $ per unit per annum. */
  maintenancePupa: number
  /** Whether maintenancePupa already includes elevator maintenance (Concrete tier does; wood-frame tiers don't). */
  maintenanceIncludesElevator: boolean
  /** Management fee, % of Effective Gross Income. */
  managementPctEgi: number
  /** Salaries/wages, $ per unit per annum. */
  salariesPupa: number
  /** "Other Costs" (advertising, permits, garbage, snow, landscaping, security…), % of EGI. */
  otherCostsPctEgi: number
  replacementReserve: {
    perAppliancePerMonth: number      // fridge, stove, dishwasher, washer, dryer — each counted separately
    perHeatPumpOrAcPerMonth: number   // wall heat pump / air conditioner unit
    /** null = no separate elevator reserve line for this tier (already folded into maintenancePupa). */
    perElevatorPerMonth: number | null
  }
}

export const CMHC_QC_BENCHMARK_TIERS: Record<CmhcBuildingTier, CmhcBenchmarkTier> = {
  wood_frame_le11: {
    label: 'Wood Frame — 11 units or less',
    maintenancePupa: 700,
    maintenanceIncludesElevator: false,
    managementPctEgi: 4.5,
    salariesPupa: 250,
    otherCostsPctEgi: 1,
    replacementReserve: { perAppliancePerMonth: 60, perHeatPumpOrAcPerMonth: 190, perElevatorPerMonth: 315 },
  },
  wood_frame_12plus: {
    label: 'Wood Frame — 12 units or more',
    maintenancePupa: 700,
    maintenanceIncludesElevator: false,
    managementPctEgi: 5,
    salariesPupa: 400,
    otherCostsPctEgi: 1,
    replacementReserve: { perAppliancePerMonth: 60, perHeatPumpOrAcPerMonth: 190, perElevatorPerMonth: 315 },
  },
  concrete: {
    label: 'Concrete',
    maintenancePupa: 1040,
    maintenanceIncludesElevator: true,
    managementPctEgi: 5,
    salariesPupa: 670,
    otherCostsPctEgi: 1,
    replacementReserve: { perAppliancePerMonth: 60, perHeatPumpOrAcPerMonth: 190, perElevatorPerMonth: null },
  },
}

export const CMHC_BENCHMARK_TIER_OPTIONS: Array<{ value: CmhcBuildingTier; label: string }> =
  (Object.keys(CMHC_QC_BENCHMARK_TIERS) as CmhcBuildingTier[]).map(value => ({
    value, label: CMHC_QC_BENCHMARK_TIERS[value].label,
  }))

/** Sensible default tier from unit count alone — Concrete always needs an explicit broker override. */
export function defaultBenchmarkTier(unitCount: number | null | undefined): CmhcBuildingTier {
  return (unitCount ?? 0) >= 12 ? 'wood_frame_12plus' : 'wood_frame_le11'
}

export const CMHC_BENCHMARK_SOURCE = {
  label: 'CMHC National Operating Expense Benchmarks',
  edition: '2025-2026 Benchmarks per Region',
  region: 'Quebec',
}
