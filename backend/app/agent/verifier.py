"""
Nightly verification pipeline — re-fetches each property's source page(s) and
reconciles scraped values against what's stored: corrects real drift,
backfills fields that were missed the first time (e.g. the municipal-tax
parsing gap), and flags genuine ambiguity for manual review instead of
guessing.

Welcome tax is handled separately from the rest of VERIFIABLE_FIELDS because
only Centris exposes a live transfer-tax calculator — it's re-checked via
Centris regardless of which source is primary for the property (re-fetching
the property's own Centris source if it has one, or searching Centris by
address via CentrisScraper.search_by_address() when it doesn't).

Any mismatch (including "stored is NULL but live has a real value") triggers
one extra re-fetch to break the tie before anything is written:
  - fetch2 agrees with fetch1  -> trust it, apply the correction
  - fetch2 agrees with stored  -> keep stored (fetch1 was a transient glitch)
  - all three disagree         -> manual_review, log everything, change nothing
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property
from app.models.snapshot import ScraperSource
from app.models.source import PropertySource
from app.models.verification import PropertyVerificationLog, VerificationOutcome
from app.scrapers.base import BaseScraper, RawProperty
from app.scrapers.centris import CentrisScraper
from app.scrapers.deduplicator import PropertyDeduplicator
from app.scrapers.realtor import RealtorScraper
from app.scrapers.remax import RemaxScraper

logger = logging.getLogger(__name__)

VERIFIABLE_FIELDS = [
    "asking_price",
    "municipal_taxes_annual",
    "school_taxes_annual",
    "welcome_tax",
    "sqft_total",
    "unit_count",
    "bedrooms_total",
    "bathrooms_total",
]

# Fields significant enough that a correction should force the AI pipeline to
# recompute cap rate / scoring / verdict.
REANALYSIS_FIELDS = {
    "asking_price", "municipal_taxes_annual", "school_taxes_annual",
    "welcome_tax", "sqft_total", "unit_count",
}

NUMERIC_TOLERANCE = 0.01  # 1% — absorbs rounding noise, not real drift

SCRAPER_CLASSES = {
    ScraperSource.CENTRIS.value: CentrisScraper,
    ScraperSource.REALTOR.value: RealtorScraper,
    ScraperSource.REMAX.value: RemaxScraper,
}

# RealtorScraper.scrape_detail() deliberately only fetches the fields NOT
# available from the search API it's normally populated from (see its
# docstring) — asking_price/bedrooms_total/bathrooms_total are always None
# on a detail-page re-fetch, by design, not because they've drifted. Compare
# only what each source's detail fetch actually populates; anything else
# would flood every Realtor property with false "manual_review" flags.
SOURCE_COMPARABLE_FIELDS = {
    ScraperSource.REALTOR.value: {
        "municipal_taxes_annual", "school_taxes_annual", "sqft_total", "unit_count",
    },
}


def _comparable_fields(source: Optional[str]) -> set[str]:
    return SOURCE_COMPARABLE_FIELDS.get(source, set(VERIFIABLE_FIELDS) - {"welcome_tax"})


def make_scrapers(api_keys: list[str]) -> dict[str, BaseScraper]:
    return {name: cls(api_keys=api_keys) for name, cls in SCRAPER_CLASSES.items()}


async def close_scrapers(scrapers: dict[str, BaseScraper]) -> None:
    for scraper in scrapers.values():
        try:
            await scraper.close()
        except Exception:
            pass


def _source_enum(prop: Property) -> ScraperSource:
    if prop.primary_source in SCRAPER_CLASSES:
        return ScraperSource(prop.primary_source)
    return ScraperSource.CENTRIS


def _values_match(stored, live) -> bool:
    if stored is None and live is None:
        return True
    if stored is None or live is None:
        return False
    if isinstance(stored, (int, float)) and isinstance(live, (int, float)):
        denom = max(abs(stored), abs(live), 1e-9)
        return abs(stored - live) / denom <= NUMERIC_TOLERANCE
    return stored == live


async def _fetch_primary(prop: Property, scrapers: dict[str, BaseScraper]) -> Optional[RawProperty]:
    scraper = scrapers.get(prop.primary_source)
    if not scraper or not prop.listing_url:
        return None
    try:
        return await scraper.scrape_detail(prop.listing_url)
    except Exception as exc:
        logger.warning(f"[verify] primary re-fetch failed for {prop.id} ({prop.primary_source}): {exc}")
        return None


async def _fetch_centris_welcome_tax(
    session: AsyncSession,
    prop: Property,
    scrapers: dict[str, BaseScraper],
    primary_raw: Optional[RawProperty],
) -> tuple[Optional[float], bool]:
    """
    Returns (welcome_tax, no_centris_match). no_centris_match is True only
    when the property is confirmed to have no Centris presence at all
    (search_by_address found nothing) — used to steer the overall outcome.
    """
    centris_scraper = scrapers[ScraperSource.CENTRIS.value]

    if prop.primary_source == ScraperSource.CENTRIS.value and primary_raw is not None:
        return primary_raw.welcome_tax, False

    result = await session.execute(
        select(PropertySource).where(
            PropertySource.property_id == prop.id,
            PropertySource.source == ScraperSource.CENTRIS,
            PropertySource.is_active.is_(True),
        )
    )
    centris_source = result.scalar_one_or_none()

    if centris_source and centris_source.source_url:
        try:
            raw = await centris_scraper.scrape_detail(centris_source.source_url)
        except Exception as exc:
            logger.warning(f"[verify] centris welcome-tax re-fetch failed for {prop.id}: {exc}")
            raw = None
        if raw is not None:
            return raw.welcome_tax, False

    if not prop.full_address or not prop.city:
        return None, True

    try:
        match = await centris_scraper.search_by_address(prop.full_address, prop.city, prop.property_type)
    except Exception as exc:
        logger.warning(f"[verify] centris search_by_address failed for {prop.id}: {exc}")
        match = None

    if match is None:
        return None, True

    # search_by_address returns a search-result-card RawProperty — no
    # welcome_tax (only detail pages run the calculator). Fetch the actual
    # detail page for the match before using it for anything.
    try:
        match_detail = await centris_scraper.scrape_detail(match.source_url)
    except Exception as exc:
        logger.warning(f"[verify] centris detail fetch for search match failed for {prop.id}: {exc}")
        match_detail = None
    if match_detail is None:
        return None, True

    # Genuine Centris match for a Realtor-only property — attach it as a new
    # PropertySource so future runs use the cheap direct-URL path above.
    dedup = PropertyDeduplicator(session)
    await dedup.process(match_detail)
    return match_detail.welcome_tax, False


async def verify_property(
    session: AsyncSession, prop: Property, scrapers: dict[str, BaseScraper],
) -> VerificationOutcome:
    now = datetime.now(timezone.utc)

    primary_raw = await _fetch_primary(prop, scrapers)

    if prop.primary_source == ScraperSource.CENTRIS.value and primary_raw is None:
        # Primary source IS Centris and the fetch already failed (scrape_detail
        # already retries internally once) — the welcome-tax calculator lives
        # on this exact same page, so there's nothing left to try. Skip
        # _fetch_centris_welcome_tax entirely rather than re-hitting the same
        # broken/delisted URL for a third and fourth time.
        outcome = VerificationOutcome.FETCH_FAILED
        session.add(PropertyVerificationLog(
            property_id=prop.id, source=_source_enum(prop), fields_checked={},
            outcome=outcome, verified_at=now,
        ))
        prop.last_verified_at = now
        return outcome

    welcome_tax_live, no_centris_match = await _fetch_centris_welcome_tax(session, prop, scrapers, primary_raw)

    if primary_raw is None and welcome_tax_live is None and no_centris_match:
        outcome = VerificationOutcome.FETCH_FAILED
        session.add(PropertyVerificationLog(
            property_id=prop.id, source=_source_enum(prop), fields_checked={},
            outcome=outcome, verified_at=now,
        ))
        prop.last_verified_at = now
        return outcome

    comparable = _comparable_fields(prop.primary_source)
    fetch1: dict[str, Optional[object]] = {"welcome_tax": welcome_tax_live}
    if primary_raw is not None:
        for f in comparable:
            fetch1[f] = getattr(primary_raw, f, None)

    fields_checked: dict = {}
    mismatched: list[str] = []
    for f in VERIFIABLE_FIELDS:
        if f not in fetch1:
            continue
        stored = getattr(prop, f, None)
        live = fetch1[f]
        if f == "welcome_tax" and live is None and no_centris_match:
            fields_checked[f] = {"stored": stored, "fetch1": None, "no_centris_match": True}
            continue
        match = _values_match(stored, live)
        fields_checked[f] = {"stored": stored, "fetch1": live, "match": match}
        if not match:
            mismatched.append(f)

    if not mismatched:
        outcome = (
            VerificationOutcome.NO_CENTRIS_MATCH
            if (no_centris_match and prop.welcome_tax is None)
            else VerificationOutcome.VERIFIED_MATCH
        )
        session.add(PropertyVerificationLog(
            property_id=prop.id, source=_source_enum(prop), fields_checked=fields_checked,
            outcome=outcome, verified_at=now,
        ))
        prop.last_verified_at = now
        return outcome

    # Tie-break: one more re-fetch of everything that disagreed.
    primary_raw2 = await _fetch_primary(prop, scrapers) if any(f != "welcome_tax" for f in mismatched) else None
    welcome_tax_live2 = None
    if "welcome_tax" in mismatched:
        welcome_tax_live2, _ = await _fetch_centris_welcome_tax(session, prop, scrapers, primary_raw2)

    fetch2: dict[str, Optional[object]] = {"welcome_tax": welcome_tax_live2}
    if primary_raw2 is not None:
        for f in VERIFIABLE_FIELDS:
            if f != "welcome_tax":
                fetch2[f] = getattr(primary_raw2, f, None)

    corrected_any = False
    manual_review_any = False
    for f in mismatched:
        stored = getattr(prop, f, None)
        f1 = fetch1.get(f)
        f2 = fetch2.get(f)
        entry = fields_checked[f]
        entry["fetch2"] = f2

        if f2 is not None and _values_match(f1, f2):
            setattr(prop, f, f2)
            entry["corrected"] = True
            corrected_any = True
        elif f2 is not None and _values_match(stored, f2):
            entry["corrected"] = False
        else:
            entry["corrected"] = False
            entry["manual_review"] = True
            manual_review_any = True

    if manual_review_any:
        outcome = VerificationOutcome.MANUAL_REVIEW
    elif corrected_any:
        outcome = VerificationOutcome.CORRECTED
        if any(f in REANALYSIS_FIELDS for f in mismatched):
            prop.needs_reanalysis = True
    else:
        outcome = VerificationOutcome.VERIFIED_MATCH

    session.add(PropertyVerificationLog(
        property_id=prop.id, source=_source_enum(prop), fields_checked=fields_checked,
        outcome=outcome, verified_at=now,
    ))
    prop.last_verified_at = now
    return outcome


async def verify_batch(
    session: AsyncSession,
    properties: list[Property],
    api_keys: list[str],
    commit_every: int = 25,
    delay_seconds: float = 1.5,
) -> dict[str, int]:
    stats: dict[str, int] = {o.value: 0 for o in VerificationOutcome}
    stats["errors"] = 0

    scrapers = make_scrapers(api_keys)
    try:
        for i, prop in enumerate(properties, 1):
            pid = prop.id
            try:
                outcome = await verify_property(session, prop, scrapers)
                stats[outcome.value] += 1
            except Exception as exc:
                logger.warning(f"[verify] {i}/{len(properties)} failed for property {pid}: {exc}")
                stats["errors"] += 1
                await session.rollback()

            if i % commit_every == 0:
                try:
                    await session.commit()
                except Exception as exc:
                    logger.warning(f"[verify] commit at {i}/{len(properties)} failed: {exc}")
                    await session.rollback()
                    stats["errors"] += 1

            await asyncio.sleep(delay_seconds)

        await session.commit()
    finally:
        await close_scrapers(scrapers)

    return stats
