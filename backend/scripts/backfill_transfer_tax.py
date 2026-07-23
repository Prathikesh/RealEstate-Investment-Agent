"""
Backfill the real Centris-computed transfer tax (droits de mutation) for all
Centris-sourced properties that don't have it yet.

Re-scrapes each property's detail page via the fixed scrape_detail() (which
now clicks Centris's own tax calculator instead of passively waiting), then
runs it through the deduplicator so prop.welcome_tax gets the real scraped
value instead of this project's own bracket-formula estimate.

Run from backend/ with:
  python scripts/backfill_transfer_tax.py
  python scripts/backfill_transfer_tax.py --limit 10
  python scripts/backfill_transfer_tax.py --dry-run
"""
import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("backfill_transfer_tax")

from sqlalchemy import select, func

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.property import Property, PropertyStatus
from app.models.snapshot import ScraperSource
from app.models.source import PropertySource
from app.scrapers.centris import CentrisScraper
from app.scrapers.deduplicator import PropertyDeduplicator


async def main(limit: int, dry_run: bool) -> None:
    start = time.time()

    async with AsyncSessionLocal() as session:
        total_missing = await session.scalar(
            select(func.count()).select_from(Property)
            .join(PropertySource, PropertySource.property_id == Property.id)
            .where(PropertySource.source == ScraperSource.CENTRIS)
            .where(
                (Property.raw_expenses.is_(None)) |
                (~Property.raw_expenses.has_key("welcome_tax_centris"))
            )
            .where(Property.status != PropertyStatus.DELISTED)
        )

    print(f"\n{'='*60}")
    print(f"Transfer Tax Backfill (Centris)")
    print(f"{'='*60}")
    print(f"  Properties missing real transfer tax : {total_missing}")
    print(f"  Processing limit                     : {limit}")
    if dry_run:
        print(f"  [DRY RUN] No scraping will be done.")
    print(f"{'='*60}\n")

    if dry_run:
        return

    all_keys = [k for k in [
        settings.scrapfly_api_key_4,
        settings.scrapfly_api_key_3,
        settings.scrapfly_api_key_2,
        settings.scrapfly_api_key,
    ] if k]
    scraper = CentrisScraper(api_keys=all_keys)

    stats = {"filled": 0, "delisted": 0, "skipped": 0, "errors": 0}

    try:
        processed = 0
        while processed < limit:
            async with AsyncSessionLocal() as session:
                rows = (await session.execute(
                    select(Property.id, Property.mls_number, PropertySource.source_url)
                    .join(PropertySource, PropertySource.property_id == Property.id)
                    .where(PropertySource.source == ScraperSource.CENTRIS)
                    .where(
                        (Property.raw_expenses.is_(None)) |
                        (~Property.raw_expenses.has_key("welcome_tax_centris"))
                    )
                    .where(PropertySource.source_url.isnot(None))
                    .limit(min(20, limit - processed))
                )).all()

            if not rows:
                logger.info("No more properties to backfill.")
                break

            for prop_id, mls, source_url in rows:
                if processed >= limit:
                    break

                logger.info(f"[centris] {mls} — {source_url[-60:]}")

                try:
                    detail = await scraper.scrape_detail(source_url)
                    if detail and detail.is_delisted:
                        async with AsyncSessionLocal() as session:
                            dedup = PropertyDeduplicator(session)
                            await dedup.process(detail)
                            await session.commit()
                        logger.info(f"  Delisted — marked and skipping future retries")
                        stats["delisted"] += 1
                    elif detail and detail.welcome_tax:
                        async with AsyncSessionLocal() as session:
                            dedup = PropertyDeduplicator(session)
                            await dedup.process(detail)
                            await session.commit()
                        logger.info(f"  Filled welcome_tax={detail.welcome_tax}")
                        stats["filled"] += 1
                    else:
                        logger.info(f"  No transfer tax found on detail page")
                        stats["skipped"] += 1

                except Exception as exc:
                    logger.error(f"  Error: {exc}")
                    stats["errors"] += 1

                processed += 1
                await asyncio.sleep(4)  # avoid bursty back-to-back requests

    finally:
        await scraper.close()

    elapsed = round(time.time() - start, 1)
    print(f"\n{'='*60}")
    print(f"DONE in {elapsed}s")
    print(f"  Filled   : {stats['filled']}")
    print(f"  Delisted : {stats['delisted']} (sold/removed on Centris, marked & excluded going forward)")
    print(f"  Skipped  : {stats['skipped']} (calculator not found/failed)")
    print(f"  Errors   : {stats['errors']}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=10000)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    asyncio.run(main(limit=args.limit, dry_run=args.dry_run))
