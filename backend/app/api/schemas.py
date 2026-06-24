"""
Pydantic v2 response schemas for the API.
ORM objects are converted here — GeoAlchemy2 geometry is excluded from responses.
"""
import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class ComparablePropertySchema(BaseModel):
    """One comparable property row shown in the Comparables tab."""
    id:             str
    mls_number:     Optional[str]
    full_address:   str
    city:           str
    asking_price:   Optional[float]
    sqft_total:     Optional[int]
    unit_count:     Optional[int]
    year_built:     Optional[int]
    property_type:  str
    cap_rate:       Optional[float]
    listing_url:    Optional[str]
    photos:         Optional[list[str]]


class CrossSitePrice(BaseModel):
    """Per-source price row for cross-site comparison."""
    model_config = ConfigDict(from_attributes=True)

    source:       str
    price:        Optional[float]
    source_url:   Optional[str]
    last_seen_at: datetime
    is_lowest:    bool

    agent_name:   Optional[str] = None
    agent_phone:  Optional[str] = None
    agent_email:  Optional[str] = None
    agency_name:  Optional[str] = None


class PropertyCard(BaseModel):
    """Compact property representation for list/dashboard views."""
    model_config = ConfigDict(from_attributes=True)

    id:             uuid.UUID
    mls_number:     Optional[str]
    full_address:   str
    city:           str
    neighborhood:   Optional[str]

    property_type:  str
    unit_count:     Optional[int]
    sqft_total:     Optional[int]
    year_built:     Optional[int]
    bedrooms_total: Optional[int]

    asking_price:    Optional[float]
    price_per_sqft:  Optional[float]

    score:              Optional[int]
    score_category:     Optional[str]
    discount_pct:       Optional[float]
    cap_rate:           Optional[float]
    monthly_cash_flow:  Optional[float]
    comparable_count:   Optional[int]
    analysis_confidence: Optional[str]

    photos:          Optional[list[str]]
    listing_url:     Optional[str]
    primary_source:  Optional[str]
    active_sources:  Optional[list[str]]

    status:          str
    days_on_market:  Optional[int]
    is_new:          bool

    first_seen_at:   datetime
    last_seen_at:    datetime

    multi_site_count:     Optional[int]   = None
    lowest_price_source:  Optional[str]   = None
    lowest_price:         Optional[float] = None

    @field_validator("property_type", mode="before")
    @classmethod
    def extract_enum_value(cls, v: Any) -> str:
        return v.value if hasattr(v, "value") else str(v)

    @field_validator("score_category", "status", "analysis_confidence", mode="before")
    @classmethod
    def extract_optional_enum(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return v.value if hasattr(v, "value") else str(v)

    @field_validator("photos", mode="before")
    @classmethod
    def first_photo_only(cls, v: Any) -> Optional[list[str]]:
        if not v:
            return []
        return v[:1]  # only first photo for list view


class PropertyDetail(BaseModel):
    """Full property data for the detail page."""
    model_config = ConfigDict(from_attributes=True)

    id:             uuid.UUID
    mls_number:     Optional[str]
    full_address:   str
    street_number:  Optional[str]
    street_name:    Optional[str]
    city:           str
    neighborhood:   Optional[str]
    postal_code:    Optional[str]
    province:       str

    property_type:   str
    unit_count:      Optional[int]
    sqft_total:      Optional[int]
    lot_sqft:        Optional[int]
    year_built:      Optional[int]
    floors:          Optional[int]
    bedrooms_total:  Optional[int]
    bathrooms_total: Optional[float]
    parking_spaces:  Optional[int]

    asking_price:    Optional[float]
    price_per_sqft:  Optional[float]
    price_history:   Optional[list]

    status:          str
    days_on_market:  Optional[int]
    listed_at:       Optional[datetime]

    active_sources:  Optional[list[str]]
    primary_source:  Optional[str]
    listing_url:     Optional[str]

    multi_site_count:     Optional[int]   = None
    lowest_price_source:  Optional[str]   = None
    lowest_price:         Optional[float] = None
    cross_site_prices:    Optional[list[CrossSitePrice]] = None

    agent_name:   Optional[str] = None
    agent_phone:  Optional[str] = None
    agent_email:  Optional[str] = None
    agency_name:  Optional[str] = None

    photos:          Optional[list[str]]
    description:     Optional[str]

    rental_income_monthly:  Optional[float]
    municipal_taxes_annual: Optional[float]
    school_taxes_annual:    Optional[float]
    condo_fees_monthly:     Optional[float]

    score:                   Optional[int]
    score_category:          Optional[str]
    comparable_count:        Optional[int]
    comparable_median_price: Optional[float]
    comparable_mean_price:   Optional[float]
    value_gap:               Optional[float]
    discount_pct:            Optional[float]
    cap_rate:                Optional[float]
    noi_annual:              Optional[float]
    grm:                     Optional[float]
    monthly_cash_flow:       Optional[float]
    cash_on_cash_return:     Optional[float]
    welcome_tax:             Optional[float]
    down_payment_20pct:      Optional[float]
    monthly_mortgage:        Optional[float]
    analysis_confidence:     Optional[str]

    ai_brief_en:     Optional[str]
    ai_brief_fr:     Optional[str]

    is_new:          bool
    is_flagged:      bool

    first_seen_at:   datetime
    last_seen_at:    datetime
    last_analyzed_at: Optional[datetime]

    @field_validator("property_type", mode="before")
    @classmethod
    def extract_enum_value(cls, v: Any) -> str:
        return v.value if hasattr(v, "value") else str(v)

    @field_validator("score_category", "status", "analysis_confidence", mode="before")
    @classmethod
    def extract_optional_enum(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return v.value if hasattr(v, "value") else str(v)


class PropertyListResponse(BaseModel):
    items:      list[PropertyCard]
    total:      int
    page:       int
    page_size:  int
    pages:      int


class StatsResponse(BaseModel):
    total_properties:      int
    new_today:             int
    strong_opportunities:  int   # score 80+
    worth_investigating:   int   # score 60-79
    market_price:          int   # score 40-59
    not_recommended:       int   # score < 40
    price_drops_today:     int
    avg_score:             Optional[float]
    cities:                list[str]
    multi_site_properties: int = 0


# ── Full Analysis schemas ─────────────────────────────────────────────────────

class RiskItemSchema(BaseModel):
    label:       str
    severity:    str   # "low" | "medium" | "high" | "critical"
    description: str
    mitigation:  str


class RiskAssessmentSchema(BaseModel):
    items:        list[RiskItemSchema]
    overall_risk: str


class YearSnapshotSchema(BaseModel):
    year:                 int
    property_value:       float
    monthly_rent:         float
    noi:                  float
    monthly_cash_flow:    float
    equity:               float
    cumulative_cash_flow: float


class FiveYearProjectionSchema(BaseModel):
    snapshots:         list[YearSnapshotSchema]
    total_return_pct:  Optional[float]
    annualized_return: Optional[float]


class RenovationScenarioSchema(BaseModel):
    label:                  str
    renovation_cost:        float
    rent_increase_per_unit: float
    new_monthly_rent:       Optional[float]
    new_noi:                Optional[float]
    new_cap_rate:           Optional[float]
    new_cash_flow:          Optional[float]
    payback_years:          Optional[float]
    roi_pct:                Optional[float]


class RenovationROISchema(BaseModel):
    scenarios: list[RenovationScenarioSchema]


class NeighbourhoodContextSchema(BaseModel):
    sample_size:              int
    city_avg_price:           Optional[float]
    city_avg_price_per_sqft:  Optional[float]
    city_avg_cap_rate:        Optional[float]
    city_avg_days_on_market:  Optional[float]
    city_avg_score:           Optional[float]
    price_vs_avg_pct:         Optional[float]
    cap_rate_vs_avg_pct:      Optional[float]
    score_vs_avg_pct:         Optional[float]
    price_percentile:         Optional[float]
    cap_rate_percentile:      Optional[float]
    score_percentile:         Optional[float]


class FinancialProfileSchema(BaseModel):
    comparable_count:         int
    comparable_median_price:  Optional[float]
    comparable_mean_price:    Optional[float]
    value_gap:                Optional[float]
    discount_pct:             Optional[float]
    analysis_confidence:      str
    search_radius_km:         Optional[float]
    gross_rent_monthly:       Optional[float]
    gross_rent_annual:        Optional[float]
    rent_is_estimated:        bool
    vacancy_loss_annual:      float
    municipal_taxes_annual:   float
    school_taxes_annual:      float
    insurance_annual:         float
    maintenance_annual:       float
    total_expenses_annual:    float
    noi_annual:               Optional[float]
    cap_rate:                 Optional[float]
    grm:                      Optional[float]
    monthly_cash_flow:        Optional[float]
    cash_on_cash_return:      Optional[float]
    asking_price:             Optional[float]
    down_payment:             Optional[float]
    loan_amount:              Optional[float]
    monthly_mortgage:         Optional[float]
    welcome_tax:              Optional[float]
    total_cash_needed:        Optional[float]


class ScoreResultSchema(BaseModel):
    total:      int
    category:   str
    components: dict[str, float]
    strategy:   str


class DataSourceSchema(BaseModel):
    name:      str
    url:       str
    publisher: str
    frequency: str
    verified:  str


class FullAnalysisResponse(BaseModel):
    property_id:   str
    full_address:  str
    financial:     FinancialProfileSchema
    score:         ScoreResultSchema
    risk:          RiskAssessmentSchema
    projection:    FiveYearProjectionSchema
    renovation:    RenovationROISchema
    neighbourhood: NeighbourhoodContextSchema
    ai_brief:      Optional[str]
    computed_at:   str
    sources:       list[DataSourceSchema]
