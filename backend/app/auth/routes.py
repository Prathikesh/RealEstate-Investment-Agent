"""
Auth routes — email/password register/login/logout, plus /me.

Session model: a short-lived JWT access token (app.auth.security) in an
httpOnly cookie authenticates requests (see app.auth.deps.get_current_user);
a longer-lived opaque refresh token in a second httpOnly cookie is stored
(hashed) in `refresh_tokens` so logout can revoke it.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.models import EventType
from app.analytics.service import log_event
from app.api.deps import get_db
from app.auth.deps import ACCESS_COOKIE_NAME, get_current_user
from app.auth.models import RefreshToken
from app.auth.security import (
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.config import settings
from app.models.broker import Broker, UserRole

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: Optional[str]
    role: str

    @field_validator("role", mode="before")
    @classmethod
    def role_to_value(cls, v):
        return v.value if hasattr(v, "value") else v


# ── Cookie helpers ────────────────────────────────────────────────────────────

def _cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": settings.is_production,
        "samesite": "none" if settings.is_production else "lax",
        "path": "/",
    }


async def _issue_session(response: Response, db: AsyncSession, user: Broker, request: Request) -> None:
    access_token = create_access_token(user.id, user.role.value)
    response.set_cookie(
        ACCESS_COOKIE_NAME, access_token,
        max_age=int(ACCESS_TOKEN_TTL.total_seconds()),
        **_cookie_kwargs(),
    )

    raw_refresh = generate_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        user_agent=(request.headers.get("user-agent") or "")[:300],
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + REFRESH_TOKEN_TTL,
    ))
    response.set_cookie(
        REFRESH_COOKIE_NAME, raw_refresh,
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        **_cookie_kwargs(),
    )

    now = datetime.now(timezone.utc)
    user.last_login_at = now
    user.last_active_at = now
    await log_event(db, user.id, EventType.LOGIN)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Broker:
    existing = await db.scalar(select(Broker).where(Broker.email == data.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = Broker(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        role=UserRole.USER,
    )
    db.add(user)
    await db.flush()

    await _issue_session(response, db, user, request)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Broker:
    user = await db.scalar(select(Broker).where(Broker.email == data.email))
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    await _issue_session(response, db, user, request)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> None:
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_refresh:
        token_hash = hash_refresh_token(raw_refresh)
        stored = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        if stored and not stored.revoked_at:
            stored.revoked_at = datetime.now(timezone.utc)

    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")


@router.get("/me", response_model=UserResponse)
async def me(user: Broker = Depends(get_current_user)) -> Broker:
    return user
