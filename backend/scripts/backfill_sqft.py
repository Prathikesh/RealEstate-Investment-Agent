"""
Backfill sqft_total for all properties where it is NULL.

For each property missing sqft, fetches the detail page from its source
(Centris or Realtor.ca) and extracts the sqft via scrape_detail().
The deduplicator's _fill_gaps() then updates the property.

Run from backend/ with:
  python scripts/backfill_sqft.py
  python scripts/backfill_sqft.py --limit 100   # process only N properties
  python scripts/backfill_sqft.py --dry-run      # show count only, no scraping
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
logger = logging.getLogger("backfill_sqft")

from sqlalchemy import select, func

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.property import Property
from app.models.source import PropertySource
from app.scrapers.centris import CentrisScraper
from app.scrapers.realtor import RealtorScraper
from app.scrapers.deduplicator import PropertyDeduplicator


async def main(limit: int, dry_run: bool) -> None:
    start = time.time()

    # Count properties missing sqft
    async with AsyncSessionLocal() as session:
        total_missing = await session.scalar(
            select(func.count()).select_from(Property)
            .where(Property.sqft_total.is_(None))
            .where(Property.asking_price.isnot(None))
        )

    print(f"\n{'='*60}")
    print(f"Sqft Backfill")
    print(f"{'='*60}")
    print(f"  Properties missing sqft : {total_missing}")
    print(f"  Processing limit        : {limit}")
    if dry_run:
        print(f"  [DRY RUN] No scraping will be done.")
    print(f"{'='*60}\n")

    if dry_run:
        return

    # Initialise scrapers
    all_keys = [k for k in [
        settings.scrapfly_api_key_4,
        settings.scrapfly_api_key_3,
        settings.scrapfly_api_key_2,
        settings.scrapfly_api_key,
    ] if k]
    centris_scraper = CentrisScraper(api_keys=all_keys)
    realtor_scraper = RealtorScraper(api_keys=all_keys)

    stats = {"filled": 0, "skipped": 0, "errors": 0}

    try:
        processed = 0
        while processed < limit:
            # Fetch next batch of properties missing sqft
            async with AsyncSessionLocal() as session:
                rows = (await session.execute(
                    select(Property.id, Property.mls_number, PropertySource.source_url, PropertySource.source)
                    .join(PropertySource, PropertySource.property_id == Property.id)
                    .where(Property.sqft_total.is_(None))
                    .where(Property.asking_price.isnot(None))
                    .where(PropertySource.source_url.isnot(None))
                    .limit(min(50, limit - processed))
                )).all()

            if not rows:
                logger.info("No more properties to backfill.")
                break

            for prop_id, mls, source_url, source in rows:
                if processed >= limit:
                    break

                logger.info(f"[{source.value}] {mls} — {source_url[:70]}")

                try:
                    if source.value == "centris":
                        detail = await centris_scraper.scrape_detail(source_url)
                    elif source.value == "realtor":
                        detail = await realtor_scraper.scrape_detail(source_url)
                    else:
                        logger.info(f"  Skipping unsupported source: {source.value}")
                        stats["skipped"] += 1
                        processed += 1
                        continue

                    if detail and detail.sqft_total:
                        async with AsyncSessionLocal() as session:
                            dedup = PropertyDeduplicator(session)
                            await dedup.process(detail)
                            await session.commit()
                        logger.info(f"  Filled sqft={detail.sqft_total}")
                        stats["filled"] += 1
                    else:
                        logger.info(f"  No sqft found on detail page")
                        stats["skipped"] += 1

                    await asyncio.sleep(2)

                except Exception as exc:
                    logger.error(f"  Error: {exc}")
                    stats["errors"] += 1

                processed += 1

    finally:
        await centris_scraper.close()
        await realtor_scraper.close()

    elapsed = round(time.time() - start, 1)
    print(f"\n{'='*60}")
    print(f"DONE in {elapsed}s")
    print(f"  Filled   : {stats['filled']}")
    print(f"  Skipped  : {stats['skipped']} (no sqft on detail page)")
    print(f"  Errors   : {stats['errors']}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=10000)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    asyncio.run(main(limit=args.limit, dry_run=args.dry_run))
