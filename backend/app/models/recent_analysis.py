"""
BrokerRecentAnalysis — per-broker history of properties analyzed via the
on-demand "Analyze any property" bar. Powers the "My recent analyses" dashboard
section (Analysimmo-style cards).

One row per (broker, property): re-analyzing the same property bumps
`analyzed_at` rather than adding a duplicate. Deliberately carries NO foreign
keys — the app's `collaborator` DB role can't add REFERENCES to tables it
doesn't own (brokers/properties), so integrity is enforced in the app layer and
reads left-join defensively against deleted properties.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class BrokerRecentAnalysis(Base):
    __tablename__ = "broker_recent_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    broker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("broker_id", "property_id", name="uq_broker_recent_analysis"),
        Index("ix_broker_recent_analyses_broker_at", "broker_id", "analyzed_at"),
    )
