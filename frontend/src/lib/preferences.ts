// User investment/alert preferences, persisted to localStorage.
// No backend/auth yet — this makes Settings genuinely functional per-browser.
// (When accounts land, loadPreferences/savePreferences become the sync points.)

export interface Preferences {
  city:             string
  radius:           number
  budget:           string        // one of BUDGET_RANGES values, or ''
  propertyTypes:    string[]
  goals:            string[]      // multi-select: 'buy_and_hold' | 'buy_fix_sell'
  minScore:         number
  emailAlerts:      boolean
  email:            string
  smsAlerts:        boolean
  whatsappAlerts:   boolean
  phoneNumber:      string
  newListingAlerts: boolean
  priceDropAlerts:  boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  city:             '',
  radius:           25,
  budget:           '',
  propertyTypes:    ['triplex', 'quadruplex', 'duplex'],
  goals:            ['buy_and_hold', 'buy_fix_sell'],
  minScore:         60,
  emailAlerts:      true,
  email:            '',
  smsAlerts:        false,
  whatsappAlerts:   false,
  phoneNumber:      '',
  newListingAlerts: true,
  priceDropAlerts:  true,
}

const KEY = 'quartis.preferences'

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    // merge so new fields added later still get defaults
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

// Map a budget bucket to price_min/price_max query values.
const BUDGET_BOUNDS: Record<string, { min?: number; max?: number }> = {
  '0-300000':       { max: 300000 },
  '300000-500000':  { min: 300000, max: 500000 },
  '500000-750000':  { min: 500000, max: 750000 },
  '750000-1000000': { min: 750000, max: 1000000 },
  '1000000+':       { min: 1000000 },
}

// Build the Properties-list query string from saved preferences, so "Apply to
// search" actually filters the listings with what the user set here.
export function preferencesToSearchParams(prefs: Preferences): string {
  const p = new URLSearchParams()
  if (prefs.city.trim()) p.set('city', prefs.city.trim())
  if (prefs.minScore > 0) p.set('score_min', String(prefs.minScore))
  const bounds = BUDGET_BOUNDS[prefs.budget]
  if (bounds?.min != null) p.set('price_min', String(bounds.min))
  if (bounds?.max != null) p.set('price_max', String(bounds.max))
  // The list filter takes a single property type — only apply when exactly one.
  if (prefs.propertyTypes.length === 1) p.set('property_type', prefs.propertyTypes[0])
  return p.toString()
}
