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
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import ListingType, Property, PropertyStatus, PropertyType
from app.models.snapshot import PropertySnapshot, ScraperSource
from app.models.source import PropertySource
from app.config import settings
from app.scrapers.base import RawProperty
from app.services.quebec_address import deaccent

logger = logging.getLogger(__name__)


def in_target_cities(city: Optional[str]) -> bool:
    """True if a listing's city is in the configured scrape scope (target_cities).
    Keeps ingestion aligned with our zoning coverage so every saved listing is
    zonable. Empty target_cities = keep everything."""
    targets = {c.strip() for c in (settings.target_cities or "").split(",") if c.strip()}
    if not targets:
        return True
    norm = deaccent((city or "").split("(")[0]).strip().lower()
    return norm in targets

PROPERTY_TYPE_MAP: dict[str, PropertyType] = {
    "duplex":          PropertyType.DUPLEX,
    "triplex":         PropertyType.TRIPLEX,
    "quadruplex":      PropertyType.QUADRUPLEX,
    "quintuplex_plus": PropertyType.QUINTUPLEX_PLUS,
    "single_family":   PropertyType.SINGLE_FAMILY,
    "condo":           PropertyType.CONDO,
    "townhouse":       PropertyType.TOWNHOUSE,
}

LISTING_TYPE_MAP: dict[str, ListingType] = {
    "for_sale": ListingType.FOR_SALE,
    "for_rent": ListingType.FOR_RENT,
}

# A genuine same-property match shouldn't diverge this much in price between
# sources. Used as a hard veto on Tier 3/4 dedup matches — the bug this
# guards against: a wrong cross-source merge (e.g. two different condo units,
# or a rental accidentally matched to a for-sale listing) showing one
# source's price while another source's price silently overwrites it.
PRICE_DIVERGENCE_VETO = 0.25


class PropertyDeduplicator:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def process(self, raw: RawProperty, bypass_scope: bool = False) -> tuple[Property, bool]:
        """
        Upsert one RawProperty into the database.
        Returns (property, is_new). Out-of-scope cities are skipped -> (None, False),
        unless bypass_scope=True (on-demand lookups fetch a listing the user
        explicitly asked for, which may be outside our scheduled scrape cities).
        """
        now = datetime.now(timezone.utc)

        # Checked before the city-scope gate below — a delisted signal
        # carries no real field data by design (city included), so it would
        # otherwise always get misread as "out of scope" and silently
        # dropped, never actually marking the existing property delisted
        # (confirmed live: this was happening on every delisted listing,
        # from any scrape path, until this check was moved up).
        if raw.is_delisted:
            return await self._mark_delisted(raw, now)

        # Only ingest listings we can fully serve (zoning coverage). A bbox can't
        # exclude on-island suburbs, so we filter by city here — the single choke
        # point every scrape path goes through.
        if not bypass_scope and not in_target_cities(raw.city):
            logger.debug(f"skip out-of-scope city: {raw.city}")
            return None, False

        # ReMax is no longer trusted as a for-sale source (see
        # scripts/remove_remax_for_sale.py) — remax.py's sitemap walk already
        # filters these out before fetching, but this is the one choke point
        # every scrape path passes through (including scripts that call
        # scrape_detail() directly), so it's a hard backstop against ever
        # re-introducing this data by any route.
        if raw.source == "remax" and raw.listing_type == "for_sale":
            logger.debug(f"skip remax for-sale listing: {raw.source_url}")
            return None, False

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
        # Tier 1: MLS exact match. Exempt from the listing_type gate below — a
        # real, shared MLS number is authoritative on its own, and for-sale
        # vs for-rent listings never collide on a real MLS number in practice.
        if raw.mls_number:
            found = (await self.session.scalars(
                select(Property).where(Property.mls_number == raw.mls_number)
            )).first()
            if found:
                return found

        raw_listing_type = LISTING_TYPE_MAP.get(raw.listing_type, ListingType.FOR_SALE)

        # Tier 2: Address hash exact match
        if raw.full_address:
            found = (await self.session.scalars(
                select(Property).where(
                    Property.address_hash == self._address_hash(raw),
                    Property.listing_type == raw_listing_type,
                )
            )).first()
            if found:
                return found

        # Tier 3: Composite fingerprint (requires postal_code or agent contact)
        if raw.postal_code or raw.agent_email or raw.agent_phone or raw.agent_name:
            candidates = await self._composite_candidates(raw, raw_listing_type)
            for candidate in candidates:
                if self._price_diverges(candidate.asking_price, raw.asking_price):
                    continue
                score, specificity = self._composite_score(candidate, raw)
                # Agent-identity signals (email/phone/name/agency) alone can
                # reach 60+ points — one agent commonly handles many units in
                # the same building, so identity match alone isn't proof of
                # the same property. Require real specificity corroboration
                # (postal code, type, price, or unit count) too.
                if score >= 60 and specificity >= 25:
                    return candidate

        # Tier 4: PostGIS proximity fallback (only when coordinates available)
        found = await self._find_by_proximity(raw, raw_listing_type)
        if found:
            return found

        return None

    async def _composite_candidates(self, raw: RawProperty, raw_listing_type: ListingType) -> list[Property]:
        """Fetch candidate properties in same city+type+listing_type to score against."""
        stmt = select(Property).where(
            func.lower(Property.city) == (raw.city or "").lower(),
            Property.listing_type == raw_listing_type,
        )
        raw_type = PROPERTY_TYPE_MAP.get(raw.property_type or "", None)
        if raw_type:
            stmt = stmt.where(Property.property_type == raw_type)
        return list((await self.session.scalars(stmt.limit(50))).all())

    def _composite_score(self, existing: Property, raw: RawProperty) -> tuple[int, int]:
        """
        Weighted confidence score for cross-site deduplication.
        Returns (total_score, specificity_score). Match requires total >= 60
        AND specificity >= 25 (see _find_existing) — specificity is what
        actually distinguishes one physical unit from another; identity
        signals alone (same listing agent) are not sufficient, since one
        agent often manages several units in the same building.
        """
        identity = 0
        specificity = 0

        # Agent email — strongest identity signal (40 pts)
        if existing.agent_email and raw.agent_email:
            if existing.agent_email.lower().strip() == raw.agent_email.lower().strip():
                identity += 40

        # Agent phone — strong identity signal (35 pts)
        if existing.agent_phone and raw.agent_phone:
            if self._normalize_phone(existing.agent_phone) == self._normalize_phone(raw.agent_phone):
                identity += 35

        # Postal code (25 pts) — specificity
        if existing.postal_code and raw.postal_code:
            if existing.postal_code.replace(" ", "").upper() == raw.postal_code.replace(" ", "").upper():
                specificity += 25

        # Property type (15 pts) — specificity
        raw_type = PROPERTY_TYPE_MAP.get(raw.property_type or "", None)
        if raw_type and existing.property_type == raw_type:
            specificity += 15

        # Price proximity ±2% (15 pts) — specificity
        if existing.asking_price and raw.asking_price and existing.asking_price > 0:
            if abs(existing.asking_price - raw.asking_price) / existing.asking_price <= 0.02:
                specificity += 15

        # Agent name normalized (15 pts) — identity
        if existing.agent_name and raw.agent_name:
            if self._normalize_text(existing.agent_name) == self._normalize_text(raw.agent_name):
                identity += 15

        # Agency name normalized (10 pts) — identity
        if existing.agency_name and raw.agency_name:
            if self._normalize_text(existing.agency_name) == self._normalize_text(raw.agency_name):
                identity += 10

        # Unit count (10 pts) — specificity
        if existing.unit_count and raw.unit_count and existing.unit_count == raw.unit_count:
            specificity += 10

        return identity + specificity, specificity

    @staticmethod
    def _price_diverges(existing_price: Optional[float], raw_price: Optional[float]) -> bool:
        """
        True if both prices are present and diverge by more than
        PRICE_DIVERGENCE_VETO — a hard veto on Tier 3/4 matches. Two listings
        of the same real property don't diverge this much; this is exactly
        the signature of a wrong cross-source merge (e.g. a rental's price
        landing on a for-sale property, or two different condo units merged).
        """
        if not existing_price or not raw_price or existing_price <= 0:
            return False
        return abs(existing_price - raw_price) / existing_price > PRICE_DIVERGENCE_VETO

    async def _find_by_proximity(self, raw: RawProperty, raw_listing_type: ListingType) -> Optional[Property]:
        """
        PostGIS: find property within 15 metres of coordinates + same type.
        Excludes CONDO — a tower can have 100+ units within 15m of each
        other, so distance alone is meaningless there. Also vetoes on price
        divergence, since distance+type alone was the weakest of the four
        tiers (no corroboration at all before this fix).
        """
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
            ),
            Property.listing_type == raw_listing_type,
            Property.property_type != PropertyType.CONDO,
        )
        raw_type = PROPERTY_TYPE_MAP.get(raw.property_type or "", None)
        if raw_type:
            stmt = stmt.where(Property.property_type == raw_type)

        for candidate in (await self.session.scalars(stmt)).all():
            if not self._price_diverges(candidate.asking_price, raw.asking_price):
                return candidate
        return None

    # ── Create ────────────────────────────────────────────────────────────────

    def _create_property(self, raw: RawProperty, now: datetime) -> Property:
        listed_at = self._derive_listed_at(raw, now)
        price_history = []
        if raw.asking_price:
            price_history = [{
                "price": raw.asking_price,
                # Prefer the real listing date when a source gave us one (Realtor
                # ships TimeOnRealtor → days-on-market). Falls back to scrape date.
                "date":  (listed_at or now).date().isoformat(),
                "source": raw.source,
                "event": "listed",
            }]

        return Property(
            mls_number=raw.mls_number,
            # Always computed — previously only set when mls_number was
            # absent, which meant Tier 2 (exact address match) could never
            # fire for ReMax (it always sets a fake local ID as mls_number).
            address_hash=self._address_hash(raw),
            full_address=raw.full_address or "Unknown",
            street_number=raw.street_number,
            street_name=raw.street_name,
            city=raw.city or "Unknown",
            neighborhood=raw.neighborhood,
            postal_code=raw.postal_code,
            province="QC",
            location=self._make_point(raw),
            property_type=self._map_type(raw.property_type),
            listing_type=LISTING_TYPE_MAP.get(raw.listing_type, ListingType.FOR_SALE),
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
            # Real listing date when a source provided one — lets
            # compute_days_on_market() report true age instead of days-since-first-
            # scraped (which caps at how long we've been scraping). NULL keeps the
            # first_seen_at fallback (Centris, which hides the true date).
            listed_at=listed_at,
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

    @staticmethod
    def _derive_listed_at(raw: RawProperty, now: datetime) -> Optional[datetime]:
        """
        Best available real listing date, or None to fall back to first_seen_at.
        Priority:
          1. raw.listed_at        — an explicit ISO date from the source
          2. now - days_on_market — Realtor's TimeOnRealtor gives real DOM, so we
             back-calculate the list date (can be far older than our scrape history)
        Centris hides the true date and provides neither → None → first_seen_at.
        """
        if raw.listed_at:
            try:
                dt = datetime.fromisoformat(str(raw.listed_at))
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                pass
        if raw.days_on_market and raw.days_on_market > 0:
            return now - timedelta(days=raw.days_on_market)
        return None

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

        # Backfill a real listing date if we never had one and this source can
        # give us one (e.g. a Realtor re-scrape of a property first seen via
        # Centris). Only fills when currently NULL — never overwrites a known date.
        if prop.listed_at is None:
            derived = self._derive_listed_at(raw, now)
            if derived is not None:
                prop.listed_at = derived

        # Merge source into active_sources
        sources = list(prop.active_sources or [])
        if raw.source not in sources:
            prop.active_sources = [*sources, raw.source]

        # Listing type correction — a Tier 1 (MLS) match returns the existing
        # row regardless of listing_type, so a row created before the ReMax
        # for-sale/for-rent fix (or one whose listing genuinely changed from
        # sale to rent or back) would otherwise keep a stale value forever.
        # needs_reanalysis so the pipeline picks the right stage set next run
        # (financial/scoring stages only run for for_sale — see pipeline.py).
        raw_listing_type = LISTING_TYPE_MAP.get(raw.listing_type, ListingType.FOR_SALE)
        if prop.listing_type != raw_listing_type:
            prop.listing_type = raw_listing_type
            prop.needs_reanalysis = True

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
