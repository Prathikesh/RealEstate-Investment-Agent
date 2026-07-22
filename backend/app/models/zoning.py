"""
Zoning zone — one municipal zoning polygon with its decoded building rules.
Populated by per-city importers (see scripts/import_zoning_*.py), refreshed on
a schedule. Feeds the pipeline's zoning-potential stage (property.location is
matched against these polygons to find current vs. permitted development).
"""
import uuid
from datetime import datetime
from typing import Any, Optional

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class ZoningZone(Base):
    __tablename__ = "zoning_zones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    city:      Mapped[str] = mapped_column(String(100), index=True)   # "quebec_city", "laval"
    zone_code: Mapped[str] = mapped_column(String(50), index=True)    # "13012Mb", "328"

    geometry: Mapped[Any] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
        nullable=False,
    )

    # Normalized rules — same shape regardless of how the source city encodes them.
    # {max_units, max_storeys, density_per_ha, min_lot_sqft, allowed_uses: [...], confidence}
    rules: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Raw source row, kept so rules can be re-decoded later without re-downloading.
    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB)

    bylaw_reference: Mapped[Optional[str]] = mapped_column(String(200))
    source_url:      Mapped[Optional[str]] = mapped_column(String(500))
    data_version:    Mapped[Optional[str]] = mapped_column(String(50))

    is_active:  Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_zoning_zones_geometry", "geometry", postgresql_using="gist"),
        UniqueConstraint("city", "zone_code", name="uq_zoning_city_zone_code"),
    )

    def __repr__(self) -> str:
        return f"<ZoningZone {self.city}:{self.zone_code}>"


class ZoningZoneHistory(Base):
    """Audit trail — one row per detected rule change for a zone."""
    __tablename__ = "zoning_zone_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zoning_zones.id", ondelete="CASCADE"), index=True
    )
    old_rules:  Mapped[Optional[dict]] = mapped_column(JSONB)
    new_rules:  Mapped[dict] = mapped_column(JSONB)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
