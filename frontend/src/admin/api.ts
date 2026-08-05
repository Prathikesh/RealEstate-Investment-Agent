import { http } from '../api'

export type Engagement = 'hot_lead' | 'warm' | 'exploring' | 'cold'

export interface UserSummary {
  id: string
  email: string
  name: string | null
  role: 'user' | 'admin'
  is_active: boolean
  created_at: string
  last_login_at: string | null
  last_active_at: string | null
  is_online: boolean
  properties_viewed: number
  properties_analyzed: number
  top_page: string | null
  engagement: Engagement
}

export interface PageViewSummary {
  path: string
  view_count: number
}

export interface PropertyViewSummary {
  property_id: string
  full_address: string | null
  city: string | null
  score: number | null
  view_count: number
}

export interface SearchLogEntry {
  filters: Record<string, unknown>
  created_at: string
}

export interface ActivityEntry {
  event_type: 'login' | 'page_view' | 'search' | 'property_view' | 'analysis_view'
  payload: Record<string, unknown>
  property_address: string | null
  created_at: string
  user_name: string | null
  user_email: string | null
}

export interface UserDetail {
  id: string
  email: string
  name: string | null
  role: 'user' | 'admin'
  created_at: string
  last_login_at: string | null
  last_active_at: string | null
  is_online: boolean
  top_pages: PageViewSummary[]
  viewed_properties: PropertyViewSummary[]
  analyzed_properties: PropertyViewSummary[]
  recent_searches: SearchLogEntry[]
  recent_activity: ActivityEntry[]
}

export interface ActiveUserSummary {
  id: string
  email: string
  name: string | null
  event_count: number
}

export interface RankedLabel {
  label: string
  count: number
}

export interface EngagementBreakdown {
  hot_lead: number
  warm: number
  exploring: number
  cold: number
}

export interface SignupTrendPoint {
  date: string
  count: number
}

export interface PreferenceInsights {
  top_cities: RankedLabel[]
  budget_bands: RankedLabel[]
  property_types: RankedLabel[]
}

export interface AdminOverview {
  total_users: number
  online_now: number
  signups_this_week: number
  signups_last_week: number
  most_active_users: ActiveUserSummary[]
  most_viewed_properties: PropertyViewSummary[]
  most_analyzed_properties: PropertyViewSummary[]
  top_pages: PageViewSummary[]
  engagement: EngagementBreakdown
  preferences: PreferenceInsights
  top_search_cities: RankedLabel[]
  top_search_types: RankedLabel[]
  signup_trend: SignupTrendPoint[]
}

export async function fetchAdminUsers(): Promise<UserSummary[]> {
  const { data } = await http.get<UserSummary[]>('/admin/users')
  return data
}

export async function fetchAdminUserDetail(id: string): Promise<UserDetail> {
  const { data } = await http.get<UserDetail>(`/admin/users/${id}`)
  return data
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { data } = await http.get<AdminOverview>('/admin/analytics/overview')
  return data
}

export async function fetchActivityFeed(limit = 20): Promise<ActivityEntry[]> {
  const { data } = await http.get<ActivityEntry[]>('/admin/analytics/activity-feed', { params: { limit } })
  return data
}

export async function updateUserStatus(id: string, is_active: boolean): Promise<UserSummary> {
  const { data } = await http.patch<UserSummary>(`/admin/users/${id}/status`, { is_active })
  return data
}

// ── Invite codes ──────────────────────────────────────────────────────────────

export interface InviteCode {
  id: string
  code: string
  label: string | null
  is_active: boolean
  used_at: string | null
  used_by_email: string | null
  used_by_method: string | null
  created_at: string
}

export async function fetchInviteCodes(): Promise<InviteCode[]> {
  const { data } = await http.get<InviteCode[]>('/admin/invite-codes')
  return data
}

export async function createInviteCodes(payload: { label?: string; count?: number }): Promise<InviteCode[]> {
  const { data } = await http.post<InviteCode[]>('/admin/invite-codes', payload)
  return data
}

export async function revokeInviteCode(id: string): Promise<InviteCode> {
  const { data } = await http.patch<InviteCode>(`/admin/invite-codes/${id}/revoke`, {})
  return data
}
