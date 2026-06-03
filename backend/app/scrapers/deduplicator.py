"""
Property deduplicator — takes RawProperty from any scraper and upserts into DB.

Deduplication strategy:
  1. MLS number — primary key shared by Centris, Realtor, Zolo
  2. Address hash — fallback for DuProprio (no MLS); SHA-256 of normalized address+city

On each call:
  - Finds or creates the properties row
  - Detects price changes, updates price_history
  - Upserts property_sources (one row per source per property)
  - Creates a property_snapshot (immutable audit record)
  - Sets needs_reanalysis=True when financially significant data changes
"""
import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property, PropertyStatus, PropertyType
from app.models.snapshot import PropertySnapshot, ScraperSource
from app.models.source import PropertySource
from app.scrapers.base import RawProperty

logger = logging.getLogger(__name__)

PROPERTY_TYPE_MAP: dict[str, PropertyType] = {
    "duplex":          PropertyType.DUPLEX,
    "triplex":         PropertyType.TRIPLEX,
    "quadruplex":      PropertyType.QUADRUPLEX,
    "quintuplex_plus": PropertyType.QUINTUPLEX_PLUS,
    "single_family":   PropertyType.SINGLE_FAMILY,
    "condo":           PropertyType.CONDO,
    "townhouse":       PropertyType.TOWNHOUSE,
}


class PropertyDeduplicator:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def process(self, raw: RawProperty) -> tuple[Property, bool]:
        """
        Upsert one RawProperty into the database.
        Returns (property, is_new).
        """
        now = datetime.now(timezone.utc)
        changes: dict = {}

        existing = await self._find_existing(raw)

        if existing:
            changes = self._detect_changes(existing, raw)
            self._update_property(existing, raw, changes, now)
            is_new = False
        else:
            existing = self._create_property(raw, now)
            self.session.add(existing)
            is_new = True

        await self.session.flush()  # ensure existing.id is populated

        await self._upsert_source(existing, raw, now)
        self._add_snapshot(existing, raw, changes, now)

        return existing, is_new

    # ── Find ──────────────────────────────────────────────────────────────────

    async def _find_existing(self, raw: RawProperty) -> Optional[Property]:
        if raw.mls_number:
            return (await self.session.scalars(
                select(Property).where(Property.mls_number == raw.mls_number)
            )).first()

        if raw.full_address:
            return (await self.session.scalars(
                select(Property).where(
                    Property.address_hash == self._address_hash(raw)
                )
            )).first()

        return None

    # ── Create ────────────────────────────────────────────────────────────────

    def _create_property(self, raw: RawProperty, now: datetime) -> Property:
        price_history = []
        if raw.asking_price:
            price_history = [{
                "price": raw.asking_price,
                "date":  now.date().isoformat(),
                "source": raw.source,
                "event": "listed",
            }]

        return Property(
            mls_number=raw.mls_number,
            address_hash=None if raw.mls_number else self._address_hash(raw),
            full_address=raw.full_address or "Unknown",
            street_number=raw.street_number,
            street_name=raw.street_name,
            city=raw.city or "Unknown",
            neighborhood=raw.neighborhood,
            postal_code=raw.postal_code,
            province="QC",
            location=self._make_point(raw),
            property_type=self._map_type(raw.property_type),
            unit_count=raw.unit_count,
            bedrooms_total=raw.bedrooms_total,
            bathrooms_total=raw.bathrooms_total,
            sqft_total=raw.sqft_total,
            lot_sqft=raw.lot_sqft,
            year_built=raw.year_built,
            parking_spaces=raw.parking_spaces,
            floors=raw.floors,
            asking_price=raw.asking_price,
            price_per_sqft=self._calc_ppsf(raw),
            price_history=price_history,
            status=PropertyStatus.ACTIVE,
            days_on_market=raw.days_on_market,
            active_sources=[raw.source],
            primary_source=raw.source,
            listing_url=raw.source_url,
            photos=raw.photos or [],
            description=raw.description,
            rental_income_monthly=raw.rental_income_monthly,
            municipal_taxes_annual=raw.municipal_taxes_annual,
            school_taxes_annual=raw.school_taxes_annual,
            condo_fees_monthly=raw.condo_fees_monthly,
            raw_expenses={},
            is_new=True,
            needs_reanalysis=True,
            first_seen_at=now,
            last_seen_at=now,
            last_scraped_at=now,
        )

    # ── Update ────────────────────────────────────────────────────────────────

    def _update_property(
        self,
        prop: Property,
        raw: RawProperty,
        changes: dict,
        now: datetime,
    ) -> None:
        prop.last_seen_at = now
        prop.last_scraped_at = now
        prop.is_new = False

        # Merge source into active_sources
        sources = list(prop.active_sources or [])
        if raw.source not in sources:
            prop.active_sources = [*sources, raw.source]

        # Price change
        if "price" in changes:
            prop.asking_price = raw.asking_price
            prop.price_per_sqft = self._calc_ppsf(raw)
            prop.status = PropertyStatus.PRICE_CHANGED
            prop.needs_reanalysis = True
            history = list(prop.price_history or [])
            history.append({
                "price":  raw.asking_price,
                "date":   now.date().isoformat(),
                "source": raw.source,
                "event":  "price_reduction" if changes["price"]["delta"] < 0 else "price_increase",
            })
            prop.price_history = history

        # Fill in missing fields from this source (never overwrite good data)
        self._fill_gaps(prop, raw)

    @staticmethod
    def _fill_gaps(prop: Property, raw: RawProperty) -> None:
        """Copy fields from raw into prop only when prop has no value yet."""
        pairs = [
            ("sqft_total",              raw.sqft_total),
            ("year_built",              raw.year_built),
            ("unit_count",              raw.unit_count),
            ("bedrooms_total",          raw.bedrooms_total),
            ("bathrooms_total",         raw.bathrooms_total),
            ("parking_spaces",          raw.parking_spaces),
            ("floors",                  raw.floors),
            ("neighborhood",            raw.neighborhood),
            ("postal_code",             raw.postal_code),
            ("description",             raw.description),
            ("rental_income_monthly",   raw.rental_income_monthly),
            ("municipal_taxes_annual",  raw.municipal_taxes_annual),
            ("school_taxes_annual",     raw.school_taxes_annual),
            ("condo_fees_monthly",      raw.condo_fees_monthly),
        ]
        for attr, value in pairs:
            if value and not getattr(prop, attr):
                setattr(prop, attr, value)
                if attr in ("sqft_total", "unit_count", "rental_income_monthly"):
                    prop.needs_reanalysis = True

        if raw.photos and not prop.photos:
            prop.photos = raw.photos
        if raw.raw_data.get("lat") and not prop.location:
            from app.scrapers.deduplicator import PropertyDeduplicator
            prop.location = PropertyDeduplicator._make_point(raw)

    # ── Change detection ──────────────────────────────────────────────────────

    @staticmethod
    def _detect_changes(existing: Property, raw: RawProperty) -> dict:
        changes: dict = {}
        if (
            raw.asking_price
            and existing.asking_price
            and abs(raw.asking_price - existing.asking_price) > 500
        ):
            changes["price"] = {
                "old":   existing.asking_price,
                "new":   raw.asking_price,
                "delta": raw.asking_price - existing.asking_price,
            }
        return changes

    # ── Source upsert ─────────────────────────────────────────────────────────

    async def _upsert_source(
        self, prop: Property, raw: RawProperty, now: datetime
    ) -> None:
        source_enum = self._map_source(raw.source)
        if not source_enum:
            return

        stmt = (
            pg_insert(PropertySource)
            .values(
                property_id=prop.id,
                source=source_enum,
                source_url=raw.source_url,
                source_listing_id=raw.source_listing_id,
                is_active=True,
                last_price=raw.asking_price,
                has_price=raw.asking_price is not None,
                has_rental_income=raw.rental_income_monthly is not None,
                has_expenses=(
                    raw.municipal_taxes_annual is not None
                    or raw.school_taxes_annual is not None
                ),
                has_photos=bool(raw.photos),
                has_sqft=raw.sqft_total is not None,
                has_year_built=raw.year_built is not None,
                first_seen_at=now,
                last_seen_at=now,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(
                constraint="uq_property_source",
                set_={
                    "source_url":        raw.source_url,
                    "is_active":         True,
                    "last_price":        raw.asking_price,
                    "has_price":         raw.asking_price is not None,
                    "has_rental_income": raw.rental_income_monthly is not None,
                    "has_expenses":      raw.municipal_taxes_annual is not None,
                    "has_photos":        bool(raw.photos),
                    "has_sqft":          raw.sqft_total is not None,
                    "has_year_built":    raw.year_built is not None,
                    "last_seen_at":      now,
                    "updated_at":        now,
                },
            )
        )
        await self.session.execute(stmt)

    # ── Snapshot ──────────────────────────────────────────────────────────────

    def _add_snapshot(
        self,
        prop: Property,
        raw: RawProperty,
        changes: dict,
        now: datetime,
    ) -> None:
        source_enum = self._map_source(raw.source)
        if not source_enum:
            return

        self.session.add(PropertySnapshot(
            property_id=prop.id,
            source=source_enum,
            raw_data=raw.raw_data,
            price_at_scrape=raw.asking_price,
            status_at_scrape="active",
            changes_detected=changes or None,
            triggered_reanalysis=bool(changes),
            scraped_at=raw.scraped_at or now,
        ))

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _map_type(raw_type: Optional[str]) -> PropertyType:
        if not raw_type:
            return PropertyType.TRIPLEX
        return PROPERTY_TYPE_MAP.get(raw_type.lower(), PropertyType.SINGLE_FAMILY)

    @staticmethod
    def _map_source(source: str) -> Optional[ScraperSource]:
        try:
            return ScraperSource(source.lower())
        except ValueError:
            logger.warning(f"Unknown scraper source: '{source}'")
            return None

    @staticmethod
    def _address_hash(raw: RawProperty) -> str:
        text = f"{raw.full_address or ''} {raw.city or ''}".lower()
        text = re.sub(r"[^\w ]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return hashlib.sha256(text.encode()).hexdigest()

    @staticmethod
    def _calc_ppsf(raw: RawProperty) -> Optional[float]:
        if raw.asking_price and raw.sqft_total and raw.sqft_total > 0:
            return round(raw.asking_price / raw.sqft_total, 2)
        return None

    @staticmethod
    def _make_point(raw: RawProperty) -> Optional[Any]:
        lat = raw.raw_data.get("lat")
        lng = raw.raw_data.get("lng")
        if lat and lng:
            try:
                return WKTElement(f"POINT({float(lng)} {float(lat)})", srid=4326)
            except (ValueError, TypeError):
                pass
        return None
