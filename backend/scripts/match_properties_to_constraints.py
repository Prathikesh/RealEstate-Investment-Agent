"""
Flag existing properties that fall inside a development-constraint overlay
(agricultural / flood / heritage) via a single set-based PostGIS update.
Stores [{type, name, source_url}] on properties.development_constraints;
the explanation text is added at serve time from the type.

Run from backend/:  python scripts/match_properties_to_constraints.py
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("match_properties_to_constraints")

from sqlalchemy import text

from app.database import AsyncSessionLocal

UPDATE_SQL = text("""
    WITH hits AS (
        SELECT p.id,
               jsonb_agg(DISTINCT jsonb_build_object(
                   'type', c.constraint_type, 'name', c.name, 'source_url', c.source_url
               )) AS flags
        FROM properties p
        JOIN constraint_zones c
          ON c.is_active = true AND ST_Contains(c.geometry, p.location)
        WHERE p.location IS NOT NULL
        GROUP BY p.id
    )
    UPDATE properties p
    SET development_constraints = hits.flags
    FROM hits
    WHERE p.id = hits.id
""")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        # clear stale flags first (a property may have left a re-drawn overlay)
        await session.execute(text("UPDATE properties SET development_constraints = NULL WHERE development_constraints IS NOT NULL"))
        result = await session.execute(UPDATE_SQL)
        await session.commit()
        total = (await session.execute(
            text("SELECT count(*) FROM properties WHERE development_constraints IS NOT NULL")
        )).scalar()
        logger.info(f"Flagged {result.rowcount} properties; {total} now carry a development constraint")


if __name__ == "__main__":
    asyncio.run(main())
