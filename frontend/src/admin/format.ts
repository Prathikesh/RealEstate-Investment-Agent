// Turns raw tracking data (route paths, filter dicts, timestamps) into copy
// a non-technical admin can read at a glance.
import type { ActivityEntry } from './api'

const PAGE_LABELS: Record<string, string> = {
  '/':           'Home',
  '/dashboard':  'Dashboard',
  '/properties': 'Browse Properties',
  '/watching':   'Saved Properties',
  '/saved':      'Saved Properties',
  '/alerts':     'Market Alerts',
  '/reports':    'Reports',
  '/compare':    'Compare Properties',
  '/searches':   'Saved Searches',
  '/settings':   'Settings',
  '/admin':      'Admin Dashboard',
}

export function friendlyPageName(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path]
  if (/^\/properties\/[0-9a-f-]+$/i.test(path)) return 'A property listing'
  if (/^\/analyze\/[0-9a-f-]+$/i.test(path)) return "A property's full analysis"

  const segment = path.replace(/^\//, '').split('/')[0]
  if (!segment) return 'Home'
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

const FILTER_LABELS: Record<string, (v: unknown) => string> = {
  city:          v => String(v),
  mls_number:    v => `MLS ${v}`,
  property_type: v => String(v).replace(/_/g, ' '),
  score_min:     v => `Score ${v}+`,
  score_max:     v => `Score under ${v}`,
  price_min:     v => `Over $${Number(v).toLocaleString()}`,
  price_max:     v => `Under $${Number(v).toLocaleString()}`,
  status:        v => String(v),
  multi_site:    () => 'Multiple listing sites',
  has_sqft:      () => 'Floor area known',
  listed_within: v => `Listed in last ${v}`,
}

/** e.g. "Montreal · Score 50+" or "Browsed all properties" for an empty filter set. */
export function friendlySearchSummary(filters: Record<string, unknown>): string {
  const parts = Object.keys(filters)
    .filter(k => FILTER_LABELS[k])
    .map(k => FILTER_LABELS[k](filters[k]))
  return parts.length ? parts.join(' · ') : 'Browsed all properties'
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Serializes rows to CSV and triggers a browser download — no backend round-trip. */
export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>): void {
  if (!rows.length) return

  const headers = Object.keys(rows[0])
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** One event -> one plain-English sentence, for the activity timeline/feed. */
export function describeEvent(entry: ActivityEntry): string {
  switch (entry.event_type) {
    case 'login':
      return 'Logged in'
    case 'page_view':
      return `Visited ${friendlyPageName(String(entry.payload.path ?? ''))}`
    case 'search':
      return `Searched: ${friendlySearchSummary(entry.payload)}`
    case 'property_view':
      return `Viewed ${entry.property_address || 'a property'}`
    case 'analysis_view':
      return `Ran financials on ${entry.property_address || 'a property'}`
    default:
      return entry.event_type
  }
}
