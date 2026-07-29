"""
log_event() — best-effort activity logging.

Runs in a SAVEPOINT so a failure here (bad payload, transient DB hiccup)
rolls back only the event insert, never the request it's attached to.
Learned the hard way: without this, a missing user_events table 500'd a
real property-detail request instead of just silently dropping one event.
"""
import logging
import uuid
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.models import EventType, UserEvent

logger = logging.getLogger(__name__)


async def log_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    event_type: EventType,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    # Flush whatever the caller already staged (e.g. a new refresh token, a
    # last_active_at touch) BEFORE opening the savepoint below, so a failure
    # here can only roll back the event row we're about to add — never work
    # the caller did prior to calling us.
    await db.flush()

    try:
        async with db.begin_nested():
            db.add(UserEvent(user_id=user_id, event_type=event_type, payload=payload or {}))
            await db.flush()
    except Exception:
        logger.warning("Failed to log %s event for user %s", event_type.value, user_id, exc_info=True)
