import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PropertyCard {
  id: string
  mls_number: string | null
  full_address: string
  city: string
  neighborhood: string | null
  property_type: string
  unit_count: number | null
  sqft_total: number | null
  year_built: number | null
  bedrooms_total: number | null
  asking_price: number | null
  price_per_sqft: number | null
  score: number | null
  score_category: string | null
  discount_pct: number | null
  cap_rate: number | null
  monthly_cash_flow: number | null
  comparable_count: number | null
  analysis_confidence: string | null
  photos: string[]
  listing_url: string | null
  primary_source: string | null
  active_sources: string[] | null
  status: string
  days_on_market: number | null
  is_new: boolean
  first_seen_at: string
  last_seen_at: string
}

export interface PropertyDetail extends PropertyCard {
  street_number: string | null
  street_name: string | null
  postal_code: string | null
  province: string

  lot_sqft: number | null
  floors: number | null
  bathrooms_total: number | null
  parking_spaces: number | null

  price_history: Array<{ price: number; date: string; event: string }> | null
  status: string
  listed_at: string | null
  description: string | null

  rental_income_monthly: number | null
  municipal_taxes_annual: number | null
  school_taxes_annual: number | null
  condo_fees_monthly: number | null

  comparable_median_price: number | null
  comparable_mean_price: number | null
  value_gap: number | null
  noi_annual: number | null
  grm: number | null
  cash_on_cash_return: number | null
  welcome_tax: number | null
  down_payment_20pct: number | null
  monthly_mortgage: number | null

  ai_brief_en: string | null
  ai_brief_fr: string | null

  is_flagged: boolean
  last_analyzed_at: string | null
}

export interface PropertyListResponse {
  items: PropertyCard[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface StatsResponse {
  total_properties: number
  new_today: number
  strong_opportunities: number
  worth_investigating: number
  price_drops_today: number
  avg_score: number | null
  cities: string[]
}

export interface PropertyFilters {
  city?: string
  property_type?: string
  score_min?: number
  score_max?: number
  price_min?: number
  price_max?: number
  status?: string
  sort_by?: 'score' | 'price' | 'newest' | 'discount'
  page?: number
  page_size?: number
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchProperties(filters: PropertyFilters): Promise<PropertyListResponse> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== 0)
  )
  const { data } = await http.get<PropertyListResponse>('/properties', { params })
  return data
}

export async function fetchStats(): Promise<StatsResponse> {
  const { data } = await http.get<StatsResponse>('/properties/stats')
  return data
}

export async function fetchProperty(id: string): Promise<PropertyDetail> {
  const { data } = await http.get<PropertyDetail>(`/properties/${id}`)
  return data
}
