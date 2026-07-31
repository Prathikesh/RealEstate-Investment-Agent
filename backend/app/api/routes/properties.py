"""
Property endpoints.

GET  /api/properties                      — paginated list with filters
GET  /api/properties/stats               — dashboard summary stats
GET  /api/properties/{id}                — full property detail
POST /api/properties/{id}/analyze        — trigger re-analysis (admin use)
GET  /api/properties/{id}/full-analysis  — on-demand comprehensive AI analysis
"""
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, distinct, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agent.buildable import estimate_max_units
from app.agent.constraint_matcher import CONSTRAINT_EXPLAIN
from app.agent.constants import SOURCES
from app.agent.full_analysis import run_full_analysis
from app.agent.pipeline import InvestmentPipeline
from app.agent.zoning_matcher import current_units as _current_units
from app.analytics.models import EventType
from app.analytics.service import log_event
from app.api.deps import get_db
from app.auth.deps import get_current_user_optional
from app.models.broker import Broker
from app.api.schemas import (
    ComparablePropertySchema,
    CrossSitePrice, DataSourceSchema, FinancialProfileSchema, FullAnalysisResponse,
    NeighbourhoodContextSchema, PropertyCard, PropertyDetail, PropertyListResponse,
    RenovationROISchema, RenovationScenarioSchema, RiskAssessmentSchema, RiskItemSchema,
    ScoreResultSchema, StatsResponse, FiveYearProjectionSchema, YearSnapshotSchema,
    ZoningInfo, RebuildEconomicsInfo, AssessmentInfo, ConstraintFlag,
)
from app.models.property import Property, PropertyStatus, PropertyType, ScoreCategory
from app.models.source import PropertySource

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/properties", tags=["properties"])


# ── Cross-site helpers ─────────────────────────────────────────────────────────

def _build_cross_site_prices(sources: list) -> list[CrossSitePrice]:
    priced = [s for s in sources if s.is_active and s.last_price is not None]
    if not priced:
        return []
    min_price = min(s.last_price for s in priced)
    return [
        CrossSitePrice(
            source=s.source.value,
            price=s.last_price,
            source_url=s.source_url,
            last_seen_at=s.last_seen_at,
            is_lowest=s.last_price == min_price,
            agent_name=s.agent_name,
            agent_phone=s.agent_phone,
            agent_email=s.agent_email,
            agency_name=s.agency_name,
        )
        for s in sorted(priced, key=lambda x: x.last_price)
    ]


# Public, official bylaw document per city — used to build a direct,
# page-anchored link so an investor can verify the source themselves.
# Same PDF for every Laval zone; #page= is honoured by browser PDF viewers.
_LAVAL_BYLAW_PDF_URL = "https://www.laval.ca/wp-content/uploads/2026/06/cdu-1-reglement-2026-06-08.pdf"
_QUEBEC_CITY_ZONING_PORTAL_URL = "https://carte.ville.quebec.qc.ca/carteinteractive/"
_MONTREAL_PUM_URL = "https://montreal.ca/articles/plan-durbanisme-et-de-mobilite-2050-72130"


def _source_document_url(city: str, decode_table_page: Optional[int]) -> Optional[str]:
    if city == "laval":
        return f"{_LAVAL_BYLAW_PDF_URL}#page={decode_table_page}" if decode_table_page else _LAVAL_BYLAW_PDF_URL
    if city == "quebec_city":
        return _QUEBEC_CITY_ZONING_PORTAL_URL
    if city == "montreal":
        return _MONTREAL_PUM_URL
    return None


def _property_lot_m2(prop: Property) -> tuple[Optional[float], Optional[str]]:
    """Best available lot area in m² — prefer the official assessment roll."""
    ad = prop.assessment_data or {}
    if ad.get("lot_area_m2"):
        return float(ad["lot_area_m2"]), "assessment_roll"
    if prop.lot_sqft:
        return float(prop.lot_sqft) / 10.7639, "listing"
    return None, None


def _build_zoning_info(prop: Property) -> Optional[ZoningInfo]:
    zone = prop.zoning_zone
    if not zone:
        return None
    rules = zone.rules or {}
    decode_table_page = rules.get("decode_table_page")

    lot_m2, lot_source = _property_lot_m2(prop)
    est = estimate_max_units(lot_m2, rules)

    return ZoningInfo(
        zone_code=zone.zone_code,
        city=zone.city,
        type_milieu=rules.get("type_milieu"),
        allowed_uses=rules.get("allowed_uses"),
        bylaw_reference=zone.bylaw_reference,
        confidence=rules.get("confidence", "geometry_only"),
        data_version=zone.data_version,
        matched_at=prop.zoning_matched_at,
        max_units=rules.get("max_units"),
        is_open_ended=rules.get("is_open_ended"),
        contigu_permitted=rules.get("contigu_permitted"),
        decode_table_page=decode_table_page,
        permitted_tiers=rules.get("permitted_tiers"),
        source_document_url=_source_document_url(zone.city, decode_table_page),
        estimated_max_units=est.get("units"),
        estimate_method=est.get("method"),
        max_coverage_pct=est.get("max_coverage_pct"),
        max_storeys=est.get("max_storeys"),
        estimate_lot_m2=lot_m2,
        estimate_lot_source=lot_source,
        affectation=rules.get("affectation"),
        intensification=rules.get("intensification"),
        min_density_per_ha=rules.get("density_per_ha"),
        plan_name=rules.get("plan_name"),
    )


def _lowest_price_source(sources: list) -> tuple[Optional[str], Optional[float]]:
    priced = [s for s in sources if s.is_active and s.last_price is not None]
    if not priced:
        return None, None
    cheapest = min(priced, key=lambda s: s.last_price)
    return cheapest.source.value, cheapest.last_price


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PropertyListResponse)
async def list_properties(
    # Filters
    city:          Optional[str] = Query(None),
    address:       Optional[str] = Query(None),
    mls_number:    Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    score_min:     int           = Query(0, ge=0, le=100),
    score_max:     int           = Query(100, ge=0, le=100),
    price_min:     Optional[float] = Query(None),
    price_max:     Optional[float] = Query(None),
    status:        Optional[str] = Query(None),
    multi_site:    Optional[bool] = Query(None),
    has_sqft:      Optional[bool] = Query(None),
    listed_within: Optional[str] = Query(None),  # 24h | 48h | 7d | 30d
    # Sorting
    sort_by: Literal["score", "price", "price_asc", "price_desc", "newest", "discount"] = Query("score"),
    # Pagination
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: Optional[Broker] = Depends(get_current_user_optional),
) -> PropertyListResponse:

    stmt = select(Property).where(Property.asking_price.isnot(None))

    # Filters
    if city:
        # Accent-insensitive: listings store "Montréal"/"Québec" but users type
        # "montreal"/"quebec". Fold the column's French accents via translate()
        # (no DB extension needed) and de-accent the query in Python.
        from app.services.quebec_address import deaccent
        folded_city = func.translate(
            func.lower(Property.city),
            "àâäéèêëîïôöûüùç", "aaaeeeeiioouuuc",
        )
        stmt = stmt.where(folded_city.contains(deaccent(city).lower()))
    if address:
        # Same accent-fold as city — matches anywhere in the full address
        # ("975 - 977, Avenue Royale, Québec" found by "avenue royale" or "975").
        from app.services.quebec_address import deaccent
        folded_address = func.translate(
            func.lower(Property.full_address),
            "àâäéèêëîïôöûüùç", "aaaeeeeiioouuuc",
        )
        stmt = stmt.where(folded_address.contains(deaccent(address).lower()))
    if mls_number:
        stmt = stmt.where(func.lower(Property.mls_number).contains(mls_number.lower()))
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
    if multi_site:
        multi_sub = (
            select(PropertySource.property_id)
            .where(PropertySource.is_active == True)
            .group_by(PropertySource.property_id)
            .having(func.count(PropertySource.id) > 1)
            .subquery()
        )
        stmt = stmt.where(Property.id.in_(select(multi_sub.c.property_id)))
    if has_sqft:
        stmt = stmt.where(Property.sqft_total.isnot(None))
    if listed_within:
        _delta_map = {"24h": timedelta(hours=24), "48h": timedelta(hours=48),
                      "7d": timedelta(days=7), "30d": timedelta(days=30)}
        delta = _delta_map.get(listed_within)
        if delta:
            cutoff = datetime.now(timezone.utc) - delta
            stmt = stmt.where(Property.first_seen_at >= cutoff)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Sort
    if sort_by == "score":
        stmt = stmt.order_by(Property.score.desc().nullslast())
    elif sort_by in ("price", "price_asc"):
        stmt = stmt.order_by(Property.asking_price.asc())
    elif sort_by == "price_desc":
        stmt = stmt.order_by(Property.asking_price.desc())
    elif sort_by == "newest":
        stmt = stmt.order_by(Property.first_seen_at.desc())
    elif sort_by == "discount":
        stmt = stmt.order_by(Property.discount_pct.desc().nullslast())

    # Paginate + eager load sources + zoning_zone (3 queries total, no N+1 —
    # selectinload batches one IN-query per relationship regardless of page size)
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size).options(
        selectinload(Property.sources), selectinload(Property.zoning_zone),
    )

    result = await db.execute(stmt)
    items = list(result.scalars().all())
    pages = max(1, -(-total // page_size))  # ceiling division

    cards = []
    for p in items:
        src_name, src_price = _lowest_price_source(p.sources)
        card = PropertyCard.model_validate(p)
        card.multi_site_count    = len([s for s in p.sources if s.is_active])
        card.lowest_price_source = src_name
        card.lowest_price        = src_price
        if p.zoning_zone:
            lot_m2, _ = _property_lot_m2(p)
            est = estimate_max_units(lot_m2, p.zoning_zone.rules or {})
            if est.get("units") is not None:
                card.zoning_max_units = est["units"]
                card.zoning_upside    = est["units"] > _current_units(p)
        cards.append(card)

    if user:
        filters_used = {
            k: v for k, v in {
                "city": city, "mls_number": mls_number, "property_type": property_type,
                "score_min": score_min if score_min > 0 else None,
                "score_max": score_max if score_max < 100 else None,
                "price_min": price_min, "price_max": price_max, "status": status,
                "multi_site": multi_site, "has_sqft": has_sqft, "listed_within": listed_within,
                "sort_by": sort_by if sort_by != "score" else None,
            }.items() if v is not None
        }
        await log_event(db, user.id, EventType.SEARCH, filters_used)

    return PropertyListResponse(
        items=cards,
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
    now        = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    total = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.status.in_([PropertyStatus.ACTIVE, PropertyStatus.PRICE_CHANGED]))
    ) or 0

    new_today = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.first_seen_at >= cutoff_24h)
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

    market_price = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.score >= 40)
        .where(Property.score < 60)
    ) or 0

    not_recommended = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.score.isnot(None))
        .where(Property.score < 40)
    ) or 0

    price_drops = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.status == PropertyStatus.PRICE_CHANGED)
        .where(Property.last_seen_at >= cutoff_24h)
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

    multi_site_sub = (
        select(PropertySource.property_id)
        .where(PropertySource.is_active == True)
        .group_by(PropertySource.property_id)
        .having(func.count(PropertySource.id) > 1)
        .subquery()
    )
    multi_site_count = await db.scalar(
        select(func.count()).select_from(multi_site_sub)
    ) or 0

    return StatsResponse(
        total_properties=total,
        new_today=new_today,
        strong_opportunities=strong,
        worth_investigating=investigating,
        market_price=market_price,
        not_recommended=not_recommended,
        price_drops_today=price_drops,
        avg_score=round(float(avg_score), 1) if avg_score else None,
        cities=cities,
        multi_site_properties=multi_site_count,
    )


# ── Map data (must be before /{property_id} to avoid UUID parse collision) ────

@router.get("/map")
async def get_map_data(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Lightweight coordinates + score data for the map view. Max 1000 points."""
    stmt = select(
        Property.id,
        Property.full_address,
        Property.city,
        Property.asking_price,
        Property.score,
        Property.score_category,
        Property.photos,
        func.ST_Y(Property.location).label("lat"),
        func.ST_X(Property.location).label("lng"),
    ).where(
        Property.location.isnot(None),
        Property.asking_price.isnot(None),
    ).order_by(Property.score.desc().nullslast()).limit(1000)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "id":             str(row.id),
            "full_address":   row.full_address,
            "city":           row.city,
            "asking_price":   row.asking_price,
            "score":          row.score,
            "score_category": row.score_category.value if row.score_category else None,
            "photo":          (row.photos or [None])[0],
            "lat":            float(row.lat),
            "lng":            float(row.lng),
        }
        for row in rows
        if row.lat is not None and row.lng is not None
    ]


# ── Address typeahead (must be before /{property_id} too) ─────────────────────

@router.get("/suggest")
async def suggest_properties(
    q: str = Query(..., min_length=2),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Address-search autocomplete — as the user types, suggest matching
    listings so they can jump straight to one instead of scanning the list."""
    from app.services.quebec_address import deaccent
    folded_address = func.translate(
        func.lower(Property.full_address),
        "àâäéèêëîïôöûüùç", "aaaeeeeiioouuuc",
    )
    stmt = (
        select(Property.id, Property.full_address, Property.city, Property.asking_price, Property.score)
        .where(Property.asking_price.isnot(None))
        .where(folded_address.contains(deaccent(q).lower()))
        .order_by(Property.score.desc().nullslast())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id":           str(row.id),
            "full_address": row.full_address,
            "city":         row.city,
            "asking_price": row.asking_price,
            "score":        row.score,
        }
        for row in rows
    ]


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/{property_id}", response_model=PropertyDetail)
async def get_property(
    property_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: Optional[Broker] = Depends(get_current_user_optional),
) -> PropertyDetail:
    prop = await db.scalar(
        select(Property)
        .where(Property.id == property_id)
        .options(selectinload(Property.sources), selectinload(Property.zoning_zone))
    )
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    if user:
        await log_event(db, user.id, EventType.PROPERTY_VIEW, {"property_id": str(property_id)})

    src_name, src_price = _lowest_price_source(prop.sources)
    detail = PropertyDetail.model_validate(prop)
    detail.cross_site_prices    = _build_cross_site_prices(prop.sources)
    detail.multi_site_count     = len([s for s in prop.sources if s.is_active])
    detail.lowest_price_source  = src_name
    detail.lowest_price         = src_price
    detail.zoning                = _build_zoning_info(prop)
    detail.rebuild_economics     = RebuildEconomicsInfo(**prop.rebuild_economics) if prop.rebuild_economics else None
    detail.assessment            = AssessmentInfo(**prop.assessment_data) if prop.assessment_data else None
    detail.constraints           = [
        ConstraintFlag(
            type=c["type"], name=c.get("name"), source_url=c.get("source_url"),
            explanation=c.get("explanation") or CONSTRAINT_EXPLAIN.get(c["type"]),
        )
        for c in (prop.development_constraints or [])
    ] or None
    return detail


# ── Zoning boundary (for the map overlay) ──────────────────────────────────────

@router.get("/{property_id}/zoning/boundary")
async def get_zoning_boundary(
    property_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Zone polygon + property point as GeoJSON, for the Zoning tab's embedded map.

    Geometry is simplified server-side (ST_SimplifyPreserveTopology, ~11m
    tolerance) — some zone polygons have thousands of vertices, and shipping
    full-resolution geometry on every property-page view doesn't scale.
    Cached for an hour: zone boundaries change on a weekly/monthly refresh
    cycle at most, so there's no reason to recompute the simplification (a
    real CPU cost) on every request under real traffic.
    """
    prop = await db.scalar(select(Property).where(Property.id == property_id))
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if not prop.zoning_zone_id:
        raise HTTPException(status_code=404, detail="No zoning match for this property")

    row = (await db.execute(text("""
        SELECT
            ST_AsGeoJSON(ST_SimplifyPreserveTopology(z.geometry, 0.0001)) AS zone_geojson,
            ST_AsGeoJSON(p.location) AS point_geojson,
            z.zone_code
        FROM zoning_zones z
        JOIN properties p ON p.id = :prop_id
        WHERE z.id = :zone_id
    """), {"zone_id": str(prop.zoning_zone_id), "prop_id": str(property_id)})).first()

    if not row or not row.zone_geojson:
        raise HTTPException(status_code=404, detail="Zone geometry not found")

    response.headers["Cache-Control"] = "public, max-age=3600"
    return {
        "zone_code":      row.zone_code,
        "zone_geometry":  json.loads(row.zone_geojson),
        "property_point": json.loads(row.point_geojson) if row.point_geojson else None,
    }


# ── Comparable properties list ────────────────────────────────────────────────

@router.get("/{property_id}/comparables", response_model=list[ComparablePropertySchema])
async def get_comparables(
    property_id: uuid.UUID,
    by: str = Query("match", description="Comma-separated criteria: match | distance,price,sqft,type"),
    db: AsyncSession = Depends(get_db),
) -> list[ComparablePropertySchema]:
    """Return comparable properties for a property, ranked by the chosen lens(es).

    by=match           — the analysis pipeline's stored comparable set (same type,
                         nearby, price ±40%, similarity-scored). Falls back to a
                         live ComparableFinder run when not yet stored. Exclusive —
                         other criteria are ignored when match is present.
    by=distance        — nearest active listings of any type (requires coordinates)
    by=price           — active listings with the closest asking price
    by=sqft            — active listings with the closest living area
    by=type            — active listings of the same property type, best score first
    by=distance,price  — any comma-separated combination: 'type' filters to the
                         same property type; the numeric criteria are normalized
                         (distance/25 km, |Δprice|/price, |Δsqft|/sqft) and summed,
                         closest combined ranking first.
    """
    from geoalchemy2.functions import ST_Distance, ST_GeomFromEWKB
    from geoalchemy2.types import Geography
    from sqlalchemy import cast, null, Float

    from app.agent.comparables import ComparableFinder

    prop = await db.scalar(
        select(Property).where(Property.id == property_id)
    )
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    VALID_CRITERIA = {"match", "distance", "price", "sqft", "type"}
    criteria = {c.strip() for c in by.split(",") if c.strip()}
    if not criteria or not criteria <= VALID_CRITERIA:
        raise HTTPException(status_code=422, detail=f"by must be a comma-separated subset of {sorted(VALID_CRITERIA)}")

    MAX_RESULTS = 12

    # Distance expression — included in every mode so cards can show "x.x km"
    if prop.location is not None:
        prop_geo  = cast(ST_GeomFromEWKB(prop.location), Geography)
        dist_expr = ST_Distance(cast(Property.location, Geography), prop_geo).label("dist_m")
    else:
        dist_expr = cast(null(), Float).label("dist_m")

    base = (
        select(Property, dist_expr)
        .options(selectinload(Property.sources))
        .where(Property.id != prop.id)
        .where(Property.asking_price.isnot(None))
    )
    active = Property.status.in_([PropertyStatus.ACTIVE, PropertyStatus.PRICE_CHANGED])

    ordered_ids: list[uuid.UUID] = []   # preserves similarity rank in match mode

    if "match" in criteria:
        ids = prop.comparable_ids or []
        if not ids:
            # Fallback: run the finder live for properties not yet re-analyzed
            try:
                finder = ComparableFinder(db)
                comp_set = await finder.find(prop)
                ids = [str(c.property_id) for c in comp_set.comparables]
                prop.comparable_ids = ids
                await db.commit()
            except Exception as exc:
                logger.warning(f"Live comparable search failed for {property_id}: {exc}")
                return []
        try:
            ordered_ids = [uuid.UUID(i) for i in ids]
        except (ValueError, AttributeError):
            return []
        if not ordered_ids:
            return []
        stmt = base.where(Property.id.in_(ordered_ids))

    else:
        # Combined ranking: 'type' filters; numeric criteria are normalized to a
        # comparable scale and summed — the smallest combined difference first.
        stmt = base.where(active)
        rank_terms = []

        if "type" in criteria:
            stmt = stmt.where(Property.property_type == prop.property_type)

        if "distance" in criteria:
            if prop.location is None:
                return []
            stmt = stmt.where(Property.location.isnot(None))
            rank_terms.append(dist_expr / 25_000.0)          # 1.0 at 25 km

        if "price" in criteria:
            if not prop.asking_price:
                return []
            rank_terms.append(func.abs(Property.asking_price - prop.asking_price) / prop.asking_price)

        if "sqft" in criteria:
            if not prop.sqft_total:
                return []
            stmt = stmt.where(Property.sqft_total.isnot(None))
            rank_terms.append(func.abs(Property.sqft_total - prop.sqft_total) / float(prop.sqft_total))

        if rank_terms:
            combined = rank_terms[0]
            for term in rank_terms[1:]:
                combined = combined + term
            stmt = stmt.order_by(combined)
        else:  # only 'type' selected
            stmt = stmt.order_by(
                (Property.city == prop.city).desc(),
                Property.score.desc().nulls_last(),
            )

        stmt = stmt.limit(MAX_RESULTS)

    rows = (await db.execute(stmt)).unique().all()

    # Match mode: restore stored similarity order
    if ordered_ids:
        rank = {pid: i for i, pid in enumerate(ordered_ids)}
        rows = sorted(rows, key=lambda r: rank.get(r[0].id, len(rank)))

    result = []
    for c, dist_m in rows:
        listing_url = next(
            (s.source_url for s in (c.sources or []) if s.is_active and s.source_url),
            None,
        )
        result.append(ComparablePropertySchema(
            id=str(c.id),
            mls_number=c.mls_number,
            full_address=c.full_address,
            city=c.city,
            asking_price=c.asking_price,
            sqft_total=c.sqft_total,
            unit_count=c.unit_count,
            year_built=c.year_built,
            property_type=c.property_type.value if hasattr(c.property_type, 'value') else str(c.property_type),
            cap_rate=c.cap_rate,
            listing_url=listing_url,
            photos=(c.photos or [])[:1],
            distance_km=round(dist_m / 1000, 2) if dist_m is not None else None,
        ))

    return result


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

    try:
        pipeline = InvestmentPipeline(db, generate_brief=True)
        await pipeline.run(prop, force_brief=True)
        await db.commit()
        return {
            "status": "done",
            "property_id": str(property_id),
            "has_brief": bool(prop.ai_brief_en),
            "score": prop.score,
        }
    except Exception as exc:
        logger.error(f"Inline analysis failed for {property_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Analysis failed")


# ── Full Analysis (on-demand, not persisted) ──────────────────────────────────

@router.get("/{property_id}/full-analysis", response_model=FullAnalysisResponse)
async def get_full_analysis(
    property_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: Optional[Broker] = Depends(get_current_user_optional),
) -> FullAnalysisResponse:
    """
    Run a comprehensive investment analysis on-demand.
    Includes risk assessment, 5-year projection, renovation ROI,
    neighbourhood context, and an AI brief via Claude (requires ANTHROPIC_API_KEY).
    Results are NOT cached — every call recomputes fresh with live calc-engine tax data.
    """
    try:
        result = await run_full_analysis(property_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Full analysis failed for {property_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Analysis computation failed")

    if user:
        await log_event(db, user.id, EventType.ANALYSIS_VIEW, {"property_id": str(property_id)})

    fp = result.financial
    sc = result.score
    rk = result.risk
    pr = result.projection
    rn = result.renovation
    nb = result.neighbourhood

    return FullAnalysisResponse(
        property_id=str(result.property_id),
        full_address=result.full_address,
        financial=FinancialProfileSchema(
            comparable_count=fp.comparable_count,
            comparable_median_price=fp.comparable_median_price,
            comparable_mean_price=fp.comparable_mean_price,
            value_gap=fp.value_gap,
            discount_pct=fp.discount_pct,
            analysis_confidence=fp.analysis_confidence,
            search_radius_km=fp.search_radius_km,
            gross_rent_monthly=fp.gross_rent_monthly,
            gross_rent_annual=fp.gross_rent_annual,
            rent_is_estimated=fp.rent_is_estimated,
            vacancy_loss_annual=fp.vacancy_loss_annual,
            municipal_taxes_annual=fp.municipal_taxes_annual,
            school_taxes_annual=fp.school_taxes_annual,
            insurance_annual=fp.insurance_annual,
            maintenance_annual=fp.maintenance_annual,
            total_expenses_annual=fp.total_expenses_annual,
            noi_annual=fp.noi_annual,
            cap_rate=fp.cap_rate,
            grm=fp.grm,
            monthly_cash_flow=fp.monthly_cash_flow,
            cash_on_cash_return=fp.cash_on_cash_return,
            asking_price=fp.asking_price,
            down_payment=fp.down_payment,
            loan_amount=fp.loan_amount,
            monthly_mortgage=fp.monthly_mortgage,
            welcome_tax=fp.welcome_tax,
            total_cash_needed=fp.total_cash_needed,
        ),
        score=ScoreResultSchema(
            total=sc.total,
            category=sc.category.value,
            components=sc.components,
            strategy=sc.strategy,
        ),
        risk=RiskAssessmentSchema(
            items=[
                RiskItemSchema(
                    label=i.label,
                    severity=i.severity.value,
                    description=i.description,
                    mitigation=i.mitigation,
                )
                for i in rk.items
            ],
            overall_risk=rk.overall_risk.value,
        ),
        projection=FiveYearProjectionSchema(
            snapshots=[
                YearSnapshotSchema(
                    year=s.year,
                    property_value=s.property_value,
                    monthly_rent=s.monthly_rent,
                    noi=s.noi,
                    monthly_cash_flow=s.monthly_cash_flow,
                    equity=s.equity,
                    cumulative_cash_flow=s.cumulative_cash_flow,
                )
                for s in pr.snapshots
            ],
            total_return_pct=pr.total_return_pct,
            annualized_return=pr.annualized_return,
        ),
        renovation=RenovationROISchema(
            scenarios=[
                RenovationScenarioSchema(
                    label=s.label,
                    renovation_cost=s.renovation_cost,
                    rent_increase_per_unit=s.rent_increase_per_unit,
                    new_monthly_rent=s.new_monthly_rent,
                    new_noi=s.new_noi,
                    new_cap_rate=s.new_cap_rate,
                    new_cash_flow=s.new_cash_flow,
                    payback_years=s.payback_years,
                    roi_pct=s.roi_pct,
                )
                for s in rn.scenarios
            ],
        ),
        neighbourhood=NeighbourhoodContextSchema(
            sample_size=nb.sample_size,
            city_avg_price=nb.city_avg_price,
            city_avg_price_per_sqft=nb.city_avg_price_per_sqft,
            city_avg_cap_rate=nb.city_avg_cap_rate,
            city_avg_days_on_market=nb.city_avg_days_on_market,
            city_avg_score=nb.city_avg_score,
            price_vs_avg_pct=nb.price_vs_avg_pct,
            cap_rate_vs_avg_pct=nb.cap_rate_vs_avg_pct,
            score_vs_avg_pct=nb.score_vs_avg_pct,
            price_percentile=nb.price_percentile,
            cap_rate_percentile=nb.cap_rate_percentile,
            score_percentile=nb.score_percentile,
        ),
        ai_brief=result.ai_brief,
        computed_at=result.computed_at,
        sources=[
            DataSourceSchema(**src)
            for src in SOURCES.values()
        ],
    )
