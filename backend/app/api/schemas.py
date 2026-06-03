"""
Pydantic v2 response schemas for the API.
ORM objects are converted here — GeoAlchemy2 geometry is excluded from responses.
"""
import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator


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
    price_drops_today:     int
    avg_score:             Optional[float]
    cities:                list[str]
