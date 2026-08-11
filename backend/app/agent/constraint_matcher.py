"""
Constraint Matcher — pipeline stage that flags development deal-killers by
point-in-polygon: does the property sit inside an agricultural / flood /
heritage overlay? Returns a list of flags cached on the property. These are
what a broker checks before getting excited about buildable potential.
"""
from typing import Optional

from geoalchemy2.functions import ST_Contains, ST_GeomFromEWKB
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.constraint import ConstraintZone
from app.models.property import Property

# Investor-facing explanation per constraint type.
CONSTRAINT_EXPLAIN = {
    "agricultural": "In Quebec's agricultural zone (CPTAQ) — use cannot be changed "
                    "and development is blocked without Commission approval.",
    "flood":        "Government flood-risk mapping flags this location — this is indicative "
                    "screening data, not a final regulatory determination. Verify with the "
                    "municipality/CMM before treating it as a deal-killer.",
    "heritage":     "Heritage-protected — demolition and exterior changes are restricted.",
}


class ConstraintMatcher:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def match(self, prop: Property) -> list[dict]:
        if prop.location is None:
            return []
        rows = (await self.session.execute(
            select(ConstraintZone)
            .where(ConstraintZone.is_active == True)  # noqa: E712
            .where(ST_Contains(ConstraintZone.geometry, ST_GeomFromEWKB(prop.location)))
        )).scalars().all()

        seen: set[str] = set()
        flags: list[dict] = []
        for z in rows:
            if z.constraint_type in seen:
                continue
            seen.add(z.constraint_type)
            flags.append({
                "type":        z.constraint_type,
                "name":        z.name,
                "explanation": CONSTRAINT_EXPLAIN.get(z.constraint_type, ""),
                "source_url":  z.source_url,
            })
        return flags
