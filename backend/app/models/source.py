"""
Property source — one row per (property, website) combination.
Tracks presence, URL, quality, and activity per source independently.
UNIQUE constraint on (property_id, source) — use upsert, never duplicate.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.snapshot import ScraperSource  # reuse the enum


class PropertySource(Base):
    __tablename__ = "property_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[ScraperSource] = mapped_column(SAEnum(ScraperSource), nullable=False)

    # The listing URL on this specific site
    source_url: Mapped[Optional[str]] = mapped_column(String(1000))
    # The ID used by this site (e.g. MLS for Centris, DuProprio listing ID)
    source_listing_id: Mapped[Optional[str]] = mapped_column(String(100))

    # Presence flag — set False when the property disappears from this source
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Most recent price seen on this source
    last_price: Mapped[Optional[float]] = mapped_column(Float)

    # Data quality flags — what fields this source actually provides
    has_price: Mapped[bool] = mapped_column(Boolean, default=False)
    has_rental_income: Mapped[bool] = mapped_column(Boolean, default=False)
    has_expenses: Mapped[bool] = mapped_column(Boolean, default=False)
    has_photos: Mapped[bool] = mapped_column(Boolean, default=False)
    has_sqft: Mapped[bool] = mapped_column(Boolean, default=False)
    has_year_built: Mapped[bool] = mapped_column(Boolean, default=False)

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    property: Mapped["Property"] = relationship(back_populates="sources")  # noqa: F821

    # ── Constraints ───────────────────────────────────────────────────────────
    __table_args__ = (
        UniqueConstraint("property_id", "source", name="uq_property_source"),
    )

    def __repr__(self) -> str:
        return (
            f"<PropertySource property={self.property_id} "
            f"source={self.source} active={self.is_active}>"
        )
