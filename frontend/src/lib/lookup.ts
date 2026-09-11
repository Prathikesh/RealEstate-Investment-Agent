/**
 * Client for the on-demand property lookup ("paste a link / type an address →
 * scrape live + analyze"). Talks to the main backend via the shared axios
 * instance (same /api proxy + auth cookies as everything else).
 */
import { http } from '../api'

export type LookupStatus =
  | 'pending' | 'resolving' | 'scraping' | 'analyzing'
  | 'done' | 'found' | 'needs_url' | 'not_found' | 'scrape_unavailable' | 'failed'

export interface LookupJob {
  job_id: string
  status: LookupStatus
  step: string
  property_id: string | null
  error: string | null
}

export interface AddressSuggestion {
  id: string
  full_address: string
  city: string
  asking_price: number | null
  score: number | null
}

export function detectKind(text: string): 'url' | 'address' {
  return /^https?:\/\//i.test(text.trim()) ? 'url' : 'address'
}

export async function startLookup(input: string): Promise<LookupJob> {
  const { data } = await http.post('/properties/lookup', { input })
  return data
}

export async function getLookupStatus(jobId: string): Promise<LookupJob> {
  const { data } = await http.get(`/properties/lookup/${jobId}`)
  return data
}

export async function suggestProperties(q: string): Promise<AddressSuggestion[]> {
  const { data } = await http.get('/properties/suggest', { params: { q } })
  return data
}

// ── Recent lookups (client-side history, like Analysimmo's "recent analyses") ──

const RECENT_KEY = 'plexa.recent_lookups'

export interface RecentLookup {
  id: string
  label: string          // address or a short URL label
  city?: string
  price?: number | null
  score?: number | null
  at: string             // ISO
}

export function loadRecentLookups(): RecentLookup[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentLookup[]
  } catch { return [] }
}

export function pushRecentLookup(entry: RecentLookup) {
  const list = loadRecentLookups().filter(e => e.id !== entry.id)
  list.unshift(entry)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)))
}

// ── Recent analyses (server-backed, per-user) with a localStorage fallback ─────
// Server is the source of truth (personalised, cross-device). When the backing
// table isn't there yet (e.g. locally, where the restricted DB role can't run
// the migration), the endpoints error and we transparently fall back to the
// browser's own history — so the feature works now and becomes truly server-side
// the moment the migration is applied on deploy. No frontend change needed then.

export interface RecentAnalysis {
  id: string
  full_address: string
  city?: string | null
  property_type?: string | null
  asking_price?: number | null
  score?: number | null
  cap_rate?: number | null
  monthly_cash_flow?: number | null
  photo?: string | null
  analyzed_at?: string | null
}

/** Record that the current user analyzed this property (best-effort server + local). */
export async function recordAnalysis(propertyId: string, label = '') {
  pushRecentLookup({ id: propertyId, label, at: new Date().toISOString() })
  try {
    await http.post(`/brokers/me/analyses/${propertyId}`)
  } catch {
    /* table not present yet (local) — localStorage above still holds it */
  }
}

export interface AnalysisUsage {
  count: number
  limit: number
  remaining: number
  reached: boolean
}

/** How many properties the user has analyzed vs the free limit (server, else local). */
export async function getAnalysisUsage(): Promise<AnalysisUsage> {
  try {
    const { data } = await http.get('/brokers/me/analyses/count')
    return data as AnalysisUsage
  } catch {
    const count = loadRecentLookups().length
    const limit = 10
    return { count, limit, remaining: Math.max(0, limit - count), reached: count >= limit }
  }
}

/** Remove a property from the user's recent analyses (server + local). */
export async function deleteAnalysis(propertyId: string) {
  const list = loadRecentLookups().filter(e => e.id !== propertyId)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  try {
    await http.delete(`/brokers/me/analyses/${propertyId}`)
  } catch {
    /* table not present yet (local) — localStorage above already dropped it */
  }
}

/** The user's recent analyses as dashboard cards — server first, else hydrate locally. */
export async function getRecentAnalyses(): Promise<RecentAnalysis[]> {
  try {
    const { data } = await http.get('/brokers/me/analyses')
    if (Array.isArray(data)) return data as RecentAnalysis[]
  } catch {
    /* fall through to the localStorage-hydrated fallback */
  }
  const local = loadRecentLookups().slice(0, 12)
  const cards = await Promise.all(local.map(async (r) => {
    try {
      const { data: p } = await http.get(`/properties/${r.id}`)
      return {
        id: p.id,
        full_address: p.full_address,
        city: p.city,
        property_type: p.property_type,
        asking_price: p.asking_price,
        score: p.score,
        cap_rate: p.cap_rate,
        monthly_cash_flow: p.monthly_cash_flow,
        photo: p.photos?.[0] ?? null,
        analyzed_at: r.at,
      } as RecentAnalysis
    } catch {
      return null
    }
  }))
  return cards.filter((c): c is RecentAnalysis => c != null)
}
