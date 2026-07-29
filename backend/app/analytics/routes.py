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


class OverviewResponse(BaseModel):
    total_users: int
    online_now: int
    signups_this_week: int
    most_active_users: list[ActiveUserSummary]
    most_viewed_properties: list[PropertyViewSummary]
    most_analyzed_properties: list[PropertyViewSummary]
    top_pages: list[PageViewSummary]


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


# ── Admin reads ──────────────────────────────────────────────────────────────────

@admin_router.get("/users", response_model=list[UserSummary])
async def list_users(db: AsyncSession = Depends(get_db)) -> list[UserSummary]:
    users = (await db.execute(select(Broker).order_by(Broker.created_at.desc()))).scalars().all()
    online_cutoff = datetime.now(timezone.utc) - ONLINE_THRESHOLD

    view_counts = await _event_counts_by_user(db, EventType.PROPERTY_VIEW)
    analysis_counts = await _event_counts_by_user(db, EventType.ANALYSIS_VIEW)

    engagement_since = datetime.now(timezone.utc) - ENGAGEMENT_WINDOW
    recent_analyses = await _event_counts_by_user(db, EventType.ANALYSIS_VIEW, since=engagement_since)
    recent_views = await _event_counts_by_user(db, EventType.PROPERTY_VIEW, since=engagement_since)
    recent_searches = await _event_counts_by_user(db, EventType.SEARCH, since=engagement_since)

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
            id=u.id, email=u.email, name=u.name, role=u.role.value,
            created_at=u.created_at, last_login_at=u.last_login_at, last_active_at=u.last_active_at,
            is_online=bool(u.last_active_at and u.last_active_at >= online_cutoff),
            properties_viewed=view_counts.get(u.id, 0),
            properties_analyzed=analysis_counts.get(u.id, 0),
            top_page=top_page.get(u.id),
            engagement=_engagement_tier(
                recent_analyses.get(u.id, 0), recent_views.get(u.id, 0), recent_searches.get(u.id, 0),
            ),
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


@admin_router.get("/analytics/overview", response_model=OverviewResponse)
async def get_overview(db: AsyncSession = Depends(get_db)) -> OverviewResponse:
    now = datetime.now(timezone.utc)
    online_cutoff = now - ONLINE_THRESHOLD
    week_ago = now - timedelta(days=7)

    total_users = await db.scalar(select(func.count()).select_from(Broker)) or 0
    online_now = await db.scalar(
        select(func.count()).select_from(Broker).where(Broker.last_active_at >= online_cutoff)
    ) or 0
    signups_this_week = await db.scalar(
        select(func.count()).select_from(Broker).where(Broker.created_at >= week_ago)
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

    return OverviewResponse(
        total_users=total_users,
        online_now=online_now,
        signups_this_week=signups_this_week,
        most_active_users=[
            ActiveUserSummary(id=r.user_id, email=users_by_id[r.user_id].email, name=users_by_id[r.user_id].name, event_count=r.cnt)
            for r in active_rows if r.user_id in users_by_id
        ],
        most_viewed_properties=await _top_properties(db, event_type=EventType.PROPERTY_VIEW),
        most_analyzed_properties=await _top_properties(db, event_type=EventType.ANALYSIS_VIEW),
        top_pages=await _top_pages(db),
    )


@admin_router.get("/analytics/activity-feed", response_model=list[ActivityEntry])
async def get_activity_feed(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityEntry]:
    """Site-wide "what's happening right now" — the same feed as a user's own
    recent_activity, just not scoped to one person."""
    return await _recent_events(db, limit=limit)
