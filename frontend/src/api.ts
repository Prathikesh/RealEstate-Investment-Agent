import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const http = axios.create({ baseURL: API_BASE })

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrossSitePrice {
  source:       string
  price:        number | null
  source_url:   string | null
  last_seen_at: string
  is_lowest:    boolean
  agent_name:   string | null
  agent_phone:  string | null
  agent_email:  string | null
  agency_name:  string | null
}

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
  bathrooms_total?: number | null  // only sent by the detail endpoint
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
  multi_site_count:    number | null
  lowest_price_source: string | null
  lowest_price:        number | null
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
  cross_site_prices: CrossSitePrice[] | null
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
  market_price: number
  not_recommended: number
  price_drops_today: number
  avg_score: number | null
  cities: string[]
  multi_site_properties: number
}

export interface PropertyFilters {
  city?: string
  mls_number?: string
  property_type?: string
  score_min?: number
  score_max?: number
  price_min?: number
  price_max?: number
  status?: string
  sort_by?: 'score' | 'price' | 'newest' | 'discount' | 'price_asc' | 'price_desc'
  listed_within?: '24h' | '48h' | '7d' | '30d'
  page?: number
  page_size?: number
  multi_site?: boolean
  has_sqft?: boolean
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

// ── Full Analysis Types ────────────────────────────────────────────────────────

export interface RiskItem {
  label:       string
  severity:    'low' | 'medium' | 'high' | 'critical'
  description: string
  mitigation:  string
}

export interface RiskAssessment {
  items:        RiskItem[]
  overall_risk: 'low' | 'medium' | 'high' | 'critical'
}

export interface YearSnapshot {
  year:                 number
  property_value:       number
  monthly_rent:         number
  noi:                  number
  monthly_cash_flow:    number
  equity:               number
  cumulative_cash_flow: number
}

export interface FiveYearProjection {
  snapshots:         YearSnapshot[]
  total_return_pct:  number | null
  annualized_return: number | null
}

export interface RenovationScenario {
  label:                  string
  renovation_cost:        number
  rent_increase_per_unit: number
  new_monthly_rent:       number | null
  new_noi:                number | null
  new_cap_rate:           number | null
  new_cash_flow:          number | null
  payback_years:          number | null
  roi_pct:                number | null
}

export interface RenovationROI {
  scenarios: RenovationScenario[]
}

export interface NeighbourhoodContext {
  sample_size:              number
  city_avg_price:           number | null
  city_avg_price_per_sqft:  number | null
  city_avg_cap_rate:        number | null
  city_avg_days_on_market:  number | null
  city_avg_score:           number | null
  price_vs_avg_pct:         number | null
  cap_rate_vs_avg_pct:      number | null
  score_vs_avg_pct:         number | null
  price_percentile:         number | null
  cap_rate_percentile:      number | null
  score_percentile:         number | null
}

export interface FinancialProfile {
  comparable_count:        number
  comparable_median_price: number | null
  comparable_mean_price:   number | null
  value_gap:               number | null
  discount_pct:            number | null
  analysis_confidence:     string
  search_radius_km:        number | null
  gross_rent_monthly:      number | null
  gross_rent_annual:       number | null
  rent_is_estimated:       boolean
  vacancy_loss_annual:     number
  municipal_taxes_annual:  number
  school_taxes_annual:     number
  insurance_annual:        number
  maintenance_annual:      number
  total_expenses_annual:   number
  noi_annual:              number | null
  cap_rate:                number | null
  grm:                     number | null
  monthly_cash_flow:       number | null
  cash_on_cash_return:     number | null
  asking_price:            number | null
  down_payment:            number | null
  loan_amount:             number | null
  monthly_mortgage:        number | null
  welcome_tax:             number | null
  total_cash_needed:       number | null
}

export interface ScoreResult {
  total:      number
  category:   string
  components: Record<string, number>
  strategy:   string
}

export interface DataSource {
  name:      string
  url:       string
  publisher: string
  frequency: string
  verified:  string
}

export interface FullAnalysisResponse {
  property_id:   string
  full_address:  string
  financial:     FinancialProfile
  score:         ScoreResult
  risk:          RiskAssessment
  projection:    FiveYearProjection
  renovation:    RenovationROI
  neighbourhood: NeighbourhoodContext
  ai_brief:      string | null
  computed_at:   string
  sources:       DataSource[]
}

export async function fetchFullAnalysis(id: string): Promise<FullAnalysisResponse> {
  const { data } = await http.get<FullAnalysisResponse>(`/properties/${id}/full-analysis`)
  return data
}

export interface MapProperty {
  id:             string
  full_address:   string
  city:           string
  asking_price:   number | null
  score:          number | null
  score_category: string | null
  photo:          string | null
  lat:            number
  lng:            number
}

export async function fetchMapProperties(): Promise<MapProperty[]> {
  const { data } = await http.get<MapProperty[]>('/properties/map')
  return data
}
