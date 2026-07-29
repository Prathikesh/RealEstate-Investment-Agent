"""
UserEvent — first-party activity log. Powers the admin dashboard's "who's
active / what they use / what they search" views without depending on a
third-party analytics service.
"""
import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class EventType(str, enum.Enum):
    LOGIN = "login"
    PAGE_VIEW = "page_view"
    SEARCH = "search"
    PROPERTY_VIEW = "property_view"
    ANALYSIS_VIEW = "analysis_view"  # ran the full financial analysis on a property


class UserEvent(Base):
    __tablename__ = "user_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("brokers.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[EventType] = mapped_column(SAEnum(EventType), nullable=False)
    # Shape depends on event_type: page_view -> {"path"}, search -> filters used,
    # property_view -> {"property_id"}. Named `payload`, not `metadata` — the
    # latter would shadow SQLAlchemy's Base.metadata on the model class.
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_user_events_user_id_created_at", "user_id", "created_at"),
        Index("ix_user_events_event_type_created_at", "event_type", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<UserEvent user_id={self.user_id} type={self.event_type}>"
