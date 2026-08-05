"""
InviteCode — a one-time registration code. Registration is invite-only: a valid,
unused, active code is required to create an account (email/password OR first-time
Google sign-in). Admins generate codes (one per student) and can revoke unused ones.

A code is "usable" when is_active AND used_at IS NULL. It's consumed the moment it
successfully creates an account (recording who used it and how), so it can't be
reused.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    # Optional note — usually the student's name, so the admin knows who each code is for.
    label: Mapped[Optional[str]] = mapped_column(String(120))

    # Revocable: an admin can disable an unused code.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Consumption record (set when the code successfully creates an account).
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    used_by_email: Mapped[Optional[str]] = mapped_column(String(255))
    used_by_method: Mapped[Optional[str]] = mapped_column(String(16))  # "password" | "google"

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def is_usable(self) -> bool:
        return self.is_active and self.used_at is None

    def __repr__(self) -> str:
        state = "used" if self.used_at else ("active" if self.is_active else "revoked")
        return f"<InviteCode {self.code} {state}>"
