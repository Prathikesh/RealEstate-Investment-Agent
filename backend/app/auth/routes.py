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

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.scorer import WEIGHTS
from app.analytics.models import EventType
from app.analytics.service import log_event
from app.api.deps import get_db
from app.auth.deps import ACCESS_COOKIE_NAME, get_current_user
from app.auth.invites import consume_code, validate_code
from app.auth.models import RefreshToken
from app.auth.oauth import oauth
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
from app.models.broker import Broker, UserRole, InvestmentStrategy, Language

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    invite_code: Optional[str] = None

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

    # ── Investment / alert preferences (Settings page) ──
    location_city:        Optional[str]       = None
    location_radius_km:   Optional[int]       = None
    price_min:            Optional[float]     = None
    price_max:            Optional[float]     = None
    property_types:       Optional[list[str]] = None
    investment_strategy:  Optional[str]       = None
    min_score_for_alert:  Optional[int]       = None
    email_alerts_enabled: Optional[bool]      = None
    language:             Optional[str]       = None
    # Optional override of the strategy's preset scoring weights — see
    # app/agent/scorer.py WEIGHTS. Null means "use investment_strategy's preset".
    custom_score_weights: Optional[dict[str, float]] = None
    # Real-number "buy box" targets ("in numbers, not percentages"). See
    # BUY_BOX_KEYS. Null / absent keys mean "no target for that factor".
    custom_buy_box:       Optional[dict[str, float]] = None

    @field_validator("role", "investment_strategy", "language", mode="before")
    @classmethod
    def enum_to_value(cls, v):
        return v.value if hasattr(v, "value") else v


class PreferencesUpdate(BaseModel):
    """Partial update of the current user's investment/alert preferences."""
    location_city:        Optional[str]       = None
    location_radius_km:   Optional[int]       = None
    price_min:            Optional[float]     = None
    price_max:            Optional[float]     = None
    property_types:       Optional[list[str]] = None
    investment_strategy:  Optional[str]       = None
    min_score_for_alert:  Optional[int]       = None
    email_alerts_enabled: Optional[bool]      = None
    language:             Optional[str]       = None
    custom_score_weights: Optional[dict[str, float]] = None
    custom_buy_box:       Optional[dict[str, float]] = None


# The real-number targets a broker can set on their buy box. Mirrors frontend
# lib/buybox.ts BUYBOX_KEYS + the query params the properties route accepts.
BUY_BOX_KEYS = {
    "cash_flow_min", "cap_rate_min", "discount_min", "days_on_market_min",
    "price_drop_min", "price_drop_pct_min", "price_max",
}


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
    # Invite-only registration: validate the code before doing anything else.
    code_obj = await validate_code(db, data.invite_code)

    existing = await db.scalar(select(Broker).where(Broker.email == data.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = Broker(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        role=UserRole.USER,
        invited_by=code_obj.code if code_obj else None,
    )
    db.add(user)
    consume_code(code_obj, data.email, "password")
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


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: PreferencesUpdate,
    user: Broker = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Broker:
    """Persist the current user's investment/alert preferences (Settings page)."""
    data = payload.model_dump(exclude_unset=True)

    if data.get("investment_strategy") is not None:
        try:
            data["investment_strategy"] = InvestmentStrategy(data["investment_strategy"])
        except ValueError:
            data.pop("investment_strategy")
    if data.get("language") is not None:
        try:
            data["language"] = Language(data["language"])
        except ValueError:
            data.pop("language")
    if data.get("min_score_for_alert") is not None:
        data["min_score_for_alert"] = max(0, min(100, int(data["min_score_for_alert"])))
    if data.get("location_radius_km") is not None:
        data["location_radius_km"] = max(1, min(200, int(data["location_radius_km"])))
    if "custom_score_weights" in data and data["custom_score_weights"] is not None:
        weights = data["custom_score_weights"]
        valid_keys = set(WEIGHTS["both"].keys())
        if set(weights.keys()) != valid_keys or abs(sum(weights.values()) - 1.0) > 0.01:
            raise HTTPException(status_code=400, detail="custom_score_weights must cover all scoring factors and sum to 1.0")
    if "custom_buy_box" in data and data["custom_buy_box"] is not None:
        # Keep only recognised targets with a positive numeric value — a blank / 0
        # entry means "no target", so we drop it rather than store a filter that
        # excludes everything. An empty result stores {} ("no targets set").
        raw_box = data["custom_buy_box"]
        clean_box: dict[str, float] = {}
        for k, v in raw_box.items():
            if k in BUY_BOX_KEYS and isinstance(v, (int, float)) and v > 0:
                clean_box[k] = float(v)
        data["custom_buy_box"] = clean_box

    for key, value in data.items():
        setattr(user, key, value)
    await db.commit()
    await db.refresh(user)
    return user


# ── Google OAuth ─────────────────────────────────────────────────────────────
# Server-side redirect flow (not a client-side token exchange) — the frontend
# never handles a raw Google token, it just navigates the browser here and
# back. authlib stores the CSRF state/nonce in the session cookie set up by
# SessionMiddleware (app/main.py) between these two requests.

@router.get("/google/login")
async def google_login(request: Request, invite_code: Optional[str] = None):
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    # Stash the invite code in the session (which already carries authlib's OAuth
    # state across the round trip) so the callback can validate it IF this turns
    # out to be a first-time signup — new-account creation is invite-only.
    # Existing users signing in don't need a code.
    request.session["invite_code"] = (invite_code or "").strip()
    redirect_uri = f"{settings.app_base_url}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_auth_failed")

    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("email"):
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_auth_failed")

    google_id = userinfo["sub"]
    email = userinfo["email"]

    user = await db.scalar(select(Broker).where(Broker.google_id == google_id))
    if not user:
        # Same email, first time signing in with Google — link to the
        # existing (presumably password-based) account rather than
        # creating a duplicate.
        user = await db.scalar(select(Broker).where(Broker.email == email))
        if user:
            user.google_id = google_id
            if not user.avatar_url and userinfo.get("picture"):
                user.avatar_url = userinfo["picture"]
        else:
            # First-time Google sign-in = brand-new account → invite-only.
            code = (request.session.pop("invite_code", "") or "").strip()
            try:
                code_obj = await validate_code(db, code)
            except HTTPException:
                return RedirectResponse(f"{settings.frontend_url}/register?error=invite")
            user = Broker(
                google_id=google_id,
                email=email,
                name=userinfo.get("name"),
                avatar_url=userinfo.get("picture"),
                role=UserRole.USER,
                is_verified=True,  # Google already verified this email
                invited_by=code_obj.code if code_obj else None,
            )
            db.add(user)
            consume_code(code_obj, email, "google")
            await db.flush()

    if not user.is_active:
        return RedirectResponse(f"{settings.frontend_url}/login?error=account_disabled")

    response = RedirectResponse(f"{settings.frontend_url}/")
    await _issue_session(response, db, user, request)
    return response
