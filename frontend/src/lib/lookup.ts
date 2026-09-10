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
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)))
}
