"""
Invite-code helpers — validation, consumption, and generation.

Registration is invite-only (see settings.require_invite_code). A code is usable
when it exists, is_active, and has not been used. It's consumed atomically as part
of creating the account so it can't be reused.
"""
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.invite import InviteCode

# Unambiguous alphabet (no 0/O/1/I/L) for human-readable, easy-to-share codes.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_code() -> str:
    """A grouped code like 'PLX-7K9M-3XQ2' — distinctive and easy to read aloud."""
    body = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"PLX-{body[:4]}-{body[4:]}"


async def validate_code(db: AsyncSession, code: Optional[str]) -> Optional[InviteCode]:
    """
    Return the usable InviteCode for `code`, or raise 400.

    When registration gating is disabled (settings.require_invite_code = False),
    returns None and skips validation entirely.
    """
    if not settings.require_invite_code:
        return None

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or already-used invite code",
    )
    if not code or not code.strip():
        raise invalid

    obj = await db.scalar(select(InviteCode).where(InviteCode.code == code.strip()))
    if obj is None or not obj.is_usable:
        raise invalid
    return obj


def consume_code(code_obj: Optional[InviteCode], email: str, method: str) -> None:
    """Mark a code used. No-op when gating is disabled (code_obj is None)."""
    if code_obj is None:
        return
    code_obj.used_at = datetime.now(timezone.utc)
    code_obj.used_by_email = email
    code_obj.used_by_method = method
