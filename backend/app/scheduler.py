"""
APScheduler — automated scraping + AI pipeline.

Runs every settings.scrape_interval_hours (default: 2h). Each cycle, every
source (Realtor.ca, Centris, ReMax) paginates until it finds 100 NEW
properties (not already in the DB) or hits the MAX_PAGES_PER_SOURCE safety
cap — whichever comes first. Every listing seen along the way, new or
already-known, is still saved, so existing listings keep getting their
price/status refreshed as a side effect of the pagination.

Coverage — all of Quebec, all residential property types:
  Realtor.ca : loops every bbox in QUEBEC_CITY_BBOXES (not just Montreal)
  Centris    : loops plex/condo/house categories, city=None (province-wide)
  ReMax      : one sitemap walk covers all Quebec cities/types already —
               remax-quebec.com's sitemap has no per-listing type metadata,
               so there's nothing to loop over there

Non-plex properties (single_family/condo/townhouse) rarely disclose rental
income, so their financial metrics use FinancialCalculator's fallback rent
estimate (see calculator.py:_estimate_rent). To keep that from producing
misleadingly high scores, OpportunityScorer hard-caps any property with
rent_is_estimated=True at 59 (see scorer.py) — it can never show up as
worth_investigating/strong_opportunity on a fabricated income number.

scrape_job and pipeline_job run on the same interval/start time, so they
execute concurrently rather than one waiting on the other.

API key fallback:
  SCRAPFLY_API_KEY   — primary key
  SCRAPFLY_API_KEY_2 — fallback when primary runs out of credits

Progress is tracked in app.scrape_state.scrape_progress and polled
by GET /api/admin/scrape-status every 2 seconds from the frontend.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from scrapfly import ScrapeConfig

from app.config import settings
from app.database import AsyncSessionLocal
from app.scrapers.base import SCRAPFLY_CALL_TIMEOUT
from app.scrapers.centris import CentrisScraper
from app.scrapers.realtor import RealtorScraper, API_URL, API_HEADERS, QUEBEC_CITY_BBOXES
from app.scrapers.deduplicator import PropertyDeduplicator
from app.agent.pipeline import InvestmentPipeline
from app.agent.verifier import verify_batch
from app.scrape_state import scrape_progress, multiunit_scrape_progress, ScrapeProgress

logger = logging.getLogger(__name__)


# ── API keys ───────────────────────────────────────────────────────────────────

def _api_keys() -> list[str]:
    return [k for k in [settings.scrapfly_api_key, settings.scrapfly_api_key_2] if k]


# ── Targets ────────────────────────────────────────────────────────────────────
# These are NEW-property targets per cycle, not total-processed — each source
# keeps paginating (up to MAX_PAGES_PER_SOURCE as a safety cap) until it finds
# this many properties not already in the DB. Every listing encountered along
# the way — new or already-known — still gets saved, so existing listings keep
# getting their price/status refreshed as a side effect of the pagination.

REALTOR_TARGET = 100
CENTRIS_TARGET = 100
REMAX_TARGET   = 100
MAX_PAGES_PER_SOURCE = 20   # safety cap so a saturated source can't loop forever

# Stop paging early once this many consecutive pages yield 0 new properties —
# a strong signal we've caught up to already-scraped territory. All paginated
# sources now sort newest-first (Realtor via its API Sort=6-D, Centris via the
# UpdateSort POST), so new listings cluster toward the front and hitting known
# listings reliably means we're caught up. Centris keeps a larger margin because
# its ordering still jitters through Scrapfly's rotating proxies (see
# CentrisScraper._set_sort_newest). ReMax doesn't paginate blind — it diffs its
# sitemap against the DB and only fetches genuinely-new URLs.
CONSECUTIVE_EMPTY_LIMIT = 3
CONSECUTIVE_EMPTY_LIMIT_CENTRIS = 5


async def _known_remax_urls() -> set:
    """Every ReMax listing URL we've already scraped (from property_sources).
    Used to diff the ReMax sitemap so we only fetch listings new to us.

    Excludes inactive sources (is_active=False) — a source detached by
    scripts/fix_mismatched_sources.py, or naturally delisted, should be
    eligible for re-discovery on the next sitemap walk rather than
    permanently skipped. Without this, a wrongly-matched or stale ReMax
    listing can never be re-scraped and corrected, since ReMax's sitemap
    walk (unlike Centris/Realtor's periodic re-scans) only ever visits a
    URL once."""
    from sqlalchemy import select
    from app.models.source import PropertySource
    from app.models.snapshot import ScraperSource

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(PropertySource.source_url).where(
                PropertySource.source == ScraperSource.REMAX,
                PropertySource.source_url.isnot(None),
                PropertySource.is_active == True,  # noqa: E712
            )
        )
        return {r[0] for r in rows}


# ── Dedup helper ───────────────────────────────────────────────────────────────

async def _save(raw_list, source_key: str, progress: ScrapeProgress = scrape_progress) -> tuple[int, int, int]:
    """
    Dedup + save a batch. Returns (new, updated, errors).

    "New" vs "updated" comes straight from PropertyDeduplicator.process(), which
    is the single dedup choke point for every scrape path (tier-1: exact MLS
    number match, falling back to address hash / composite score / PostGIS
    proximity — see deduplicator.py). A "duplicate" isn't just skipped: process()
    still refreshes its fields (price, status, etc.) and flags needs_reanalysis
    when something financially significant changed, so re-scraping a known
    property both avoids creating a second row AND keeps its data current.

    progress defaults to the general scrape_progress tracker; pass a different
    ScrapeProgress instance (e.g. multiunit_scrape_progress) to keep a job's
    live status separate from the general job's.
    """
    new = updated = errors = 0
    async with AsyncSessionLocal() as session:
        dedup = PropertyDeduplicator(session)
        for raw in raw_list:
            try:
                _, is_new = await dedup.process(raw)
                if is_new:
                    new += 1
                else:
                    updated += 1
            except Exception as exc:
                logger.warning(f"[{source_key}] dedup error: {exc}")
                errors += 1
                # Postgres aborts the whole transaction on any failed statement —
                # without this, every subsequent item in this batch (and the
                # final commit below) would also fail with "current transaction
                # is aborted", cascading one bad record into a lost entire batch.
                await session.rollback()
        await session.commit()

    # Update progress
    sp = progress.sources[source_key]
    sp.done    += new + updated
    sp.message  = f"{sp.done} saved"
    progress.total_new     += new
    progress.total_updated += updated
    progress.total_errors  += errors
    return new, updated, errors


# ── 4+ unit filter ─────────────────────────────────────────────────────────────
# Both Realtor and Centris expose unit_count/property_type on the parsed search
# result — no need for a separate detail fetch just to check eligibility.
MULTIUNIT_TYPES = {"quadruplex", "quintuplex_plus"}


def _is_multiunit(raw) -> bool:
    if raw.unit_count is not None:
        return raw.unit_count >= 4
    return raw.property_type in MULTIUNIT_TYPES


# ── Scrape job ─────────────────────────────────────────────────────────────────

async def scrape_job() -> None:
    if scrape_progress.running:
        # Guards against overlap: a manual /api/admin/scrape trigger landing on
        # top of the scheduler's own run, a restart re-firing start_date=now
        # while a previous cycle is still going, or a cycle simply taking longer
        # than the interval. Concurrent runs share the same DB connection pool
        # and can cascade into transaction errors — never run two at once.
        logger.warning("Scrape job requested but one is already running — skipping")
        return

    now = datetime.now(timezone.utc)
    scrape_progress.reset()
    # scrape_state.py's SourceProgress defaults to target=50 for every source —
    # override with the real per-cycle targets so the progress display (and pct)
    # stay accurate if these constants ever change.
    scrape_progress.sources["realtor"].target = REALTOR_TARGET
    scrape_progress.sources["centris"].target = CENTRIS_TARGET
    scrape_progress.sources["remax"].target   = REMAX_TARGET
    scrape_progress.started_at = now.isoformat()
    logger.info("=== Scrape job started (Realtor=%d, Centris=%d, ReMax=%d) ===",
                REALTOR_TARGET, CENTRIS_TARGET, REMAX_TARGET)

    keys = _api_keys()

    # ── 1. Centris ────────────────────────────────────────────────────────────
    # Primary for-sale target (client priority: Centris first, then Realtor —
    # ReMax is no longer a for-sale source at all, see Part 3 below).
    scrape_progress.current_source = "centris"
    scrape_progress.sources["centris"].status  = "running"
    scrape_progress.sources["centris"].message = "Connecting..."
    scrape_progress.message = "Scraping Centris..."
    logger.info("--- Centris ---")

    try:
        async with CentrisScraper(api_keys=keys) as scraper:
            centris_new = 0

            # Centris categorizes search by property type (SEARCH_URLS has no
            # "all types" option) — loop across all three so plex/condo/house
            # are all covered. city=None (default) already means province-wide.
            for category in ("plex", "condo", "house"):
                if centris_new >= CENTRIS_TARGET:
                    break

                consecutive_empty = 0
                for page in range(1, MAX_PAGES_PER_SOURCE + 1):
                    if centris_new >= CENTRIS_TARGET or consecutive_empty >= CONSECUTIVE_EMPTY_LIMIT_CENTRIS:
                        break
                    try:
                        scrape_progress.sources["centris"].message = f"{category} page {page}..."
                        raw_list = await scraper.scrape_listings(category=category, page=page)
                        if not raw_list:
                            break

                        new, _, _ = await _save(raw_list, "centris")
                        centris_new += new
                        consecutive_empty = 0 if new > 0 else consecutive_empty + 1
                        logger.info(f"[centris] {category} page {page}: {len(raw_list)} processed, {new} new → total new={centris_new}")
                        await asyncio.sleep(3)

                    except Exception as exc:
                        logger.error(f"[centris] {category} page {page} error: {exc}")
                        scrape_progress.total_errors += 1
                        break

                logger.info(f"[centris] {category} done — running total new={centris_new}")

            if centris_new < CENTRIS_TARGET:
                logger.warning(f"[centris] only found {centris_new}/{CENTRIS_TARGET} new properties across all categories (sources exhausted or caught up)")

        scrape_progress.sources["centris"].status = "done"

    except Exception as exc:
        scrape_progress.sources["centris"].status  = "error"
        scrape_progress.sources["centris"].message = str(exc)[:80]
        logger.error(f"Centris scraper error: {exc}")

    scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    await asyncio.sleep(3)

    # ── 2. Realtor.ca ─────────────────────────────────────────────────────────
    scrape_progress.current_source = "realtor"
    scrape_progress.sources["realtor"].status  = "running"
    scrape_progress.sources["realtor"].message = "Connecting..."
    scrape_progress.message = "Scraping Realtor.ca..."
    logger.info("--- Realtor.ca ---")

    try:
        scraper = RealtorScraper(api_keys=keys)
        realtor_new = 0

        # Loop across every Quebec city bbox — not just Montreal — moving to the
        # next city once the current one is exhausted or caught up.
        for city_name, bbox in QUEBEC_CITY_BBOXES.items():
            if realtor_new >= REALTOR_TARGET:
                break

            consecutive_empty = 0
            page = 1
            while (
                realtor_new < REALTOR_TARGET
                and page <= MAX_PAGES_PER_SOURCE
                and consecutive_empty < CONSECUTIVE_EMPTY_LIMIT
            ):
                scrape_progress.sources["realtor"].message = f"{city_name} page {page}..."
                body = scraper._build_body(
                    bbox=bbox,
                    page=page,
                    records_per_page=50,
                    property_type_group_id=1,   # not an effective server-side filter — kept as-is
                    transaction_type_id=2,
                )
                config = ScrapeConfig(
                    url=API_URL, method="POST", body=body,
                    headers=API_HEADERS, country="ca", asp=False, render_js=False,
                )
                result = await asyncio.wait_for(scraper.client.async_scrape(config), timeout=SCRAPFLY_CALL_TIMEOUT)

                if result.upstream_status_code != 200:
                    logger.error(f"[realtor] {city_name} HTTP {result.upstream_status_code}")
                    break

                data      = json.loads(result.content)
                raw_all   = data.get("Results", [])
                paging    = data.get("Paging", {})
                total_pages = int(paging.get("TotalPages", 1))
                if not raw_all:
                    break

                raw_list = [p for p in (scraper._parse_result(r) for r in raw_all) if p]
                logger.info(f"[realtor] {city_name} page {page}/{total_pages} — {len(raw_list)} results")
                new, _, _ = await _save(raw_list, "realtor")
                realtor_new += new
                consecutive_empty = 0 if new > 0 else consecutive_empty + 1

                if page >= total_pages:
                    break
                page += 1
                await asyncio.sleep(2)

            logger.info(f"[realtor] {city_name} done — running total new={realtor_new}")

        if realtor_new < REALTOR_TARGET:
            logger.warning(f"[realtor] only found {realtor_new}/{REALTOR_TARGET} new properties across all Quebec cities (sources exhausted or caught up)")
        scrape_progress.sources["realtor"].status = "done"
        await scraper.close()

    except Exception as exc:
        scrape_progress.sources["realtor"].status  = "error"
        scrape_progress.sources["realtor"].message = str(exc)[:80]
        logger.error(f"Realtor scraper error: {exc}")

    scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    await asyncio.sleep(3)

    # ── 3. ReMax (remax-quebec.com) — rentals only, see remax.py's sitemap ──────
    # filter (for-sale URLs are never fetched at all).
    scrape_progress.current_source = "remax"
    scrape_progress.sources["remax"].status  = "running"
    scrape_progress.sources["remax"].message = "Loading sitemap..."
    scrape_progress.message = "Scraping ReMax Québec..."
    logger.info("--- ReMax ---")

    try:
        from app.scrapers.remax import RemaxScraper

        # Diff the ReMax sitemap against URLs we've already scraped — the walk
        # then only fetches listings new to us (no wasted credits re-fetching
        # known ones, no ordering/sort assumptions needed).
        known_urls = await _known_remax_urls()
        logger.info(f"[remax] {len(known_urls)} ReMax URLs already known — will be skipped")

        async with RemaxScraper(api_keys=keys) as scraper:
            remax_new  = 0
            page_size  = 10   # scrape 10 listings at a time
            page       = 1

            while remax_new < REMAX_TARGET and page <= MAX_PAGES_PER_SOURCE:
                scrape_progress.sources["remax"].message = f"Page {page}..."
                try:
                    raw_list = await scraper.scrape_listings(
                        page=page, page_size=page_size, known_source_urls=known_urls
                    )
                    if not raw_list:
                        logger.info(f"[remax] No more new listings at page {page}")
                        break

                    new, _, _ = await _save(raw_list, "remax")
                    remax_new += new
                    scrape_progress.sources["remax"].done = remax_new
                    scrape_progress.sources["remax"].pct  = round(remax_new / REMAX_TARGET * 100)
                    logger.info(f"[remax] page {page}: {len(raw_list)} fetched (all sitemap-new), {new} new properties → total new={remax_new}")
                    page += 1
                    await asyncio.sleep(2)

                except Exception as exc:
                    logger.error(f"[remax] page {page} error: {exc}")
                    scrape_progress.total_errors += 1
                    break

            if remax_new < REMAX_TARGET:
                logger.info(f"[remax] found {remax_new} new properties (sitemap diff exhausted or page cap)")

        scrape_progress.sources["remax"].status = "done"

    except Exception as exc:
        scrape_progress.sources["remax"].status  = "error"
        scrape_progress.sources["remax"].message = str(exc)[:80]
        logger.error(f"ReMax scraper error: {exc}")

    # ── Finish ────────────────────────────────────────────────────────────────
    scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    scrape_progress.running        = False
    scrape_progress.current_source = ""
    scrape_progress.finished_at    = datetime.now(timezone.utc).isoformat()
    scrape_progress.message = (
        f"Done — {scrape_progress.total_new} new, "
        f"{scrape_progress.total_updated} updated, "
        f"{scrape_progress.total_errors} errors"
    )
    logger.info(
        "=== Scrape job done in %.1fs — new=%d updated=%d errors=%d ===",
        scrape_progress.elapsed_seconds,
        scrape_progress.total_new,
        scrape_progress.total_updated,
        scrape_progress.total_errors,
    )


# ── 4+ unit scrape job ───────────────────────────────────────────────────────────
# Runs every 2 hours (see create_scheduler), independent of and offset from the
# general scrape_job above. Targets quadruplex/quintuplex_plus properties only —
# Realtor.ca via its Multi-family/Revenue category, Centris via its plex search
# (the only category covering 4+ unit listings on that site). ReMax is skipped:
# its sitemap-walk scraper has no type/unit info until a full detail fetch, so
# there's no cheap way to pre-filter — general scrape_job still picks these up.
#
# Dedup + field-accuracy: identical machinery to scrape_job, via the shared
# _save() helper → PropertyDeduplicator.process() (MLS-number match first,
# falling back to address hash / composite score / proximity — see
# deduplicator.py). A property already in the DB is never re-created; its
# fields are refreshed instead if anything changed since the last scrape.

MULTIUNIT_TARGET = 100


async def scrape_multiunit_job() -> None:
    if multiunit_scrape_progress.running:
        logger.warning("Multi-unit scrape job requested but one is already running — skipping")
        return

    now = datetime.now(timezone.utc)
    multiunit_scrape_progress.reset()
    multiunit_scrape_progress.sources["realtor"].target = MULTIUNIT_TARGET
    multiunit_scrape_progress.sources["centris"].target = MULTIUNIT_TARGET
    multiunit_scrape_progress.started_at = now.isoformat()
    logger.info(f"=== Multi-unit scrape job started (target={MULTIUNIT_TARGET} 4+ unit properties/source) ===")

    keys = _api_keys()

    # ── 1. Realtor.ca — Multi-family/Revenue category ──────────────────────────
    multiunit_scrape_progress.current_source = "realtor"
    multiunit_scrape_progress.sources["realtor"].status  = "running"
    multiunit_scrape_progress.sources["realtor"].message = "Connecting..."
    multiunit_scrape_progress.message = "Scraping Realtor.ca (4+ units)..."
    logger.info("--- Realtor.ca (4+ units) ---")

    try:
        scraper = RealtorScraper(api_keys=keys)
        realtor_new = 0

        for city_name, bbox in QUEBEC_CITY_BBOXES.items():
            if realtor_new >= MULTIUNIT_TARGET:
                break

            consecutive_empty = 0
            page = 1
            while (
                realtor_new < MULTIUNIT_TARGET
                and page <= MAX_PAGES_PER_SOURCE
                and consecutive_empty < CONSECUTIVE_EMPTY_LIMIT
            ):
                multiunit_scrape_progress.sources["realtor"].message = f"{city_name} page {page}..."
                body = scraper._build_body(
                    bbox=bbox,
                    page=page,
                    records_per_page=50,
                    property_type_group_id=3,   # Multi-family/Revenue
                    transaction_type_id=2,
                )
                config = ScrapeConfig(
                    url=API_URL, method="POST", body=body,
                    headers=API_HEADERS, country="ca", asp=False, render_js=False,
                )
                result = await asyncio.wait_for(scraper.client.async_scrape(config), timeout=SCRAPFLY_CALL_TIMEOUT)

                if result.upstream_status_code != 200:
                    logger.error(f"[realtor-multiunit] {city_name} HTTP {result.upstream_status_code}")
                    break

                data      = json.loads(result.content)
                raw_all   = data.get("Results", [])
                paging    = data.get("Paging", {})
                total_pages = int(paging.get("TotalPages", 1))
                if not raw_all:
                    break

                parsed  = [p for p in (scraper._parse_result(r) for r in raw_all) if p]
                raw_list = [p for p in parsed if _is_multiunit(p)]
                logger.info(
                    f"[realtor-multiunit] {city_name} page {page}/{total_pages} — "
                    f"{len(parsed)} results, {len(raw_list)} are 4+ units"
                )
                new, _, _ = await _save(raw_list, "realtor", progress=multiunit_scrape_progress)
                realtor_new += new
                consecutive_empty = 0 if new > 0 else consecutive_empty + 1

                if page >= total_pages:
                    break
                page += 1
                await asyncio.sleep(2)

            logger.info(f"[realtor-multiunit] {city_name} done — running total new={realtor_new}")

        if realtor_new < MULTIUNIT_TARGET:
            logger.warning(f"[realtor-multiunit] only found {realtor_new}/{MULTIUNIT_TARGET} new 4+ unit properties across all Quebec cities")
        multiunit_scrape_progress.sources["realtor"].status = "done"
        await scraper.close()

    except Exception as exc:
        multiunit_scrape_progress.sources["realtor"].status  = "error"
        multiunit_scrape_progress.sources["realtor"].message = str(exc)[:80]
        logger.error(f"Realtor multi-unit scraper error: {exc}")

    multiunit_scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    await asyncio.sleep(3)

    # ── 2. Centris — plex search (only category covering 4+ unit listings) ─────
    multiunit_scrape_progress.current_source = "centris"
    multiunit_scrape_progress.sources["centris"].status  = "running"
    multiunit_scrape_progress.sources["centris"].message = "Connecting..."
    multiunit_scrape_progress.message = "Scraping Centris (4+ units)..."
    logger.info("--- Centris (4+ units) ---")

    try:
        async with CentrisScraper(api_keys=keys) as scraper:
            centris_new = 0
            consecutive_empty = 0

            for page in range(1, MAX_PAGES_PER_SOURCE + 1):
                if centris_new >= MULTIUNIT_TARGET or consecutive_empty >= CONSECUTIVE_EMPTY_LIMIT_CENTRIS:
                    break
                try:
                    multiunit_scrape_progress.sources["centris"].message = f"plex page {page}..."
                    parsed = await scraper.scrape_listings(category="plex", page=page)
                    if not parsed:
                        break

                    raw_list = [p for p in parsed if _is_multiunit(p)]
                    new, _, _ = await _save(raw_list, "centris", progress=multiunit_scrape_progress)
                    centris_new += new
                    consecutive_empty = 0 if new > 0 else consecutive_empty + 1
                    logger.info(
                        f"[centris-multiunit] plex page {page}: {len(parsed)} processed, "
                        f"{len(raw_list)} are 4+ units, {new} new → total new={centris_new}"
                    )
                    await asyncio.sleep(3)

                except Exception as exc:
                    logger.error(f"[centris-multiunit] plex page {page} error: {exc}")
                    multiunit_scrape_progress.total_errors += 1
                    break

            if centris_new < MULTIUNIT_TARGET:
                logger.warning(f"[centris-multiunit] only found {centris_new}/{MULTIUNIT_TARGET} new 4+ unit properties")

        multiunit_scrape_progress.sources["centris"].status = "done"

    except Exception as exc:
        multiunit_scrape_progress.sources["centris"].status  = "error"
        multiunit_scrape_progress.sources["centris"].message = str(exc)[:80]
        logger.error(f"Centris multi-unit scraper error: {exc}")

    # ── Finish ────────────────────────────────────────────────────────────────
    multiunit_scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    multiunit_scrape_progress.running        = False
    multiunit_scrape_progress.current_source = ""
    multiunit_scrape_progress.finished_at    = datetime.now(timezone.utc).isoformat()
    multiunit_scrape_progress.message = (
        f"Done — {multiunit_scrape_progress.total_new} new, "
        f"{multiunit_scrape_progress.total_updated} updated, "
        f"{multiunit_scrape_progress.total_errors} errors"
    )
    logger.info(
        "=== Multi-unit scrape job done in %.1fs — new=%d updated=%d errors=%d ===",
        multiunit_scrape_progress.elapsed_seconds,
        multiunit_scrape_progress.total_new,
        multiunit_scrape_progress.total_updated,
        multiunit_scrape_progress.total_errors,
    )


# ── Pipeline job ───────────────────────────────────────────────────────────────
# Shared with the manual POST /api/admin/pipeline endpoint (admin.py), which
# runs the same InvestmentPipeline loop independently — both check/set this
# flag so a manual trigger and the scheduled run can never overlap.
pipeline_running = False


async def pipeline_job() -> None:
    global pipeline_running
    if pipeline_running:
        logger.warning("Pipeline job requested but one is already running — skipping")
        return
    pipeline_running = True

    try:
        start = datetime.now(timezone.utc)
        logger.info("=== Pipeline job started ===")

        total_processed = total_errors = 0
        batch_size = 50

        while True:
            async with AsyncSessionLocal() as session:
                pipeline = InvestmentPipeline(session, generate_brief=True)
                stats = await pipeline.run_pending(limit=batch_size, strategy="both")
                await session.commit()

            total_processed += stats["processed"]
            total_errors    += stats.get("errors", 0)

            if stats["processed"] < batch_size:
                break

        elapsed = round((datetime.now(timezone.utc) - start).total_seconds(), 1)
        logger.info(
            "=== Pipeline job done in %ss — processed=%d errors=%d ===",
            elapsed, total_processed, total_errors,
        )
    finally:
        pipeline_running = False


# ── Verification job ───────────────────────────────────────────────────────────
# Nightly re-fetch-and-reconcile pass — see app/agent/verifier.py. Runs after
# the day's scraping is done (03:00 UTC) and pauses the three scrape/pipeline
# jobs for its duration so nothing writes to a property mid-verification.
#
# Self-pacing: each run pulls up to NIGHTLY_VERIFY_BATCH_SIZE properties,
# priority 1 = anything scraped/updated since it was last verified (the
# steady-state ongoing work), priority 2 = the oldest never-verified backlog.
# While the backlog is large, most of a night's budget goes to priority 2;
# once it's empty, each run naturally shrinks to just priority 1 — no code
# change needed to "transition," it falls out of the query.

NIGHTLY_VERIFY_BATCH_SIZE = 300
VERIFY_CONCURRENCY = 6
verification_running = False

# Set by create_scheduler() so verification_job can pause/resume the other
# jobs around its run. Only this module needs it — main.py just calls
# create_scheduler() and starts it.
_scheduler_ref: AsyncIOScheduler | None = None

PAUSABLE_JOB_IDS = ["scrape_job", "pipeline_job", "scrape_multiunit_job"]


async def _select_verification_batch(session, limit: int) -> list:
    from sqlalchemy import or_, select
    from app.models.property import Property

    stale_stmt = (
        select(Property)
        .where(
            Property.last_scraped_at.isnot(None),
            or_(
                Property.last_verified_at.is_(None),
                Property.last_scraped_at > Property.last_verified_at,
            ),
        )
        .order_by(Property.last_scraped_at.asc())
        .limit(limit)
    )
    stale = list((await session.execute(stale_stmt)).scalars().all())
    if len(stale) >= limit:
        return stale

    remaining = limit - len(stale)
    seen_ids = {p.id for p in stale}
    backlog_stmt = (
        select(Property)
        .where(Property.last_verified_at.is_(None))
        .order_by(Property.first_seen_at.asc())
        .limit(remaining + len(seen_ids))
    )
    backlog = [p for p in (await session.execute(backlog_stmt)).scalars().all() if p.id not in seen_ids]
    return stale + backlog[:remaining]


async def verification_job() -> None:
    global verification_running
    if verification_running:
        logger.warning("Verification job requested but one is already running — skipping")
        return
    verification_running = True

    paused_ids: list[str] = []
    if _scheduler_ref is not None:
        for job_id in PAUSABLE_JOB_IDS:
            if _scheduler_ref.get_job(job_id) is not None:
                _scheduler_ref.pause_job(job_id)
                paused_ids.append(job_id)
        logger.info(f"=== Verification job started — paused {paused_ids} ===")
    else:
        logger.info("=== Verification job started (no scheduler ref — nothing to pause) ===")

    start = datetime.now(timezone.utc)
    try:
        async with AsyncSessionLocal() as session:
            batch = await _select_verification_batch(session, NIGHTLY_VERIFY_BATCH_SIZE)
        if not batch:
            logger.info("=== Verification job: nothing to verify ===")
            return

        # Not run inside the session above — verify_batch opens its own fresh
        # session per property (see its docstring) rather than holding one
        # connection open for a run that can take hours.
        stats = await verify_batch(batch, _api_keys(), concurrency=VERIFY_CONCURRENCY)

        elapsed = round((datetime.now(timezone.utc) - start).total_seconds(), 1)
        logger.info(
            "=== Verification job done in %ss — %d properties: %s ===",
            elapsed, len(batch), stats,
        )
    finally:
        if _scheduler_ref is not None:
            for job_id in paused_ids:
                _scheduler_ref.resume_job(job_id)
        verification_running = False


# ── Scheduler setup ────────────────────────────────────────────────────────────

def create_scheduler() -> AsyncIOScheduler:
    interval_hours = settings.scrape_interval_hours
    start = datetime.now(timezone.utc)

    scheduler = AsyncIOScheduler(timezone="UTC")

    # Both jobs share the same interval and start reference so they run
    # concurrently every cycle — scrape_job and pipeline_job use independent
    # DB sessions, so there's no conflict running them in parallel. Analysis
    # may briefly lag a few properties behind mid-scrape; that's fine, it
    # picks them up on the next cycle.
    scheduler.add_job(
        scrape_job,
        trigger=IntervalTrigger(hours=interval_hours, start_date=start),
        id="scrape_job",
        name="Scrape Realtor + Centris + ReMax (Quebec)",
        replace_existing=True,
        misfire_grace_time=300,
    )

    scheduler.add_job(
        pipeline_job,
        trigger=IntervalTrigger(hours=interval_hours, start_date=start),
        id="pipeline_job",
        name="AI Investment Pipeline",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Fixed 2h interval regardless of settings.scrape_interval_hours (the general
    # job's interval is configurable; this one was asked for at exactly 2h).
    # Offset by 1h from the jobs above so the two schedules never fire
    # simultaneously and compete for the same Scrapfly session/credits.
    scheduler.add_job(
        scrape_multiunit_job,
        trigger=IntervalTrigger(hours=2, start_date=start + timedelta(hours=1)),
        id="scrape_multiunit_job",
        name="Scrape Realtor + Centris — 4+ unit properties only",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Nightly re-fetch-and-reconcile pass, off-peak. Pauses the three jobs
    # above for its duration — see verification_job().
    scheduler.add_job(
        verification_job,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="verification_job",
        name="Nightly data verification (re-fetch + reconcile)",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    global _scheduler_ref
    _scheduler_ref = scheduler

    return scheduler
