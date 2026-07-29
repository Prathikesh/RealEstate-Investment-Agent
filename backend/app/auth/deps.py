"""
Auth dependencies — resolve the current user from the access-token cookie,
and gate admin-only routes.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.auth.security import decode_access_token
from app.models.broker import Broker, UserRole

ACCESS_COOKIE_NAME = "access_token"

# How stale last_active_at must be before we bother writing it again —
# turns "touch on every request" into ~1 write/minute/active user instead
# of one per request.
_ACTIVITY_TOUCH_INTERVAL = timedelta(minutes=1)


async def _resolve_user(access_token: Optional[str], db: AsyncSession) -> Optional[Broker]:
    if not access_token:
        return None
    payload = decode_access_token(access_token)
    if not payload:
        return None
    user = await db.get(Broker, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        return None

    now = datetime.now(timezone.utc)
    if not user.last_active_at or now - user.last_active_at > _ACTIVITY_TOUCH_INTERVAL:
        user.last_active_at = now

    return user


async def get_current_user(
    access_token: str | None = Cookie(default=None, alias=ACCESS_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> Broker:
    user = await _resolve_user(access_token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


async def get_current_user_optional(
    access_token: str | None = Cookie(default=None, alias=ACCESS_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> Optional[Broker]:
    """Like get_current_user, but returns None instead of raising — for routes
    that stay public but still attribute activity to a user when one is logged in."""
    return await _resolve_user(access_token, db)


async def require_admin(user: Broker = Depends(get_current_user)) -> Broker:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
