"""
APScheduler — automated scraping + AI pipeline.

Scrape targets per cycle (Quebec properties only):
  Realtor.ca  : 50  properties  (1 page × 50 records, Montreal bbox)
  Centris     : 25  properties  (~2 pages, plex category)
  ReMax        : 15  properties  (1 page × 15 records, multi-family)

API key fallback:
  SCRAPFLY_API_KEY   — primary key
  SCRAPFLY_API_KEY_2 — fallback when primary runs out of credits

Progress is tracked in app.scrape_state.scrape_progress and polled
by GET /api/admin/scrape-status every 2 seconds from the frontend.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from scrapfly import ScrapeConfig

from app.config import settings
from app.database import AsyncSessionLocal
from app.scrapers.centris import CentrisScraper
from app.scrapers.realtor import RealtorScraper, API_URL, API_HEADERS
from app.scrapers.deduplicator import PropertyDeduplicator
from app.agent.pipeline import InvestmentPipeline
from app.scrape_state import scrape_progress

logger = logging.getLogger(__name__)


# ── API keys ───────────────────────────────────────────────────────────────────

def _api_keys() -> list[str]:
    return [k for k in [settings.scrapfly_api_key, settings.scrapfly_api_key_2] if k]


# ── Targets ────────────────────────────────────────────────────────────────────

REALTOR_TARGET = 50
CENTRIS_TARGET = 50
REMAX_TARGET   = 50

REALTOR_BBOX = {
    "LatitudeMax": "45.7050", "LatitudeMin": "45.4100",
    "LongitudeMax": "-73.4750", "LongitudeMin": "-73.9800",
}


# ── Dedup helper ───────────────────────────────────────────────────────────────

async def _save(raw_list, source_key: str) -> tuple[int, int, int]:
    """Dedup + save a batch. Returns (new, updated, errors)."""
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
        await session.commit()

    # Update global progress
    sp = scrape_progress.sources[source_key]
    sp.done    += new + updated
    sp.message  = f"{sp.done} saved"
    scrape_progress.total_new     += new
    scrape_progress.total_updated += updated
    scrape_progress.total_errors  += errors
    return new, updated, errors


# ── Scrape job ─────────────────────────────────────────────────────────────────

async def scrape_job() -> None:
    now = datetime.now(timezone.utc)
    scrape_progress.reset()
    scrape_progress.started_at = now.isoformat()
    logger.info("=== Scrape job started (Realtor=%d, Centris=%d, ReMax=%d) ===",
                REALTOR_TARGET, CENTRIS_TARGET, REMAX_TARGET)

    keys = _api_keys()

    # ── 1. Realtor.ca ─────────────────────────────────────────────────────────
    scrape_progress.current_source = "realtor"
    scrape_progress.sources["realtor"].status  = "running"
    scrape_progress.sources["realtor"].message = "Connecting..."
    scrape_progress.message = "Scraping Realtor.ca..."
    logger.info("--- Realtor.ca ---")

    try:
        scraper = RealtorScraper(api_keys=keys)
        body = scraper._build_body(
            bbox=REALTOR_BBOX,
            page=1,
            records_per_page=REALTOR_TARGET,
            property_type_group_id=3,   # 3=Multi-family/Revenue (duplex, triplex, plex)
            transaction_type_id=2,
        )
        config = ScrapeConfig(
            url=API_URL, method="POST", body=body,
            headers=API_HEADERS, country="ca", asp=False, render_js=False,
        )
        result = await scraper.client.async_scrape(config)

        if result.upstream_status_code == 200:
            data       = json.loads(result.content)
            raw_all    = data.get("Results", [])
            raw_list   = [p for p in (scraper._parse_result(r) for r in raw_all) if p]
            scrape_progress.sources["realtor"].message = f"Parsing {len(raw_list)} results..."
            logger.info(f"[realtor] {len(raw_list)} results")
            await _save(raw_list, "realtor")
            scrape_progress.sources["realtor"].status = "done"
        else:
            scrape_progress.sources["realtor"].status  = "error"
            scrape_progress.sources["realtor"].message = f"HTTP {result.upstream_status_code}"
            logger.error(f"[realtor] API returned {result.upstream_status_code}")

        await scraper.close()

    except Exception as exc:
        scrape_progress.sources["realtor"].status  = "error"
        scrape_progress.sources["realtor"].message = str(exc)[:80]
        logger.error(f"Realtor scraper error: {exc}")

    scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    await asyncio.sleep(3)

    # ── 2. Centris ────────────────────────────────────────────────────────────
    scrape_progress.current_source = "centris"
    scrape_progress.sources["centris"].status  = "running"
    scrape_progress.sources["centris"].message = "Connecting..."
    scrape_progress.message = "Scraping Centris..."
    logger.info("--- Centris ---")

    try:
        async with CentrisScraper(api_keys=keys) as scraper:
            centris_done = 0
            for page in range(1, 4):
                if centris_done >= CENTRIS_TARGET:
                    break
                try:
                    scrape_progress.sources["centris"].message = f"Page {page}..."
                    raw_list = await scraper.scrape_listings(category="plex", page=page)
                    if not raw_list:
                        break

                    remaining = CENTRIS_TARGET - centris_done
                    raw_list  = raw_list[:remaining]

                    await _save(raw_list, "centris")
                    centris_done += len(raw_list)
                    logger.info(f"[centris] page {page}: {len(raw_list)} → total={centris_done}")
                    await asyncio.sleep(3)

                except Exception as exc:
                    logger.error(f"[centris] page {page} error: {exc}")
                    scrape_progress.total_errors += 1
                    break

        scrape_progress.sources["centris"].status = "done"

    except Exception as exc:
        scrape_progress.sources["centris"].status  = "error"
        scrape_progress.sources["centris"].message = str(exc)[:80]
        logger.error(f"Centris scraper error: {exc}")

    scrape_progress.elapsed_seconds = (datetime.now(timezone.utc) - now).total_seconds()
    await asyncio.sleep(3)

    # ── 3. ReMax (remax-quebec.com) ───────────────────────────────────────────
    scrape_progress.current_source = "remax"
    scrape_progress.sources["remax"].status  = "running"
    scrape_progress.sources["remax"].target  = REMAX_TARGET
    scrape_progress.sources["remax"].message = "Loading sitemap..."
    scrape_progress.message = "Scraping ReMax Québec..."
    logger.info("--- ReMax ---")

    try:
        from app.scrapers.remax import RemaxScraper
        async with RemaxScraper(api_keys=keys) as scraper:
            remax_done = 0
            page_size  = 10   # scrape 10 listings at a time
            page       = 1

            while remax_done < REMAX_TARGET:
                scrape_progress.sources["remax"].message = f"Page {page}..."
                try:
                    raw_list = await scraper.scrape_listings(
                        category="multi_family",
                        page=page,
                        page_size=page_size,
                    )
                    if not raw_list:
                        logger.info(f"[remax] No more results at page {page}")
                        break

                    remaining = REMAX_TARGET - remax_done
                    raw_list  = raw_list[:remaining]

                    await _save(raw_list, "remax")
                    remax_done += len(raw_list)
                    scrape_progress.sources["remax"].done = remax_done
                    scrape_progress.sources["remax"].pct  = round(remax_done / REMAX_TARGET * 100)
                    logger.info(f"[remax] page {page}: {len(raw_list)} → total={remax_done}")
                    page += 1
                    await asyncio.sleep(2)

                except Exception as exc:
                    logger.error(f"[remax] page {page} error: {exc}")
                    scrape_progress.total_errors += 1
                    break

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


# ── Pipeline job ───────────────────────────────────────────────────────────────

async def pipeline_job() -> None:
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


# ── Scheduler setup ────────────────────────────────────────────────────────────

def create_scheduler() -> AsyncIOScheduler:
    interval_hours = settings.scrape_interval_hours

    scheduler = AsyncIOScheduler(timezone="UTC")

    scheduler.add_job(
        scrape_job,
        trigger=IntervalTrigger(hours=interval_hours),
        id="scrape_job",
        name="Scrape Realtor + Centris + ReMax (Quebec)",
        replace_existing=True,
        misfire_grace_time=300,
    )

    scheduler.add_job(
        pipeline_job,
        trigger=IntervalTrigger(hours=interval_hours, start_date=_offset_start(minutes=30)),
        id="pipeline_job",
        name="AI Investment Pipeline",
        replace_existing=True,
        misfire_grace_time=300,
    )

    return scheduler


def _offset_start(minutes: int):
    from datetime import timedelta
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)
