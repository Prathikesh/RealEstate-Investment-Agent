"""
Assessment Matcher — pipeline stage that links a property to its official
assessment-roll parcel (authoritative lot area + current dwelling count) by
normalized address. Runs on every analysis so newly scraped properties get
official data automatically. Returns None when no parcel matches (property
then falls back to scraped data).
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment import AssessmentParcel
from app.models.property import Property
from app.services.quebec_address import deaccent, full_address_match_key


def assessment_city(city: Optional[str]) -> str:
    """Map a listing city ('Laval (Vimont)') to the roll city key ('laval')."""
    base = (city or "").split("(")[0].strip()
    return deaccent(base).lower()


class AssessmentMatcher:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def match(self, prop: Property) -> Optional[dict]:
        key = full_address_match_key(prop.full_address)
        if not key:
            return None
        parcel = await self.session.scalar(
            select(AssessmentParcel)
            .where(AssessmentParcel.city == assessment_city(prop.city))
            .where(AssessmentParcel.match_key == key)
            .limit(1)
        )
        if not parcel:
            return None
        return {
            "lot_area_m2":   parcel.lot_area_m2,
            "num_dwellings": parcel.num_dwellings,
            "frontage_m":    parcel.frontage_m,
            "year_built":    parcel.year_built,
            "roll_year":     parcel.roll_year,
            "source_url":    parcel.source_url,
        }
