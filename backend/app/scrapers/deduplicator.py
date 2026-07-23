"""
Property deduplicator — takes RawProperty from any scraper and upserts into DB.

Deduplication strategy (4-tier cascade):
  1. MLS number        — exact match; shared by Centris, Realtor, Zolo
  2. Address hash      — SHA-256 of normalized address+city; fallback for DuProprio
  3. Composite score   — weighted signals: agent email/phone, postal code, type, price
                         Threshold ≥ 60 pts → treat as duplicate
                         Covers ReMax, Royal LePage, and other non-MLS sites
  4. PostGIS proximity — ST_DWithin 15 m + same property_type; final fallback
                         Only runs when lat/lng present in raw_data

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
from sqlalchemy import func, select
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

        if raw.is_delisted:
            return await self._mark_delisted(raw, now)

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

    async def _mark_delisted(self, raw: RawProperty, now: datetime) -> tuple[Property, bool]:
        """
        Handle a "listing not found" signal from the scraper: the source has
        removed/sold this listing since we last saw it. Only status is
        touched — raw carries no real field data (price/address/etc. are all
        None), so running it through the normal update/snapshot pipeline
        would overwrite good existing data with nothing.
        """
        existing = (await self.session.scalars(
            select(Property).where(Property.mls_number == raw.mls_number)
        )).first()
        if not existing:
            raise ValueError(
                f"Got a delisted signal for MLS {raw.mls_number!r} but no matching "
                f"property exists — scrape_detail() should only be called with a "
                f"URL already stored on an existing property."
            )
        if existing.status != PropertyStatus.DELISTED:
            existing.status = PropertyStatus.DELISTED
            existing.last_scraped_at = now
        return existing, False

    # ── Find (4-tier cascade) ─────────────────────────────────────────────────

    async def _find_existing(self, raw: RawProperty) -> Optional[Property]:
        # Tier 1: MLS exact match
        if raw.mls_number:
            found = (await self.session.scalars(
                select(Property).where(Property.mls_number == raw.mls_number)
            )).first()
            if found:
                return found

        # Tier 2: Address hash exact match
        if raw.full_address:
            found = (await self.session.scalars(
                select(Property).where(
                    Property.address_hash == self._address_hash(raw)
                )
            )).first()
            if found:
                return found

        # Tier 3: Composite fingerprint (requires postal_code or agent contact)
        if raw.postal_code or raw.agent_email or raw.agent_phone or raw.agent_name:
            candidates = await self._composite_candidates(raw)
            for candidate in candidates:
                if self._composite_score(candidate, raw) >= 60:
                    return candidate

        # Tier 4: PostGIS proximity fallback (only when coordinates available)
        found = await self._find_by_proximity(raw)
        if found:
            return found

        return None

    async def _composite_candidates(self, raw: RawProperty) -> list[Property]:
        """Fetch candidate properties in same city+type to score against."""
        stmt = select(Property).where(
            func.lower(Property.city) == (raw.city or "").lower()
        )
        raw_type = PROPERTY_TYPE_MAP.get(raw.property_type or "", None)
        if raw_type:
            stmt = stmt.where(Property.property_type == raw_type)
        return list((await self.session.scalars(stmt.limit(50))).all())

    def _composite_score(self, existing: Property, raw: RawProperty) -> int:
        """
        Weighted confidence score for cross-site deduplication.
        Score ≥ 60 → treat as the same property.
        """
        score = 0

        # Agent email — strongest signal (40 pts)
        if existing.agent_email and raw.agent_email:
            if existing.agent_email.lower().strip() == raw.agent_email.lower().strip():
                score += 40

        # Agent phone — strong signal (35 pts)
        if existing.agent_phone and raw.agent_phone:
            if self._normalize_phone(existing.agent_phone) == self._normalize_phone(raw.agent_phone):
                score += 35

        # Postal code (25 pts)
        if existing.postal_code and raw.postal_code:
            if existing.postal_code.replace(" ", "").upper() == raw.postal_code.replace(" ", "").upper():
                score += 25

        # Property type (15 pts)
        raw_type = PROPERTY_TYPE_MAP.get(raw.property_type or "", None)
        if raw_type and existing.property_type == raw_type:
            score += 15

        # Price proximity ±2% (15 pts)
        if existing.asking_price and raw.asking_price and existing.asking_price > 0:
            if abs(existing.asking_price - raw.asking_price) / existing.asking_price <= 0.02:
                score += 15

        # Agent name normalized (15 pts)
        if existing.agent_name and raw.agent_name:
            if self._normalize_text(existing.agent_name) == self._normalize_text(raw.agent_name):
                score += 15

        # Agency name normalized (10 pts)
        if existing.agency_name and raw.agency_name:
            if self._normalize_text(existing.agency_name) == self._normalize_text(raw.agency_name):
                score += 10

        # Unit count (10 pts)
        if existing.unit_count and raw.unit_count and existing.unit_count == raw.unit_count:
            score += 10

        return score

    async def _find_by_proximity(self, raw: RawProperty) -> Optional[Property]:
        """PostGIS: find property within 15 metres of coordinates + same type."""
        lat = raw.raw_data.get("lat")
        lng = raw.raw_data.get("lng")
        if not lat or not lng:
            return None
        try:
            point_wkt = f"SRID=4326;POINT({float(lng)} {float(lat)})"
        except (ValueError, TypeError):
            return None

        stmt = select(Property).where(
            func.ST_DWithin(
                func.ST_Transform(Property.location, 3857),
                func.ST_Transform(func.ST_GeomFromEWKT(point_wkt), 3857),
                15,
            )
        )
        raw_type = PROPERTY_TYPE_MAP.get(raw.property_type or "", None)
        if raw_type:
            stmt = stmt.where(Property.property_type == raw_type)
        return (await self.session.scalars(stmt)).first()

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
            agent_name=raw.agent_name,
            agent_phone=raw.agent_phone,
            agent_email=raw.agent_email,
            agency_name=raw.agency_name,
            rental_income_monthly=raw.rental_income_monthly,
            municipal_taxes_annual=raw.municipal_taxes_annual,
            school_taxes_annual=raw.school_taxes_annual,
            condo_fees_monthly=raw.condo_fees_monthly,
            evaluation_fonciere=raw.evaluation_fonciere,
            welcome_tax=raw.welcome_tax,
            raw_expenses={"welcome_tax_centris": raw.welcome_tax} if raw.welcome_tax else {},
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

        # Welcome tax from the source site's calculator is authoritative —
        # always refresh it (it changes when the asking price changes)
        if raw.welcome_tax:
            prop.welcome_tax = raw.welcome_tax
            prop.raw_expenses = {**(prop.raw_expenses or {}), "welcome_tax_centris": raw.welcome_tax}

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
            ("agent_name",              raw.agent_name),
            ("agent_phone",             raw.agent_phone),
            ("agent_email",             raw.agent_email),
            ("agency_name",             raw.agency_name),
            ("rental_income_monthly",   raw.rental_income_monthly),
            ("municipal_taxes_annual",  raw.municipal_taxes_annual),
            ("school_taxes_annual",     raw.school_taxes_annual),
            ("condo_fees_monthly",      raw.condo_fees_monthly),
            ("evaluation_fonciere",     raw.evaluation_fonciere),
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
                agent_name=raw.agent_name,
                agent_phone=raw.agent_phone,
                agent_email=raw.agent_email,
                agency_name=raw.agency_name,
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
                    "agent_name":        raw.agent_name,
                    "agent_phone":       raw.agent_phone,
                    "agent_email":       raw.agent_email,
                    "agency_name":       raw.agency_name,
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
    def _normalize_text(s: str) -> str:
        """Strip punctuation, spaces, and lowercase for fuzzy name comparison."""
        return re.sub(r"[^a-z0-9]", "", s.lower())

    @staticmethod
    def _normalize_phone(s: str) -> str:
        """Strip all non-digit characters for phone comparison."""
        return re.sub(r"[^0-9]", "", s)

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
