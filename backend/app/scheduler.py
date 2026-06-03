"""
APScheduler — automated scraping + AI pipeline.

Jobs:
  scrape_job   : runs every SCRAPE_INTERVAL_HOURS  (default 6h)
                 → Centris plex + Realtor.ca city bboxes → dedup → DB
  pipeline_job : runs 30 min after each scrape
                 → AI pipeline on all needs_reanalysis=True properties

Both jobs are fire-and-forget coroutines; errors are logged but never crash the app.
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
from app.scrapers.realtor import RealtorScraper, QUEBEC_CITY_BBOXES, API_URL, API_HEADERS
from app.scrapers.deduplicator import PropertyDeduplicator
from app.agent.pipeline import InvestmentPipeline

logger = logging.getLogger(__name__)

# ── Centris targets ────────────────────────────────────────────────────────────
CENTRIS_CATEGORIES = ["plex", "condo", "house"]
CENTRIS_PAGES_PER_CATEGORY = 10   # ~200 listings per run

# ── Realtor targets ────────────────────────────────────────────────────────────
REALTOR_RECORDS_PER_PAGE = 50
REALTOR_MAX_PER_CITY = 200        # cap per city per run


# ── Scrape job ────────────────────────────────────────────────────────────────

async def scrape_job() -> None:
    start = datetime.now(timezone.utc)
    logger.info("=== Scrape job started ===")

    total_new = total_updated = total_errors = 0

    # ── Centris ───────────────────────────────────────────────────────────────
    try:
        async with CentrisScraper(api_key=settings.scrapfly_api_key) as scraper:
            for category in CENTRIS_CATEGORIES:
                for page in range(1, CENTRIS_PAGES_PER_CATEGORY + 1):
                    try:
                        raw_list = await scraper.scrape_listings(category=category, page=page)
                        if not raw_list:
                            break

                        async with AsyncSessionLocal() as session:
                            dedup = PropertyDeduplicator(session)
                            for raw in raw_list:
                                try:
                                    _, is_new = await dedup.process(raw)
                                    if is_new:
                                        total_new += 1
                                    else:
                                        total_updated += 1
                                except Exception as exc:
                                    logger.warning(f"Centris dedup error: {exc}")
                                    total_errors += 1
                            await session.commit()

                        await asyncio.sleep(2)

                    except Exception as exc:
                        logger.error(f"Centris [{category}] page {page} error: {exc}")
                        total_errors += 1
                        await asyncio.sleep(5)
                        break

    except Exception as exc:
        logger.error(f"Centris scraper init error: {exc}")

    # ── Realtor.ca ────────────────────────────────────────────────────────────
    try:
        scraper = RealtorScraper(api_key=settings.scrapfly_api_key)

        for city_name, bbox in QUEBEC_CITY_BBOXES.items():
            city_count = 0
            page = 1

            while city_count < REALTOR_MAX_PER_CITY:
                try:
                    body = scraper._build_body(
                        bbox=bbox,
                        page=page,
                        records_per_page=REALTOR_RECORDS_PER_PAGE,
                        property_type_group_id=1,
                        transaction_type_id=2,
                    )
                    config = ScrapeConfig(
                        url=API_URL,
                        method="POST",
                        body=body,
                        headers=API_HEADERS,
                        country="ca",
                        asp=False,
                        render_js=False,
                    )
                    result = await scraper.client.async_scrape(config)

                    if result.upstream_status_code != 200:
                        break

                    data = json.loads(result.content)
                    raw_results = data.get("Results", [])
                    paging = data.get("Paging", {})
                    total_pages = int(paging.get("TotalPages", 1))

                    if not raw_results:
                        break

                    raw_list = [p for p in (scraper._parse_result(r) for r in raw_results) if p]

                    async with AsyncSessionLocal() as session:
                        dedup = PropertyDeduplicator(session)
                        for raw in raw_list:
                            try:
                                _, is_new = await dedup.process(raw)
                                if is_new:
                                    total_new += 1
                                else:
                                    total_updated += 1
                                city_count += 1
                            except Exception as exc:
                                logger.warning(f"Realtor dedup error: {exc}")
                                total_errors += 1
                        await session.commit()

                    if page >= total_pages:
                        break

                    page += 1
                    await asyncio.sleep(2)

                except Exception as exc:
                    logger.error(f"Realtor [{city_name}] page {page} error: {exc}")
                    total_errors += 1
                    await asyncio.sleep(5)
                    break

        await scraper.close()

    except Exception as exc:
        logger.error(f"Realtor scraper error: {exc}")

    elapsed = round((datetime.now(timezone.utc) - start).total_seconds(), 1)
    logger.info(
        f"=== Scrape job done in {elapsed}s — "
        f"new={total_new} updated={total_updated} errors={total_errors} ==="
    )


# ── Pipeline job ──────────────────────────────────────────────────────────────

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
        total_errors += stats.get("errors", 0)

        if stats["processed"] < batch_size:
            break   # no more pending

    elapsed = round((datetime.now(timezone.utc) - start).total_seconds(), 1)
    logger.info(
        f"=== Pipeline job done in {elapsed}s — "
        f"processed={total_processed} errors={total_errors} ==="
    )


# ── Scheduler setup ───────────────────────────────────────────────────────────

def create_scheduler() -> AsyncIOScheduler:
    interval_hours = settings.scrape_interval_hours   # default 6

    scheduler = AsyncIOScheduler(timezone="UTC")

    # Scrape every N hours
    scheduler.add_job(
        scrape_job,
        trigger=IntervalTrigger(hours=interval_hours),
        id="scrape_job",
        name="Scrape Centris + Realtor.ca",
        replace_existing=True,
        misfire_grace_time=300,   # allow up to 5 min late start
    )

    # Pipeline runs 30 min after each scrape cycle (offset)
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
    """Return a start datetime that offsets the first run by N minutes from now."""
    from datetime import timedelta
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)
