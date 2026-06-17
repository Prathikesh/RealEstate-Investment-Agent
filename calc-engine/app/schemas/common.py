from decimal import Decimal
from enum import Enum
from typing import Annotated

from pydantic import Field


# Constrained Decimal types — all money uses Decimal, never float
Money = Annotated[Decimal, Field(ge=0, decimal_places=2)]
Rate = Annotated[Decimal, Field(ge=0, le=100, decimal_places=6)]   # percentage
MillRate = Annotated[Decimal, Field(ge=0, decimal_places=6)]        # per $1,000


class PropertyType(str, Enum):
    RESIDENTIAL = "residential"
    CONDO = "condo"
    DUPLEX = "duplex"
    TRIPLEX = "triplex"
    PLEX_4_TO_6 = "plex_4_to_6"
    COMMERCIAL = "commercial"
    MIXED_USE = "mixed_use"
    LAND = "land"


class OwnershipType(str, Enum):
    PRIMARY_RESIDENCE = "primary_residence"
    INVESTMENT = "investment"
    VACATION = "vacation"
    COMMERCIAL = "commercial"
