"""
Property verification log — one row per verification run per property.
Audit trail for app/agent/verifier.py: what was re-checked, what it found,
what (if anything) got corrected. Never updated; only inserted — mirrors
PropertySnapshot's audit-record pattern in app/models/snapshot.py.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.snapshot import ScraperSource


class VerificationOutcome(str, enum.Enum):
    VERIFIED_MATCH = "verified_match"    # live data matched what was stored
    CORRECTED      = "corrected"         # a field disagreed and was updated
    MANUAL_REVIEW  = "manual_review"     # stored/fetch1/fetch2 all disagreed — untouched
    FETCH_FAILED   = "fetch_failed"      # couldn't re-fetch the source page at all
    NO_CENTRIS_MATCH = "no_centris_match"  # Realtor-only property, no match found on Centris either
    DELISTED       = "delisted"          # source confirmed the listing is gone (sold/removed)


class PropertyVerificationLog(Base):
    __tablename__ = "property_verification_log"

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

    # Per-field detail, e.g.
    # {"municipal_taxes_annual": {"stored": None, "fetch1": 3481, "fetch2": 3481,
    #                              "match": false, "corrected": true}}
    fields_checked: Mapped[dict] = mapped_column(JSONB, nullable=False)

    outcome: Mapped[VerificationOutcome] = mapped_column(SAEnum(VerificationOutcome), index=True)

    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_verification_log_property_verified", "property_id", "verified_at"),
    )

    def __repr__(self) -> str:
        return f"<VerificationLog property={self.property_id} outcome={self.outcome} at={self.verified_at}>"
