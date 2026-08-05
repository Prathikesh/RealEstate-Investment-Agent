"""
Admin invite-code management — generate, list, and revoke the one-time codes that
gate registration (see app.models.invite.InviteCode, app.auth.invites). Every route
requires an authenticated admin (applied at the router level).

POST   /api/admin/invite-codes         — generate one or more codes
GET    /api/admin/invite-codes         — list all codes (newest first)
PATCH  /api/admin/invite-codes/{id}/revoke — disable an unused code
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.auth.deps import require_admin
from app.auth.invites import generate_code
from app.models.broker import Broker
from app.models.invite import InviteCode

router = APIRouter(prefix="/api/admin/invite-codes", tags=["admin"], dependencies=[Depends(require_admin)])


class GenerateRequest(BaseModel):
    label: Optional[str] = None
    count: int = 1


class InviteCodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    label: Optional[str]
    is_active: bool
    used_at: Optional[datetime]
    used_by_email: Optional[str]
    used_by_method: Optional[str]
    created_at: datetime


@router.post("", response_model=list[InviteCodeOut])
async def generate_codes(
    data: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Broker = Depends(require_admin),
) -> list[InviteCode]:
    count = max(1, min(100, data.count))
    label = (data.label or "").strip() or None
    created: list[InviteCode] = []
    # Retry on the (astronomically unlikely) unique-collision.
    for _ in range(count):
        for _attempt in range(5):
            code = generate_code()
            if not await db.scalar(select(InviteCode.id).where(InviteCode.code == code)):
                break
        obj = InviteCode(code=code, label=label, created_by=admin.id)
        db.add(obj)
        created.append(obj)
    await db.flush()
    for obj in created:
        await db.refresh(obj)
    return created


@router.get("", response_model=list[InviteCodeOut])
async def list_codes(db: AsyncSession = Depends(get_db)) -> list[InviteCode]:
    rows = await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
    return list(rows.scalars().all())


@router.patch("/{code_id}/revoke", response_model=InviteCodeOut)
async def revoke_code(code_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> InviteCode:
    obj = await db.scalar(select(InviteCode).where(InviteCode.id == code_id))
    if obj is None:
        raise HTTPException(status_code=404, detail="Invite code not found")
    if obj.used_at is not None:
        raise HTTPException(status_code=400, detail="Cannot revoke a code that was already used")
    obj.is_active = False
    await db.flush()
    await db.refresh(obj)
    return obj
