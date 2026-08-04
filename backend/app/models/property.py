"""
Core property model. One row = one unique physical property in Quebec.
Deduplicated by MLS number (Centris/Realtor/Zolo share these) or address hash
(DuProprio has no MLS — hashed from normalized address + city).
"""
import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────


class PropertyType(str, enum.Enum):
    DUPLEX = "duplex"
    TRIPLEX = "triplex"
    QUADRUPLEX = "quadruplex"
    QUINTUPLEX_PLUS = "quintuplex_plus"
    SINGLE_FAMILY = "single_family"
    CONDO = "condo"
    TOWNHOUSE = "townhouse"


class PropertyStatus(str, enum.Enum):
    ACTIVE = "active"
    PRICE_CHANGED = "price_changed"
    SOLD = "sold"
    DELISTED = "delisted"
    EXPIRED = "expired"


class ScoreCategory(str, enum.Enum):
    STRONG_OPPORTUNITY = "strong_opportunity"   # 80-100
    WORTH_INVESTIGATING = "worth_investigating"  # 60-79
    MARKET_PRICE = "market_price"               # 40-59
    NOT_RECOMMENDED = "not_recommended"          # 0-39


class AnalysisConfidence(str, enum.Enum):
    HIGH = "high"    # 7+ comps within 5km
    MEDIUM = "medium"  # 3-6 comps
    LOW = "low"      # fewer than 3 comps


# ── Model ─────────────────────────────────────────────────────────────────────


class Property(Base):
    __tablename__ = "properties"

    # ── Primary Key ───────────────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ── Deduplication Keys ────────────────────────────────────────────────────
    mls_number: Mapped[Optional[str]] = mapped_column(
        String(50), unique=True, nullable=True, index=True
    )
    # SHA-256 of normalized(street_number + street_name + city) for DuProprio
    address_hash: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )

    # ── Location ──────────────────────────────────────────────────────────────
    full_address: Mapped[str] = mapped_column(String(500))
    street_number: Mapped[Optional[str]] = mapped_column(String(20))
    street_name: Mapped[Optional[str]] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100), index=True)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(150))
    postal_code: Mapped[Optional[str]] = mapped_column(String(10))
    province: Mapped[str] = mapped_column(String(2), default="QC")
    # PostGIS POINT (lng, lat) — used for broker radius queries and comp search
    # spatial_index=False: we define the GIST index explicitly in __table_args__
    location: Mapped[Optional[Any]] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True
    )

    # ── Property Details ──────────────────────────────────────────────────────
    property_type: Mapped[PropertyType] = mapped_column(SAEnum(PropertyType))
    unit_count: Mapped[Optional[int]] = mapped_column(Integer)
    bedrooms_total: Mapped[Optional[int]] = mapped_column(Integer)
    bathrooms_total: Mapped[Optional[float]] = mapped_column(Float)
    sqft_total: Mapped[Optional[int]] = mapped_column(Integer)
    lot_sqft: Mapped[Optional[int]] = mapped_column(Integer)
    year_built: Mapped[Optional[int]] = mapped_column(Integer)
    floors: Mapped[Optional[int]] = mapped_column(Integer)
    parking_spaces: Mapped[Optional[int]] = mapped_column(Integer)

    # ── Pricing ───────────────────────────────────────────────────────────────
    asking_price: Mapped[Optional[float]] = mapped_column(Float)
    price_per_sqft: Mapped[Optional[float]] = mapped_column(Float)
    # [{price, date, source, event: "listed"|"price_reduction"}]
    price_history: Mapped[Optional[list]] = mapped_column(JSONB, default=list)

    # ── Status & Timing ───────────────────────────────────────────────────────
    status: Mapped[PropertyStatus] = mapped_column(
        SAEnum(PropertyStatus), default=PropertyStatus.ACTIVE, index=True
    )
    days_on_market: Mapped[Optional[int]] = mapped_column(Integer)
    listed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # ── Source Tracking ───────────────────────────────────────────────────────
    # ["centris", "realtor", "zolo"] — updated as we detect presence/absence
    active_sources: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    primary_source: Mapped[Optional[str]] = mapped_column(String(50))
    listing_url: Mapped[Optional[str]] = mapped_column(String(1000))

    # ── Agent / Dealer Contact ─────────────────────────────────────────────────
    # Stored on Property for fast composite matching (no JOIN needed)
    # Filled on create; updated via _fill_gaps when blank
    agent_name:  Mapped[Optional[str]] = mapped_column(String(200))
    agent_phone: Mapped[Optional[str]] = mapped_column(String(50))
    agent_email: Mapped[Optional[str]] = mapped_column(String(200))
    agency_name: Mapped[Optional[str]] = mapped_column(String(200))

    # ── Media & Description ───────────────────────────────────────────────────
    photos: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # ── Quebec Rental / Expense Data ──────────────────────────────────────────
    # Populated when the listing includes rental info (most plexes do)
    rental_income_monthly: Mapped[Optional[float]] = mapped_column(Float)
    municipal_taxes_annual: Mapped[Optional[float]] = mapped_column(Float)
    school_taxes_annual: Mapped[Optional[float]] = mapped_column(Float)
    condo_fees_monthly: Mapped[Optional[float]] = mapped_column(Float)
    # Évaluation foncière — city's assessed value (≠ market price, triennial roll)
    # When present, used instead of asking_price for tax estimation → much more accurate
    evaluation_fonciere: Mapped[Optional[float]] = mapped_column(Float)
    # Raw dump of all expense fields from listing — source of truth for recalculation
    raw_expenses: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    # ── Processing Flags ──────────────────────────────────────────────────────
    is_new: Mapped[bool] = mapped_column(Boolean, default=True)
    needs_reanalysis: Mapped[bool] = mapped_column(Boolean, default=True)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Timestamps ────────────────────────────────────────────────────────────
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # ── AI Analysis Results ───────────────────────────────────────────────────
    score: Mapped[Optional[int]] = mapped_column(Integer)
    score_category: Mapped[Optional[ScoreCategory]] = mapped_column(SAEnum(ScoreCategory))

    # Comparable data
    comparable_count: Mapped[Optional[int]] = mapped_column(Integer)
    comparable_median_price: Mapped[Optional[float]] = mapped_column(Float)
    comparable_mean_price: Mapped[Optional[float]] = mapped_column(Float)
    comparable_ids: Mapped[Optional[list]] = mapped_column(JSONB)
    # Positive = below market (a discount); negative = above market (overpriced)
    value_gap: Mapped[Optional[float]] = mapped_column(Float)
    discount_pct: Mapped[Optional[float]] = mapped_column(Float)

    # Financial metrics
    cap_rate: Mapped[Optional[float]] = mapped_column(Float)
    noi_annual: Mapped[Optional[float]] = mapped_column(Float)
    grm: Mapped[Optional[float]] = mapped_column(Float)
    monthly_cash_flow: Mapped[Optional[float]] = mapped_column(Float)
    cash_on_cash_return: Mapped[Optional[float]] = mapped_column(Float)

    # Quebec acquisition costs
    welcome_tax: Mapped[Optional[float]] = mapped_column(Float)
    down_payment_20pct: Mapped[Optional[float]] = mapped_column(Float)
    monthly_mortgage: Mapped[Optional[float]] = mapped_column(Float)

    # AI brief (generated by Claude)
    ai_brief_fr: Mapped[Optional[str]] = mapped_column(Text)
    ai_brief_en: Mapped[Optional[str]] = mapped_column(Text)
    analysis_confidence: Mapped[Optional[AnalysisConfidence]] = mapped_column(
        SAEnum(AnalysisConfidence)
    )
    last_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Zoning / development potential — matched by point-in-polygon against
    # zoning_zones.geometry. FK rather than a denormalized copy so rule
    # updates in zoning_zones (re-sync) are reflected without re-matching.
    zoning_zone_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zoning_zones.id", ondelete="SET NULL"), nullable=True
    )
    zoning_matched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Pre-computed "rebuild to zoning max" scenario — see agent/rebuild_economics.py.
    # Cached like every other pipeline output; never computed live per request.
    rebuild_economics: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Matched from the official assessment roll (rôle d'évaluation foncière) —
    # authoritative lot area + current dwelling count. {lot_area_m2, num_dwellings,
    # frontage_m, year_built, roll_year, source_url}. Null = no roll match found.
    assessment_data: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Development deal-killer overlays the property falls inside (agricultural,
    # flood, heritage) — [{type, name, source_url}]. Empty/null = none found.
    development_constraints: Mapped[Optional[list]] = mapped_column(JSONB)

    # Cap rate vs. the Colliers Cap Rate Report's institutional multifamily band
    # for this city — see agent/market_benchmark.py. Informational only; null
    # for property types/cities the report doesn't cover.
    market_benchmark: Mapped[Optional[dict]] = mapped_column(JSONB)

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    snapshots: Mapped[list["PropertySnapshot"]] = relationship(  # noqa: F821
        back_populates="property", cascade="all, delete-orphan", lazy="select"
    )
    sources: Mapped[list["PropertySource"]] = relationship(  # noqa: F821
        back_populates="property", cascade="all, delete-orphan", lazy="select"
    )
    zoning_zone: Mapped[Optional["ZoningZone"]] = relationship(  # noqa: F821
        lazy="select"
    )

    # ── Composite Indexes ─────────────────────────────────────────────────────
    __table_args__ = (
        Index("idx_properties_location", "location", postgresql_using="gist"),
        Index("ix_properties_city_score", "city", "score"),
        Index("ix_properties_type_status", "property_type", "status"),
        Index("ix_properties_score_status", "score", "status"),
        Index("ix_properties_needs_reanalysis", "needs_reanalysis"),
    )

    def __repr__(self) -> str:
        return f"<Property {self.full_address} score={self.score}>"


def compute_days_on_market(prop: "Property") -> Optional[int]:
    """
    Days the listing has been on the market, computed LIVE (it grows by 1 each
    day, so it must never be stored as a static number).

    Date source, in priority order:
      1. listed_at            — an explicit listing date if a scraper set one
      2. price_history "listed" event date — the date shown on the property's
         price-history timeline (this is what users cross-reference against)
      3. first_seen_at        — when we first scraped it (always present)

    NOTE on accuracy: Centris deliberately hides the true original listing date
    from public pages, so for most Centris listings there is no source date to
    scrape — this value is then "days since the listing first appeared in our
    price history," which is exactly the date shown on the platform. It stays
    consistent with the price-history timeline rather than pretending to be an
    official Centris date that doesn't exist.
    """
    from datetime import datetime, timezone

    listed: Optional[datetime] = prop.listed_at

    if listed is None and prop.price_history:
        for event in prop.price_history:
            if isinstance(event, dict) and event.get("event") == "listed" and event.get("date"):
                try:
                    listed = datetime.fromisoformat(str(event["date"]))
                except (ValueError, TypeError):
                    listed = None
                break

    if listed is None:
        listed = prop.first_seen_at

    if listed is None:
        return None

    if listed.tzinfo is None:
        listed = listed.replace(tzinfo=timezone.utc)

    return max(0, (datetime.now(timezone.utc) - listed).days)
