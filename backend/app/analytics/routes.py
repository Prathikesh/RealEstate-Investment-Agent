"""
Analytics routes.

POST /api/analytics/pageview      — any authenticated user logs their own page view
GET  /api/admin/users             — all users + activity summary (admin only)
GET  /api/admin/users/{id}        — one user's full detail: pages visited, properties
                                     viewed, properties analyzed (financials run),
                                     recent searches
GET  /api/admin/analytics/overview — site-wide activity summary

Search, property-view, and analysis-view events are logged server-side
directly in app.api.routes.properties (every request already goes through
the API, so tracking there doesn't depend on frontend JS running). Page
views have no corresponding API call — SPA route changes are client-only —
so the frontend explicitly reports those via POST /pageview.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import column, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.auth.deps import get_current_user, require_admin
from app.analytics.models import EventType, UserEvent
from app.analytics.service import log_event
from app.models.broker import Broker
from app.models.property import Property

# Budget buckets — mirrors the Settings page's BUDGETS list, so "what people
# want" (here) and "what people set in Settings" always agree.
_BUDGET_BANDS: list[tuple[str, Optional[float], Optional[float]]] = [
    ("Under $300K",   None,      300_000),
    ("$300K – $500K", 300_000,   500_000),
    ("$500K – $750K", 500_000,   750_000),
    ("$750K – $1M",   750_000,   1_000_000),
    ("Over $1M",      1_000_000, None),
]

# last_active_at within this window counts as "online now"
ONLINE_THRESHOLD = timedelta(minutes=5)
# Per-user detail view shows more than a global top-10 — it's the "click in
# for the full picture" view, so completeness matters more than brevity.
PER_USER_LIMIT = 25

# Trailing window + thresholds for the hot-lead / engagement tiers. Named
# constants so they're easy to retune once real usage patterns are known.
ENGAGEMENT_WINDOW = timedelta(days=14)
HOT_LEAD_ANALYSES = 2   # ran the full financial analysis on this many properties -> hot lead
WARM_VIEWS = 5          # viewed this many properties -> warm
WARM_SEARCHES = 3       # searched this many times -> warm

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin-analytics"], dependencies=[Depends(require_admin)])


# ── Event logging (any authenticated user) ─────────────────────────────────────

class PageViewRequest(BaseModel):
    path: str


@router.post("/pageview", status_code=status.HTTP_204_NO_CONTENT)
async def log_pageview(
    data: PageViewRequest,
    user: Broker = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await log_event(db, user.id, EventType.PAGE_VIEW, {"path": data.path})


# ── Schemas (admin reads) ───────────────────────────────────────────────────────

class UserSummary(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime]
    last_active_at: Optional[datetime]
    is_online: bool
    properties_viewed: int
    properties_analyzed: int
    top_page: Optional[str]
    engagement: str  # "hot_lead" | "warm" | "exploring" | "cold" — see ENGAGEMENT_WINDOW below


class PageViewSummary(BaseModel):
    path: str
    view_count: int


class PropertyViewSummary(BaseModel):
    property_id: uuid.UUID
    full_address: Optional[str]
    city: Optional[str]
    score: Optional[float]
    view_count: int


class SearchLogEntry(BaseModel):
    filters: dict
    created_at: datetime


class ActivityEntry(BaseModel):
    event_type: str
    payload: dict
    property_address: Optional[str] = None
    created_at: datetime
    # Only populated on the global feed (get_activity_feed) — redundant on a
    # per-user detail view, which already knows whose activity it's showing.
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class UserDetailResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str]
    role: str
    created_at: datetime
    last_login_at: Optional[datetime]
    last_active_at: Optional[datetime]
    is_online: bool
    top_pages: list[PageViewSummary]
    viewed_properties: list[PropertyViewSummary]
    analyzed_properties: list[PropertyViewSummary]
    recent_searches: list[SearchLogEntry]
    recent_activity: list[ActivityEntry]


class ActiveUserSummary(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str]
    event_count: int


class RankedLabel(BaseModel):
    label: str
    count: int


class EngagementBreakdown(BaseModel):
    hot_lead: int
    warm: int
    exploring: int
    cold: int


class SignupTrendPoint(BaseModel):
    date: str  # YYYY-MM-DD
    count: int


class PreferenceInsights(BaseModel):
    """What people actually want, aggregated from Settings — not from usage."""
    top_cities: list[RankedLabel]
    budget_bands: list[RankedLabel]
    property_types: list[RankedLabel]


class OverviewResponse(BaseModel):
    total_users: int
    online_now: int
    signups_this_week: int
    signups_last_week: int
    most_active_users: list[ActiveUserSummary]
    most_viewed_properties: list[PropertyViewSummary]
    most_analyzed_properties: list[PropertyViewSummary]
    top_pages: list[PageViewSummary]
    engagement: EngagementBreakdown
    preferences: PreferenceInsights
    top_search_cities: list[RankedLabel]
    top_search_types: list[RankedLabel]
    signup_trend: list[SignupTrendPoint]


# ── Shared aggregation helpers ──────────────────────────────────────────────────

async def _top_pages(db: AsyncSession, *, user_id: Optional[uuid.UUID] = None, limit: int = 10) -> list[PageViewSummary]:
    # Group by the SELECT alias ("path"), not by re-deriving payload['path']
    # a second time — Postgres binds each occurrence of a JSONB ->> literal
    # as its own parameter, and then rejects the two as unprovably identical
    # in GROUP BY (GroupingError). Referencing the output alias sidesteps it.
    stmt = select(
        UserEvent.payload["path"].astext.label("path"), func.count().label("cnt")
    ).where(UserEvent.event_type == EventType.PAGE_VIEW)
    if user_id is not None:
        stmt = stmt.where(UserEvent.user_id == user_id)
    stmt = stmt.group_by(column("path")).order_by(func.count().desc()).limit(limit)

    rows = (await db.execute(stmt)).all()
    return [PageViewSummary(path=r.path, view_count=r.cnt) for r in rows if r.path]


async def _top_properties(
    db: AsyncSession, *, event_type: EventType, user_id: Optional[uuid.UUID] = None, limit: int = 10
) -> list[PropertyViewSummary]:
    """event_type is PROPERTY_VIEW for "looked at" or ANALYSIS_VIEW for "ran the
    financial analysis on" — same aggregation, different action."""
    stmt = select(
        UserEvent.payload["property_id"].astext.label("pid"), func.count().label("cnt")
    ).where(UserEvent.event_type == event_type)
    if user_id is not None:
        stmt = stmt.where(UserEvent.user_id == user_id)
    stmt = stmt.group_by(column("pid")).order_by(func.count().desc()).limit(limit)

    rows = [(r.pid, r.cnt) for r in (await db.execute(stmt)).all() if r.pid]
    if not rows:
        return []

    pids = [uuid.UUID(pid) for pid, _ in rows]
    props = {p.id: p for p in (await db.execute(select(Property).where(Property.id.in_(pids)))).scalars().all()}

    return [
        PropertyViewSummary(
            property_id=uuid.UUID(pid),
            full_address=props[uuid.UUID(pid)].full_address if uuid.UUID(pid) in props else None,
            city=props[uuid.UUID(pid)].city if uuid.UUID(pid) in props else None,
            score=props[uuid.UUID(pid)].score if uuid.UUID(pid) in props else None,
            view_count=cnt,
        )
        for pid, cnt in rows
    ]


async def _event_counts_by_user(
    db: AsyncSession, event_type: EventType, *, since: Optional[datetime] = None
) -> dict[uuid.UUID, int]:
    stmt = select(UserEvent.user_id, func.count()).where(UserEvent.event_type == event_type)
    if since is not None:
        stmt = stmt.where(UserEvent.created_at >= since)
    return dict((await db.execute(stmt.group_by(UserEvent.user_id))).all())


def _engagement_tier(analyses: int, views: int, searches: int) -> str:
    """Hot lead = ran the numbers on multiple properties recently — the
    clearest buy-intent signal this app can observe. Warm = actively
    browsing/searching but hasn't gone that deep yet."""
    if analyses >= HOT_LEAD_ANALYSES:
        return "hot_lead"
    if analyses >= 1 or views >= WARM_VIEWS or searches >= WARM_SEARCHES:
        return "warm"
    if views or searches:
        return "exploring"
    return "cold"


async def _recent_events(
    db: AsyncSession, *, user_id: Optional[uuid.UUID] = None, limit: int = 30
) -> list[ActivityEntry]:
    """Raw event feed, newest first — the "what happened, in what order"
    counterpart to the aggregated _top_* helpers above. Resolves any
    property_id in an event's payload to a real address in one batch query,
    same pattern _top_properties uses."""
    stmt = select(UserEvent, Broker.name, Broker.email).join(Broker, Broker.id == UserEvent.user_id)
    if user_id is not None:
        stmt = stmt.where(UserEvent.user_id == user_id)
    stmt = stmt.order_by(UserEvent.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).all()

    pids: set[uuid.UUID] = set()
    for event, _, _ in rows:
        pid = (event.payload or {}).get("property_id")
        if pid:
            try:
                pids.add(uuid.UUID(pid))
            except ValueError:
                pass

    props = {}
    if pids:
        props = {p.id: p for p in (await db.execute(select(Property).where(Property.id.in_(pids)))).scalars().all()}

    entries = []
    for event, user_name, user_email in rows:
        pid = (event.payload or {}).get("property_id")
        address = None
        if pid:
            try:
                prop = props.get(uuid.UUID(pid))
                address = prop.full_address if prop else None
            except ValueError:
                address = None
        entries.append(ActivityEntry(
            event_type=event.event_type.value,
            payload=event.payload or {},
            property_address=address,
            created_at=event.created_at,
            user_name=None if user_id is not None else user_name,
            user_email=None if user_id is not None else user_email,
        ))
    return entries


def _budget_band(price_min: Optional[float], price_max: Optional[float]) -> Optional[str]:
    """Match a broker's saved price range to a Settings budget bucket. Only an
    exact match counts — a custom/partial range isn't one of the six presets."""
    for label, lo, hi in _BUDGET_BANDS:
        if (lo or None) == (price_min or None) and (hi or None) == (price_max or None):
            return label
    return None


def _ranked(counter: dict[str, int], limit: int = 6) -> list[RankedLabel]:
    return [
        RankedLabel(label=label, count=count)
        for label, count in sorted(counter.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    ]


def _tally_label(bucket: dict[str, list], raw: str) -> None:
    """Case-insensitive tally that still displays a nicely-cased label — so
    "montreal" and "Montreal" count as the SAME city instead of splitting the
    tally (free-text city fields aren't case-normalized at the source). Keeps
    the first capitalized-looking variant seen as the display label."""
    key = raw.strip()
    if not key:
        return
    lower = key.lower()
    if lower not in bucket:
        bucket[lower] = [key, 0]
    elif key[:1].isupper() and not bucket[lower][0][:1].isupper():
        bucket[lower][0] = key
    bucket[lower][1] += 1


def _ranked_labels(bucket: dict[str, list], limit: int = 6) -> list[RankedLabel]:
    return [
        RankedLabel(label=label, count=count)
        for label, count in sorted(bucket.values(), key=lambda v: v[1], reverse=True)[:limit]
    ]


async def _preference_insights(db: AsyncSession) -> PreferenceInsights:
    """What people actually want, straight from their saved Settings — the
    stated-preference counterpart to the behavioural (search/view) stats."""
    brokers = (await db.execute(
        select(Broker.location_city, Broker.price_min, Broker.price_max, Broker.property_types)
    )).all()

    cities: dict[str, list] = {}
    budgets: dict[str, int] = {}
    types: dict[str, int] = {}
    for city, price_min, price_max, property_types in brokers:
        if city:
            _tally_label(cities, city)
        band = _budget_band(price_min, price_max)
        if band:
            budgets[band] = budgets.get(band, 0) + 1
        for t in (property_types or []):
            label = str(t).replace("_", " ").title()
            types[label] = types.get(label, 0) + 1

    return PreferenceInsights(
        top_cities=_ranked_labels(cities), budget_bands=_ranked(budgets), property_types=_ranked(types),
    )


async def _top_search_terms(db: AsyncSession, *, limit: int = 300) -> tuple[list[RankedLabel], list[RankedLabel]]:
    """Top searched cities / property types, tallied from the most recent
    search events (actual behaviour — may disagree with stated preferences)."""
    rows = (await db.execute(
        select(UserEvent.payload)
        .where(UserEvent.event_type == EventType.SEARCH)
        .order_by(UserEvent.created_at.desc())
        .limit(limit)
    )).all()

    cities: dict[str, list] = {}
    types: dict[str, int] = {}
    for (payload,) in rows:
        payload = payload or {}
        city = payload.get("city")
        if city:
            _tally_label(cities, str(city))
        ptype = payload.get("property_type")
        if ptype:
            label = str(ptype).replace("_", " ").title()
            types[label] = types.get(label, 0) + 1

    return _ranked_labels(cities), _ranked(types)


async def _signup_trend(db: AsyncSession, *, days: int = 14) -> list[SignupTrendPoint]:
    """Daily signup counts for the trailing N days — zero-filled so the
    sparkline never has a gap for a day with no signups."""
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    rows = (await db.execute(
        select(func.date(Broker.created_at).label("d"), func.count().label("cnt"))
        .where(Broker.created_at >= since)
        .group_by(column("d"))
    )).all()
    by_day = {str(r.d): r.cnt for r in rows}

    today = datetime.now(timezone.utc).date()
    return [
        SignupTrendPoint(date=str(d), count=by_day.get(str(d), 0))
        for d in (today - timedelta(days=days - 1 - i) for i in range(days))
    ]


async def _engagement_tiers(db: AsyncSession) -> dict[uuid.UUID, str]:
    """Engagement tier for every user with any recent activity, keyed by id —
    the single source both list_users (per-row badge) and the overview
    (breakdown counts) read from. A user absent from this dict is "cold"
    (no recent activity at all) — callers default missing keys to that."""
    engagement_since = datetime.now(timezone.utc) - ENGAGEMENT_WINDOW
    recent_analyses = await _event_counts_by_user(db, EventType.ANALYSIS_VIEW, since=engagement_since)
    recent_views = await _event_counts_by_user(db, EventType.PROPERTY_VIEW, since=engagement_since)
    recent_searches = await _event_counts_by_user(db, EventType.SEARCH, since=engagement_since)

    user_ids = set(recent_analyses) | set(recent_views) | set(recent_searches)
    return {
        uid: _engagement_tier(recent_analyses.get(uid, 0), recent_views.get(uid, 0), recent_searches.get(uid, 0))
        for uid in user_ids
    }


# ── Admin reads ──────────────────────────────────────────────────────────────────

@admin_router.get("/users", response_model=list[UserSummary])
async def list_users(db: AsyncSession = Depends(get_db)) -> list[UserSummary]:
    users = (await db.execute(select(Broker).order_by(Broker.created_at.desc()))).scalars().all()
    online_cutoff = datetime.now(timezone.utc) - ONLINE_THRESHOLD

    view_counts = await _event_counts_by_user(db, EventType.PROPERTY_VIEW)
    analysis_counts = await _event_counts_by_user(db, EventType.ANALYSIS_VIEW)
    tiers = await _engagement_tiers(db)

    page_rows = (await db.execute(
        select(UserEvent.user_id, UserEvent.payload["path"].astext.label("path"), func.count().label("cnt"))
        .where(UserEvent.event_type == EventType.PAGE_VIEW)
        .group_by(UserEvent.user_id, column("path"))
    )).all()
    top_page: dict[uuid.UUID, str] = {}
    best_count: dict[uuid.UUID, int] = {}
    for user_id, path, cnt in page_rows:
        if path and cnt > best_count.get(user_id, 0):
            best_count[user_id] = cnt
            top_page[user_id] = path

    return [
        UserSummary(
            id=u.id, email=u.email, name=u.name, role=u.role.value, is_active=u.is_active,
            created_at=u.created_at, last_login_at=u.last_login_at, last_active_at=u.last_active_at,
            is_online=bool(u.last_active_at and u.last_active_at >= online_cutoff),
            properties_viewed=view_counts.get(u.id, 0),
            properties_analyzed=analysis_counts.get(u.id, 0),
            top_page=top_page.get(u.id),
            engagement=tiers.get(u.id, "cold"),
        )
        for u in users
    ]


@admin_router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> UserDetailResponse:
    user = await db.get(Broker, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    online_cutoff = datetime.now(timezone.utc) - ONLINE_THRESHOLD

    search_rows = (await db.execute(
        select(UserEvent.payload, UserEvent.created_at)
        .where(UserEvent.event_type == EventType.SEARCH, UserEvent.user_id == user_id)
        .order_by(UserEvent.created_at.desc())
        .limit(PER_USER_LIMIT)
    )).all()

    return UserDetailResponse(
        id=user.id, email=user.email, name=user.name, role=user.role.value,
        created_at=user.created_at, last_login_at=user.last_login_at, last_active_at=user.last_active_at,
        is_online=bool(user.last_active_at and user.last_active_at >= online_cutoff),
        top_pages=await _top_pages(db, user_id=user_id, limit=PER_USER_LIMIT),
        viewed_properties=await _top_properties(db, event_type=EventType.PROPERTY_VIEW, user_id=user_id, limit=PER_USER_LIMIT),
        analyzed_properties=await _top_properties(db, event_type=EventType.ANALYSIS_VIEW, user_id=user_id, limit=PER_USER_LIMIT),
        recent_searches=[SearchLogEntry(filters=payload or {}, created_at=created_at) for payload, created_at in search_rows],
        recent_activity=await _recent_events(db, user_id=user_id, limit=30),
    )


class UserStatusUpdate(BaseModel):
    is_active: bool


@admin_router.patch("/users/{user_id}/status", response_model=UserSummary)
async def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    admin: Broker = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Broker:
    """Activate/deactivate an account. A disabled account can no longer log in
    (see get_current_user's is_active check) — existing sessions still expire
    normally via the access-token TTL, so this isn't instant revocation."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account")
    user = await db.get(Broker, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = payload.is_active
    await db.commit()
    await db.refresh(user)

    online_cutoff = datetime.now(timezone.utc) - ONLINE_THRESHOLD
    view_counts = await _event_counts_by_user(db, EventType.PROPERTY_VIEW)
    analysis_counts = await _event_counts_by_user(db, EventType.ANALYSIS_VIEW)
    tiers = await _engagement_tiers(db)
    return UserSummary(
        id=user.id, email=user.email, name=user.name, role=user.role.value, is_active=user.is_active,
        created_at=user.created_at, last_login_at=user.last_login_at, last_active_at=user.last_active_at,
        is_online=bool(user.last_active_at and user.last_active_at >= online_cutoff),
        properties_viewed=view_counts.get(user.id, 0),
        properties_analyzed=analysis_counts.get(user.id, 0),
        top_page=None,
        engagement=tiers.get(user.id, "cold"),
    )


@admin_router.get("/analytics/overview", response_model=OverviewResponse)
async def get_overview(db: AsyncSession = Depends(get_db)) -> OverviewResponse:
    now = datetime.now(timezone.utc)
    online_cutoff = now - ONLINE_THRESHOLD
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    total_users = await db.scalar(select(func.count()).select_from(Broker)) or 0
    online_now = await db.scalar(
        select(func.count()).select_from(Broker).where(Broker.last_active_at >= online_cutoff)
    ) or 0
    signups_this_week = await db.scalar(
        select(func.count()).select_from(Broker).where(Broker.created_at >= week_ago)
    ) or 0
    signups_last_week = await db.scalar(
        select(func.count()).select_from(Broker)
        .where(Broker.created_at >= two_weeks_ago, Broker.created_at < week_ago)
    ) or 0

    active_rows = (await db.execute(
        select(UserEvent.user_id, func.count().label("cnt"))
        .where(UserEvent.created_at >= week_ago)
        .group_by(UserEvent.user_id)
        .order_by(func.count().desc())
        .limit(10)
    )).all()
    active_user_ids = [r.user_id for r in active_rows]
    users_by_id = {}
    if active_user_ids:
        users_by_id = {u.id: u for u in (await db.execute(select(Broker).where(Broker.id.in_(active_user_ids)))).scalars().all()}

    # Engagement breakdown — tally every user's tier (missing = "cold").
    tiers = await _engagement_tiers(db)
    all_user_ids = (await db.execute(select(Broker.id))).scalars().all()
    tier_counts = {"hot_lead": 0, "warm": 0, "exploring": 0, "cold": 0}
    for uid in all_user_ids:
        tier_counts[tiers.get(uid, "cold")] += 1

    top_search_cities, top_search_types = await _top_search_terms(db)

    return OverviewResponse(
        total_users=total_users,
        online_now=online_now,
        signups_this_week=signups_this_week,
        signups_last_week=signups_last_week,
        most_active_users=[
            ActiveUserSummary(id=r.user_id, email=users_by_id[r.user_id].email, name=users_by_id[r.user_id].name, event_count=r.cnt)
            for r in active_rows if r.user_id in users_by_id
        ],
        most_viewed_properties=await _top_properties(db, event_type=EventType.PROPERTY_VIEW),
        most_analyzed_properties=await _top_properties(db, event_type=EventType.ANALYSIS_VIEW),
        top_pages=await _top_pages(db),
        engagement=EngagementBreakdown(**tier_counts),
        preferences=await _preference_insights(db),
        top_search_cities=top_search_cities,
        top_search_types=top_search_types,
        signup_trend=await _signup_trend(db),
    )


@admin_router.get("/analytics/activity-feed", response_model=list[ActivityEntry])
async def get_activity_feed(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityEntry]:
    """Site-wide "what's happening right now" — the same feed as a user's own
    recent_activity, just not scoped to one person."""
    return await _recent_events(db, limit=limit)
