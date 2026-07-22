"""
Zoning Matcher — finds the municipal zone containing a property's coordinates
(point-in-polygon against zoning_zones) as a normal pipeline stage, so every
analyzed property stays current automatically rather than depending on a
separately-run script.
"""
from typing import Optional

from geoalchemy2.functions import ST_Contains, ST_GeomFromEWKB
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property, PropertyType
from app.models.zoning import ZoningZone

_UNIT_COUNT_BY_TYPE = {
    PropertyType.SINGLE_FAMILY: 1, PropertyType.CONDO: 1, PropertyType.TOWNHOUSE: 1,
    PropertyType.DUPLEX: 2, PropertyType.TRIPLEX: 3,
    PropertyType.QUADRUPLEX: 4, PropertyType.QUINTUPLEX_PLUS: 5,
}


def current_units(prop: Property) -> int:
    return prop.unit_count or _UNIT_COUNT_BY_TYPE.get(prop.property_type, 1)


class ZoningMatcher:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def match(self, prop: Property) -> Optional[ZoningZone]:
        if prop.location is None:
            return None
        return await self.session.scalar(
            select(ZoningZone)
            .where(ZoningZone.is_active == True)  # noqa: E712
            .where(ST_Contains(ZoningZone.geometry, ST_GeomFromEWKB(prop.location)))
            .limit(1)
        )
