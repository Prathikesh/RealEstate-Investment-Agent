/**
 * "Buy box" — the investor's real-number targets (the client's "in numbers, not
 * percentages" request). Set on the Settings → My Scoring Criteria page, and
 * auto-applied both as filters AND as the target-relative scoring anchors on the
 * Properties page (see backend verdict.py / frontend lib/verdict.ts).
 *
 * Account-synced: the source of truth is the broker's `custom_buy_box` on their
 * account (follows them across devices). We keep a localStorage cache so the
 * Properties page can seed its filters instantly on first paint before the user
 * object has loaded. Keys must stay in sync with backend auth BUY_BOX_KEYS +
 * the properties-route query params.
 */
export type BuyBox = {
  cash_flow_min?: number
  cap_rate_min?: number
  discount_min?: number
  days_on_market_min?: number
  price_drop_min?: number       // min $ cut since listing
  price_drop_pct_min?: number   // min % cut since listing
  price_max?: number
}

export const BUYBOX_KEY = 'plexa.buybox'

/** Every target a buy box can set (must match PropertyFilters + backend). */
export const BUYBOX_KEYS: (keyof BuyBox)[] = [
  'cash_flow_min', 'cap_rate_min', 'discount_min', 'days_on_market_min',
  'price_drop_min', 'price_drop_pct_min', 'price_max',
]

/** The subset that also feeds target-relative scoring (mirrors verdict.ts). */
export const BUYBOX_SCORING_KEYS: (keyof BuyBox)[] = [
  'cash_flow_min', 'cap_rate_min', 'discount_min', 'days_on_market_min',
]

/**
 * Shared UI config for the buy-box slider rows — the single source of truth for
 * BOTH the Settings "My Scoring Criteria" panel and the Properties filter panel,
 * so the two surfaces stay in lockstep (label, colour, range, wording). Colours
 * match Settings' FACTOR_COLOR; `scored` marks the four that drive Your Verdict
 * (price cut is filter-only).
 */
export interface BuyBoxField {
  key: keyof BuyBox
  label: string
  desc: string
  color: string
  min: number
  max: number
  step: number
  prefix?: string
  suffix: string
  scored: boolean
  // When true, 0 and negative targets are valid (not treated as "off"). Only cash
  // flow uses this — an investor may accept break-even or a small monthly loss.
  allowNegative?: boolean
}

export const BUYBOX_FIELDS: BuyBoxField[] = [
  {
    key: 'cash_flow_min', label: 'Cash Flow', color: '#10B981', scored: true,
    desc: 'Monthly profit after mortgage, taxes & expenses',
    min: -1000, max: 3000, step: 50, prefix: '$', suffix: '/mo', allowNegative: true,
  },
  {
    key: 'cap_rate_min', label: 'Cap Rate', color: '#0EA5E9', scored: true,
    desc: 'Annual return — net income vs. purchase price',
    min: 0, max: 15, step: 0.5, suffix: '%',
  },
  {
    key: 'discount_min', label: 'Price Discount', color: '#2563EB', scored: true,
    desc: 'How far below comparable sales it is priced',
    min: 0, max: 30, step: 1, suffix: '%',
  },
  {
    key: 'days_on_market_min', label: 'Days Listed', color: '#EC4899', scored: true,
    desc: 'Days on market — longer means more seller leverage',
    min: 0, max: 180, step: 5, suffix: 'days',
  },
  {
    key: 'price_drop_min', label: 'Price Cut', color: '#64748B', scored: false,
    desc: 'Price cut since listing — a motivated-seller signal',
    min: 0, max: 100000, step: 2500, prefix: '$', suffix: 'cut',
  },
]

// Fields where 0 / negatives are legitimate targets (not "off"), so cleanBuyBox
// must keep them. Derived from BUYBOX_FIELDS so it stays in sync automatically.
const ALLOW_NEGATIVE_KEYS = new Set<keyof BuyBox>(
  BUYBOX_FIELDS.filter(f => f.allowNegative).map(f => f.key),
)

/**
 * Strip blank / NaN entries so they never act as a filter. For most fields `0`
 * also means "off" and is dropped; for allow-negative fields (cash flow) `0` and
 * negatives are real targets and are kept — only an empty box (undefined) is off.
 */
export function cleanBuyBox(bb: BuyBox): BuyBox {
  return Object.fromEntries(
    Object.entries(bb).filter(([k, v]) => {
      if (v == null || Number.isNaN(v)) return false
      if (ALLOW_NEGATIVE_KEYS.has(k as keyof BuyBox)) return true
      return v !== 0
    }),
  ) as BuyBox
}

/** localStorage cache — used to seed Properties filters before `user` loads. */
export function loadBuyBox(): BuyBox {
  try { return JSON.parse(localStorage.getItem(BUYBOX_KEY) || '{}') } catch { return {} }
}

/** Update the localStorage cache (the account is the source of truth). */
export function cacheBuyBox(bb: BuyBox): void {
  localStorage.setItem(BUYBOX_KEY, JSON.stringify(cleanBuyBox(bb)))
}

// Back-compat alias: callers that only cache locally.
export const saveBuyBox = cacheBuyBox
