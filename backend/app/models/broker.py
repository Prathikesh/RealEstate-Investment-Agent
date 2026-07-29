"""
Broker — a subscriber to the platform. Authenticates via email/password
and/or Google OAuth (app.auth). Preferences drive which properties they
see and how they're alerted.
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
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class InvestmentStrategy(str, enum.Enum):
    BUY_AND_HOLD = "buy_and_hold"
    BUY_FIX_SELL = "buy_fix_sell"
    BOTH = "both"


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class Language(str, enum.Enum):
    FR = "fr"
    EN = "en"


class Broker(Base):
    __tablename__ = "brokers"

    # ── Identity ──────────────────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Nullable: an account may sign in with Google, a password, or both.
    google_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(200))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ── Location Preferences ──────────────────────────────────────────────────
    # PostGIS POINT — center of the broker's monitoring zone
    # spatial_index=False: we define the GIST index explicitly in __table_args__
    location_center: Mapped[Optional[Any]] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True
    )
    location_radius_km: Mapped[int] = mapped_column(Integer, default=25)
    location_city: Mapped[Optional[str]] = mapped_column(String(100))

    # ── Property Filters ──────────────────────────────────────────────────────
    # e.g. ["duplex", "triplex", "quadruplex"]
    property_types: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    price_min: Mapped[Optional[float]] = mapped_column(Float)
    price_max: Mapped[Optional[float]] = mapped_column(Float)
    min_units: Mapped[Optional[int]] = mapped_column(Integer)

    # ── Investment Strategy ───────────────────────────────────────────────────
    # Controls which score weights are applied when calculating the broker's
    # personalized opportunity score
    investment_strategy: Mapped[InvestmentStrategy] = mapped_column(
        SAEnum(InvestmentStrategy), default=InvestmentStrategy.BOTH
    )

    # ── Notification Preferences ──────────────────────────────────────────────
    email_alerts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Only alert when score >= this threshold (40-90)
    min_score_for_alert: Mapped[int] = mapped_column(Integer, default=60)
    language: Mapped[Language] = mapped_column(SAEnum(Language), default=Language.FR)

    # ── Watched Properties ────────────────────────────────────────────────────
    # List of property UUIDs the broker is monitoring for price drops
    watched_property_ids: Mapped[Optional[list]] = mapped_column(JSONB, default=list)

    # ── Account State ─────────────────────────────────────────────────────────
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.USER, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    invited_by: Mapped[Optional[str]] = mapped_column(String(255))

    # ── Timestamps ────────────────────────────────────────────────────────────
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_brokers_location_center", "location_center", postgresql_using="gist"),
    )

    def __repr__(self) -> str:
        return f"<Broker {self.email} strategy={self.investment_strategy}>"
