"""
Match properties to the official assessment roll and cache the authoritative
lot area + current dwelling count on properties.assessment_data.

Matching is by normalized address (see services/quebec_address.py) since the
roll files carry no geometry. A property with no civic number, or whose civic
isn't in the roll, simply gets no match (assessment_data stays null) and the
pipeline falls back to scraped data with lower confidence.

Run from backend/:  python scripts/match_properties_to_assessment.py
"""
import asyncio
import json
import logging
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("match_properties_to_assessment")

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.assessment import AssessmentParcel
from app.models.property import Property
from app.services.quebec_address import full_address_match_key, deaccent


def assessment_city(city: str) -> str:
    """Map a listing city ('Laval (Vimont)') to the roll city key ('laval')."""
    base = (city or "").split("(")[0].strip()
    return deaccent(base).lower()


async def main() -> None:
    async with AsyncSessionLocal() as session:
        cities = set((await session.execute(select(AssessmentParcel.city).distinct())).scalars())
        logger.info(f"Assessment data available for cities: {sorted(cities)}")

        # Load each available city's parcels into memory once (indexed lookup dict)
        parcels: dict[tuple[str, str], AssessmentParcel] = {}
        for c in cities:
            rows = (await session.execute(
                select(AssessmentParcel).where(AssessmentParcel.city == c)
            )).scalars().all()
            for r in rows:
                parcels[(c, r.match_key)] = r
        logger.info(f"Loaded {len(parcels):,} parcels into memory")

        props = (await session.execute(
            select(Property).where(Property.full_address.isnot(None))
        )).scalars().all()

        matched = considered = 0
        for p in props:
            ac = assessment_city(p.city)
            if ac not in cities:
                continue
            considered += 1
            key = full_address_match_key(p.full_address)
            hit = parcels.get((ac, key)) if key else None
            if not hit:
                continue
            p.assessment_data = {
                "lot_area_m2":   hit.lot_area_m2,
                "num_dwellings": hit.num_dwellings,
                "frontage_m":    hit.frontage_m,
                "year_built":    hit.year_built,
                "roll_year":     hit.roll_year,
                "source_url":    hit.source_url,
            }
            matched += 1

        await session.commit()
        pct = round(100 * matched / considered) if considered else 0
        logger.info(f"Matched {matched}/{considered} properties in covered cities ({pct}%)")


if __name__ == "__main__":
    asyncio.run(main())
