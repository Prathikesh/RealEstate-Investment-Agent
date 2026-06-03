"""
Stage 1 — Comparable Finder.

Finds similar sold/active properties near the target using PostGIS.
Expands search radius until we have enough comps (min 3, target 7+).

Strategy when location is missing: falls back to city + property_type filter.
"""
import uuid
import logging
from dataclasses import dataclass
from typing import Optional

from geoalchemy2.functions import ST_DWithin, ST_Distance
from geoalchemy2.types import Geography
from sqlalchemy import select, cast, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property, PropertyStatus, PropertyType

logger = logging.getLogger(__name__)

SEARCH_RADII_KM = [2, 5, 10, 25]   # expand until MIN_COMPS found
MIN_COMPS = 3
MAX_COMPS = 10


@dataclass
class Comparable:
    property_id: uuid.UUID
    mls_number: Optional[str]
    full_address: str
    asking_price: float
    sqft_total: Optional[int]
    year_built: Optional[int]
    property_type: str
    distance_km: Optional[float]
    similarity_score: float         # 0.0 – 1.0


@dataclass
class ComparableSet:
    comparables: list[Comparable]
    search_radius_km: Optional[float]   # None = city fallback
    median_price: Optional[float]
    mean_price: Optional[float]
    confidence: str                      # "high" | "medium" | "low"

    @property
    def count(self) -> int:
        return len(self.comparables)


class ComparableFinder:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def find(self, prop: Property) -> ComparableSet:
        """Main entry point. Returns best comparable set found."""
        if prop.location is not None:
            result = await self._geo_search(prop)
            if result and result.count >= MIN_COMPS:
                return result

        # Fallback: city-based (no coordinates needed)
        return await self._city_search(prop)

    # ── PostGIS radius search ─────────────────────────────────────────────────

    async def _geo_search(self, prop: Property) -> Optional[ComparableSet]:
        for radius_km in SEARCH_RADII_KM:
            comps = await self._query_radius(prop, radius_km)
            if len(comps) >= MIN_COMPS:
                scored = self._score_and_rank(prop, comps, radius_km)
                return self._build_set(scored[:MAX_COMPS], radius_km)

        # Tried all radii — return whatever we have from widest search
        comps = await self._query_radius(prop, SEARCH_RADII_KM[-1])
        if comps:
            scored = self._score_and_rank(prop, comps, SEARCH_RADII_KM[-1])
            return self._build_set(scored[:MAX_COMPS], SEARCH_RADII_KM[-1])

        return None

    async def _query_radius(self, prop: Property, radius_km: float) -> list[Property]:
        """PostGIS ST_DWithin query using geography type for accurate km distances."""
        prop_geo   = cast(prop.location,     Geography)
        target_geo = cast(prop.location,     Geography)  # same point for distance calc

        stmt = (
            select(
                Property,
                ST_Distance(cast(Property.location, Geography), prop_geo).label("dist_m"),
            )
            .where(Property.id != prop.id)
            .where(Property.location.isnot(None))
            .where(Property.asking_price.isnot(None))
            .where(Property.status.in_([PropertyStatus.ACTIVE, PropertyStatus.PRICE_CHANGED]))
            .where(Property.property_type == prop.property_type)
            .where(
                ST_DWithin(
                    cast(Property.location, Geography),
                    prop_geo,
                    radius_km * 1000,
                )
            )
            .order_by("dist_m")
            .limit(30)
        )

        rows = (await self.session.execute(stmt)).all()

        # Apply loose price filter (±40%) to exclude outliers
        results: list[Property] = []
        for row_prop, dist_m in rows:
            if prop.asking_price:
                ratio = row_prop.asking_price / prop.asking_price
                if not (0.6 <= ratio <= 1.4):
                    continue
            results.append(row_prop)

        logger.debug(f"Radius {radius_km}km → {len(results)} comps for {prop.mls_number}")
        return results

    # ── City fallback ─────────────────────────────────────────────────────────

    async def _city_search(self, prop: Property) -> ComparableSet:
        stmt = (
            select(Property)
            .where(Property.id != prop.id)
            .where(Property.city == prop.city)
            .where(Property.asking_price.isnot(None))
            .where(Property.status.in_([PropertyStatus.ACTIVE, PropertyStatus.PRICE_CHANGED]))
            .where(Property.property_type == prop.property_type)
            .limit(30)
        )
        candidates = list((await self.session.scalars(stmt)).all())

        # Price filter ±40%
        if prop.asking_price:
            candidates = [
                c for c in candidates
                if 0.6 <= c.asking_price / prop.asking_price <= 1.4
            ]

        scored = self._score_and_rank(prop, candidates, radius_km=None)
        result = self._build_set(scored[:MAX_COMPS], radius_km=None)
        logger.info(
            f"City fallback ({prop.city}) → {result.count} comps | "
            f"confidence={result.confidence}"
        )
        return result

    # ── Scoring ───────────────────────────────────────────────────────────────

    @staticmethod
    def _score_and_rank(
        prop: Property,
        candidates: list[Property],
        radius_km: Optional[float],
    ) -> list[Comparable]:
        scored: list[Comparable] = []

        for c in candidates:
            score = 1.0

            # Sqft similarity (±15% is ideal)
            if prop.sqft_total and c.sqft_total:
                ratio = c.sqft_total / prop.sqft_total
                if ratio < 0.7 or ratio > 1.3:
                    score *= 0.5
                elif ratio < 0.85 or ratio > 1.15:
                    score *= 0.8

            # Year built similarity (±20 years)
            if prop.year_built and c.year_built:
                diff = abs(c.year_built - prop.year_built)
                if diff > 30:
                    score *= 0.5
                elif diff > 20:
                    score *= 0.7

            # Unit count match
            if prop.unit_count and c.unit_count and prop.unit_count != c.unit_count:
                score *= 0.7

            scored.append(Comparable(
                property_id=c.id,
                mls_number=c.mls_number,
                full_address=c.full_address,
                asking_price=c.asking_price,
                sqft_total=c.sqft_total,
                year_built=c.year_built,
                property_type=c.property_type.value,
                distance_km=None,   # filled by caller if available
                similarity_score=round(score, 3),
            ))

        return sorted(scored, key=lambda x: x.similarity_score, reverse=True)

    @staticmethod
    def _build_set(comps: list[Comparable], radius_km: Optional[float]) -> ComparableSet:
        if not comps:
            return ComparableSet([], radius_km, None, None, "low")

        prices = [c.asking_price for c in comps if c.asking_price]
        if not prices:
            return ComparableSet(comps, radius_km, None, None, "low")

        prices_sorted = sorted(prices)
        n = len(prices_sorted)
        median = (
            prices_sorted[n // 2]
            if n % 2 == 1
            else (prices_sorted[n // 2 - 1] + prices_sorted[n // 2]) / 2
        )
        mean = sum(prices) / len(prices)

        if n >= 7:
            confidence = "high"
        elif n >= 3:
            confidence = "medium"
        else:
            confidence = "low"

        return ComparableSet(
            comparables=comps,
            search_radius_km=radius_km,
            median_price=round(median, 0),
            mean_price=round(mean, 0),
            confidence=confidence,
        )
