"""
Property snapshot — one row per scrape per property per source.
Full audit trail: what data came from where and when. Never updated; only inserted.
"""
import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class ScraperSource(str, enum.Enum):
    CENTRIS = "centris"
    REALTOR = "realtor"
    REMAX = "remax"
    DUPROPRIO = "duproprio"
    ROYALLEPAGE = "royallepage"
    ZOLO = "zolo"
    ZOOCASA = "zoocasa"
    HOUSESIGMA = "housesigma"


class PropertySnapshot(Base):
    __tablename__ = "property_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[ScraperSource] = mapped_column(SAEnum(ScraperSource), index=True)

    # Raw HTML parse results — everything extracted from the page at that moment
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Key fields at the time of this scrape (denormalized for quick change detection)
    price_at_scrape: Mapped[Optional[float]] = mapped_column(Float)
    status_at_scrape: Mapped[Optional[str]] = mapped_column(String(50))

    # What changed vs the previous snapshot for this property+source combo
    # e.g. {"price": {"old": 1400000, "new": 1285000}, "status": {"old": "active", "new": "price_changed"}}
    changes_detected: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Whether this snapshot triggered a re-run of the AI pipeline
    triggered_reanalysis: Mapped[bool] = mapped_column(Boolean, default=False)

    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    property: Mapped["Property"] = relationship(back_populates="snapshots")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<Snapshot property={self.property_id} "
            f"source={self.source} at={self.scraped_at}>"
        )
