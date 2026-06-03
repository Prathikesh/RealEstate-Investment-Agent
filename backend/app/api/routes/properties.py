"""
Property endpoints.

GET  /api/properties          — paginated list with filters
GET  /api/properties/stats    — dashboard summary stats
GET  /api/properties/{id}     — full property detail
POST /api/properties/{id}/analyze — trigger re-analysis (admin use)
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.schemas import PropertyCard, PropertyDetail, PropertyListResponse, StatsResponse
from app.models.property import Property, PropertyStatus, PropertyType, ScoreCategory

router = APIRouter(prefix="/api/properties", tags=["properties"])


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PropertyListResponse)
async def list_properties(
    # Filters
    city:          Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    score_min:     int           = Query(0, ge=0, le=100),
    score_max:     int           = Query(100, ge=0, le=100),
    price_min:     Optional[float] = Query(None),
    price_max:     Optional[float] = Query(None),
    status:        Optional[str] = Query(None),
    # Sorting
    sort_by: Literal["score", "price", "newest", "discount"] = Query("score"),
    # Pagination
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PropertyListResponse:

    stmt = select(Property).where(Property.asking_price.isnot(None))

    # Filters
    if city:
        stmt = stmt.where(func.lower(Property.city).contains(city.lower()))
    if property_type:
        try:
            pt = PropertyType(property_type)
            stmt = stmt.where(Property.property_type == pt)
        except ValueError:
            pass
    if score_min > 0 or score_max < 100:
        stmt = stmt.where(Property.score.isnot(None))
        if score_min > 0:
            stmt = stmt.where(Property.score >= score_min)
        if score_max < 100:
            stmt = stmt.where(Property.score <= score_max)
    if price_min:
        stmt = stmt.where(Property.asking_price >= price_min)
    if price_max:
        stmt = stmt.where(Property.asking_price <= price_max)
    if status:
        try:
            s = PropertyStatus(status)
            stmt = stmt.where(Property.status == s)
        except ValueError:
            pass

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Sort
    if sort_by == "score":
        stmt = stmt.order_by(Property.score.desc().nullslast())
    elif sort_by == "price":
        stmt = stmt.order_by(Property.asking_price.asc())
    elif sort_by == "newest":
        stmt = stmt.order_by(Property.first_seen_at.desc())
    elif sort_by == "discount":
        stmt = stmt.order_by(Property.discount_pct.desc().nullslast())

    # Paginate
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    items = list((await db.scalars(stmt)).all())
    pages = max(1, -(-total // page_size))  # ceiling division

    return PropertyListResponse(
        items=[PropertyCard.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
) -> StatsResponse:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday   = today_start - timedelta(days=1)

    total = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.status.in_([PropertyStatus.ACTIVE, PropertyStatus.PRICE_CHANGED]))
    ) or 0

    new_today = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.first_seen_at >= today_start)
    ) or 0

    strong = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.score >= 80)
    ) or 0

    investigating = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.score >= 60)
        .where(Property.score < 80)
    ) or 0

    price_drops = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.status == PropertyStatus.PRICE_CHANGED)
        .where(Property.last_seen_at >= yesterday)
    ) or 0

    avg_score = await db.scalar(
        select(func.avg(Property.score)).where(Property.score.isnot(None))
    )

    cities_rows = await db.execute(
        select(distinct(Property.city))
        .where(Property.city.isnot(None))
        .order_by(Property.city)
        .limit(50)
    )
    cities = [r[0] for r in cities_rows.all()]

    return StatsResponse(
        total_properties=total,
        new_today=new_today,
        strong_opportunities=strong,
        worth_investigating=investigating,
        price_drops_today=price_drops,
        avg_score=round(float(avg_score), 1) if avg_score else None,
        cities=cities,
    )


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/{property_id}", response_model=PropertyDetail)
async def get_property(
    property_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> PropertyDetail:
    prop = await db.scalar(
        select(Property).where(Property.id == property_id)
    )
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    return PropertyDetail.model_validate(prop)


# ── Trigger re-analysis ───────────────────────────────────────────────────────

@router.post("/{property_id}/analyze")
async def trigger_analysis(
    property_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    prop = await db.scalar(
        select(Property).where(Property.id == property_id)
    )
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    prop.needs_reanalysis = True
    await db.flush()

    return {"status": "queued", "property_id": str(property_id)}
