import axios from 'axios'
import type { ScoreComponents, ScoreWeights } from './lib/verdict'

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

// withCredentials: auth cookies (httpOnly access/refresh tokens) are
// cross-origin in production (separate Railway subdomains for API/frontend),
// so they must be explicitly opted into on every request.
export const http = axios.create({ baseURL: API_BASE, withCredentials: true })

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
  listing_type: string  // "for_sale" | "for_rent"
  unit_count: number | null
  sqft_total: number | null
  year_built: number | null
  bedrooms_total: number | null
  bathrooms_total?: number | null  // only sent by the detail endpoint
  asking_price: number | null
  price_per_sqft: number | null
  score: number | null
  score_category: string | null
  // Your Verdict — the logged-in broker's personalized score for this property,
  // computed server-side. null for anonymous requests or un-scored (legacy) rows.
  your_score?: number | null
  your_score_category?: string | null
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
  // True when days_on_market is a real source list date, not days-since-scraped.
  days_on_market_is_real?: boolean
  is_new: boolean
  first_seen_at: string
  last_seen_at: string
  multi_site_count:    number | null
  lowest_price_source: string | null
  lowest_price:        number | null

  zoning_max_units: number | null
  zoning_upside:    boolean | null

  flood_zone: boolean | null
}

export interface ZoningInfo {
  zone_code:        string
  city:              string
  type_milieu:       string | null
  allowed_uses:      string[] | null
  bylaw_reference:   string | null
  confidence:        string
  data_version:      string | null
  matched_at:        string | null
  max_units:          number | null
  is_open_ended:       boolean | null
  contigu_permitted:   boolean | null
  decode_table_page:   number | null
  permitted_tiers:     Record<string, string[]> | null
  source_document_url: string | null
  estimated_max_units: number | null
  estimate_method:     string | null   // use_permission | envelope | non_residential | density_target
  max_coverage_pct:    number | null
  max_storeys:         number | null
  estimate_lot_m2:     number | null
  estimate_lot_source: string | null   // assessment_roll | listing

  // Montréal master-plan layer (PUM 2050) — planning-grade, not a per-lot permit
  affectation:         string | null   // Résidentiel | Mixte | Conservation | …
  intensification:     string | null   // Douce | Intermédiaire | Élevée
  min_density_per_ha:  number | null   // min. average net density target (log/ha)
  plan_name:           string | null
}

export interface MarketBenchmarkInfo {
  city_key:           string
  building_grade:     string
  band_low:           number
  band_high:          number
  property_cap_rate:  number
  position:           'above' | 'within' | 'below'
  source_label:       string
  source_quarter:     string
  caveat:             string
}

export interface RebuildEconomicsInfo {
  current_units:                  number
  target_units:                   number
  additional_units:               number
  estimated_new_floor_area_sqft:  number
  demolition_cost:                number
  hard_construction_cost:         number
  soft_costs:                     number
  contingency:                    number
  financing_carry_cost:           number
  total_rebuild_cost:             number
  total_investment:               number
  projected_new_noi_annual:       number | null
  projected_new_value:            number | null
  net_upside:                     number | null
  is_open_ended_target:           boolean
  confidence:                     string
}

export interface ConstraintFlag {
  type:        string   // agricultural | flood | heritage
  name:        string | null
  explanation: string | null
  source_url:  string | null
}

export interface AssessmentInfo {
  lot_area_m2:   number | null
  num_dwellings: number | null
  frontage_m:    number | null
  year_built:    number | null
  roll_year:     string | null
  source_url:    string | null
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
  zoning: ZoningInfo | null
  rebuild_economics: RebuildEconomicsInfo | null
  market_benchmark: MarketBenchmarkInfo | null
  assessment: AssessmentInfo | null
  constraints: ConstraintFlag[] | null

  // Per-factor 0-100 breakdown behind `score` and the weights used to combine
  // them (both from the backend). Null on properties analyzed before this
  // feature shipped — the UI falls back gracefully. See lib/verdict.ts.
  score_components: ScoreComponents | null
  ai_weights: ScoreWeights | null
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
  address?: string
  mls_number?: string
  property_type?: string
  listing_type?: string
  score_min?: number
  score_max?: number
  price_min?: number
  price_max?: number
  cap_rate_min?: number
  cash_flow_min?: number
  discount_min?: number
  days_on_market_min?: number
  grm_max?: number
  price_drop_min?: number
  price_drop_pct_min?: number
  your_score_min?: number
  status?: string
  sort_by?: 'score' | 'your_verdict' | 'price' | 'newest' | 'discount' | 'price_asc' | 'price_desc' | 'days_listed'
  listed_within?: '24h' | '48h' | '7d' | '30d'
  page?: number
  page_size?: number
  multi_site?: boolean
  has_sqft?: boolean
  flood_zone?: boolean
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchProperties(filters: PropertyFilters): Promise<PropertyListResponse> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== 0)
  )
  const { data } = await http.get<PropertyListResponse>('/properties', { params })
  return data
}

export interface PropertySuggestion {
  id: string
  full_address: string
  city: string | null
  asking_price: number | null
  score: number | null
}

export async function fetchPropertySuggestions(q: string, limit = 8): Promise<PropertySuggestion[]> {
  const { data } = await http.get<PropertySuggestion[]>('/properties/suggest', { params: { q, limit } })
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

export interface ZoningBoundary {
  zone_code:       string
  zone_geometry:   GeoJSON.Geometry
  property_point:  { type: string; coordinates: [number, number] } | null
}

export async function fetchZoningBoundary(id: string): Promise<ZoningBoundary> {
  const { data } = await http.get<ZoningBoundary>(`/properties/${id}/zoning/boundary`)
  return data
}

export interface FloodBoundary {
  zone_geometry:   GeoJSON.Geometry  // GeometryCollection — a property can span multiple grid cells
  property_point:  { type: string; coordinates: [number, number] } | null
}

export async function fetchFloodBoundary(id: string): Promise<FloodBoundary> {
  const { data } = await http.get<FloodBoundary>(`/properties/${id}/flood/boundary`)
  return data
}
