/**
 * Per-property financing scenario persistence.
 *
 * The FinancingWorkbench lets an investor "move the numbers around" (down payment,
 * rate, rent, vacancy…) and watch the verdict react. Those inputs used to be pure
 * component state — lost on reload and invisible to the AI Verdict tab. We persist
 * them per property (localStorage) so a scenario survives navigation/reload, and we
 * also stash the DERIVED cap-rate/cash-flow so PropertyPage can feed the same live
 * values to the AI Verdict tab's VerdictCompare — making "Your Verdict" react to the
 * scenario everywhere on the page, not just inside the workbench.
 */
export type Frequency = 'monthly' | 'biweekly' | 'weekly'

export interface FinancingInputs {
  offer: string
  downPct: string
  rate: string
  amort: number
  freq: Frequency
  rentEst: string
  vacancyPct: string
  mgmtPct: string
  insurance: string
  maintPct: string
}

/** Derived values that drive the live verdict recompute. */
export interface FinancingLive {
  capRatePct: number
  monthlyCashFlow: number
}

export interface FinancingScenario {
  inputs: FinancingInputs
  /** Present only when the user has changed a term from the listing defaults. */
  live?: FinancingLive
  modified: boolean
}

const keyFor = (propertyId: string) => `plexa.financing.${propertyId}`

export function loadFinancingScenario(propertyId: string): FinancingScenario | null {
  try {
    const raw = localStorage.getItem(keyFor(propertyId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FinancingScenario
    if (!parsed || typeof parsed !== 'object' || !parsed.inputs) return null
    return parsed
  } catch {
    return null
  }
}

export function saveFinancingScenario(propertyId: string, scenario: FinancingScenario): void {
  try {
    localStorage.setItem(keyFor(propertyId), JSON.stringify(scenario))
  } catch {
    /* storage full / disabled — scenario stays in-memory for the session */
  }
}

export function clearFinancingScenario(propertyId: string): void {
  try {
    localStorage.removeItem(keyFor(propertyId))
  } catch {
    /* no-op */
  }
}
