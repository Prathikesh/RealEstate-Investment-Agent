"""
Constraint zone — a legal/physical overlay that limits or blocks development
regardless of the base zoning (a "deal-killer" a broker checks first).

Types:
  agricultural — Quebec's zone agricole (CPTAQ); can't change use without approval
  flood        — regulated flood zone; rebuild bans + lenders withdraw mortgages
  heritage     — protected; demolition/modification restricted

Matched to a property by point-in-polygon (property.location inside the overlay).
Sources are official municipal / provincial open data (see importer).
"""
import uuid
from datetime import datetime
from typing import Any, Optional

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class ConstraintZone(Base):
    __tablename__ = "constraint_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    constraint_type: Mapped[str] = mapped_column(String(30), index=True)   # agricultural | flood | heritage
    city:            Mapped[str] = mapped_column(String(100), index=True)
    name:            Mapped[Optional[str]] = mapped_column(String(200))

    geometry: Mapped[Any] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False), nullable=False
    )

    source_url:   Mapped[Optional[str]] = mapped_column(String(500))
    data_version: Mapped[Optional[str]] = mapped_column(String(50))
    is_active:    Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_constraint_zones_geometry", "geometry", postgresql_using="gist"),
    )
