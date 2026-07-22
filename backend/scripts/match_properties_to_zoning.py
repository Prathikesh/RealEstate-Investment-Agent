"""
Match every property with coordinates against zoning_zones (point-in-polygon)
and cache the match on properties.zoning_zone_id.

This is intentionally a single set-based SQL UPDATE (not a Python loop per
property) — PostGIS does the point-in-polygon check server-side, which is
what makes this fast even across thousands of properties.

Run from backend/ with:  python scripts/match_properties_to_zoning.py
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("match_properties_to_zoning")

from sqlalchemy import text

from app.database import AsyncSessionLocal

MATCH_SQL = text("""
    UPDATE properties p
    SET zoning_zone_id   = z.id,
        zoning_matched_at = now()
    FROM zoning_zones z
    WHERE p.location IS NOT NULL
      AND z.is_active = true
      AND ST_Contains(z.geometry, p.location)
""")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        total = (await session.execute(text(
            "SELECT count(*) FROM properties WHERE location IS NOT NULL"
        ))).scalar()
        logger.info(f"{total} properties have coordinates — running point-in-polygon match...")

        result = await session.execute(MATCH_SQL)
        await session.commit()
        logger.info(f"Matched (updated) {result.rowcount} property rows")

        matched = (await session.execute(text(
            "SELECT count(*) FROM properties WHERE zoning_zone_id IS NOT NULL"
        ))).scalar()
        by_city = (await session.execute(text("""
            SELECT z.city, count(*) FROM properties p
            JOIN zoning_zones z ON z.id = p.zoning_zone_id
            GROUP BY z.city ORDER BY count(*) DESC
        """))).all()

        logger.info(f"Total properties with a zoning match: {matched}")
        for city, count in by_city:
            logger.info(f"  {city}: {count}")


if __name__ == "__main__":
    asyncio.run(main())
