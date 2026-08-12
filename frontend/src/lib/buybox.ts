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

/** Strip blank / zero / NaN entries so they never act as a filter. */
export function cleanBuyBox(bb: BuyBox): BuyBox {
  return Object.fromEntries(
    Object.entries(bb).filter(([, v]) => v != null && v !== 0 && !Number.isNaN(v)),
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
