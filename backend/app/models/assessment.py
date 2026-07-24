"""
Assessment parcel — one record from Quebec's official property assessment roll
(rôle d'évaluation foncière), the authoritative source for lot area and current
dwelling count. Keyed by a normalized address (see services/quebec_address.py)
so scraped listings can be matched to it.

Source: donneesquebec.ca — "Rôles d'évaluation foncière du Québec" (CC-BY 4.0).
One municipal roll file per city (e.g. RL65005 = Laval).
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AssessmentParcel(Base):
    __tablename__ = "assessment_parcels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    city:      Mapped[str] = mapped_column(String(100), index=True)   # "laval", "montreal"
    match_key: Mapped[str] = mapped_column(String(120), index=True)   # "<civic>|<street core>"

    # Official prescribed fields (Manuel d'évaluation foncière du Québec)
    lot_area_m2:   Mapped[Optional[float]] = mapped_column(Float)     # RL0302A — superficie du terrain
    num_dwellings: Mapped[Optional[int]]   = mapped_column(Integer)   # RL0310A — nombre de logements
    frontage_m:    Mapped[Optional[float]] = mapped_column(Float)     # RL0301A — mesure frontale
    year_built:    Mapped[Optional[int]]   = mapped_column(Integer)   # RL0307A — année de construction

    roll_year:  Mapped[Optional[str]] = mapped_column(String(8))      # e.g. "2026"
    source_url: Mapped[Optional[str]] = mapped_column(String(500))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("city", "match_key", name="uq_assessment_city_key"),
        Index("ix_assessment_city_key", "city", "match_key"),
    )
