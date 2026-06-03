"""
Bulk scraper — populates the DB with real Quebec properties.

Targets:
  Centris   : 500 properties  (25 pages × 20, province-wide plexes)
  Realtor.ca: 500 properties  (10 pages × 50, Quebec revenue/multi-family)

Run from backend/ with:
  python scripts/bulk_scrape.py
  python scripts/bulk_scrape.py --centris-only
  python scripts/bulk_scrape.py --realtor-only
  python scripts/bulk_scrape.py --dry-run   (shows plan, no credits used)
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
logger = logging.getLogger("bulk_scrape")

from app.config import settings
from app.database import AsyncSessionLocal
from app.scrapers.centris import CentrisScraper
from app.scrapers.realtor import RealtorScraper, QUEBEC_CITY_BBOXES
from app.scrapers.deduplicator import PropertyDeduplicator


# ── Centris ───────────────────────────────────────────────────────────────────

async def scrape_centris(target: int = 500, dry_run: bool = False) -> dict:
    pages_needed = -(-target // 20)  # ceiling division
    logger.info(f"Centris plan: {pages_needed} pages × 20 = ~{pages_needed * 20} properties")

    if dry_run:
        return {"planned_pages": pages_needed, "planned_properties": pages_needed * 20}

    stats = {"pages": 0, "scraped": 0, "new": 0, "updated": 0, "errors": 0}

    async with CentrisScraper(api_key=settings.scrapfly_api_key) as scraper:
        for page in range(1, pages_needed + 1):
            try:
                logger.info(f"Centris page {page}/{pages_needed} ...")
                raw_list = await scraper.scrape_listings(category="plex", page=page)

                if not raw_list:
                    logger.warning(f"  Page {page}: no results — may have hit the last page")
                    break

                async with AsyncSessionLocal() as session:
                    dedup = PropertyDeduplicator(session)
                    for raw in raw_list:
                        try:
                            _, is_new = await dedup.process(raw)
                            if is_new:
                                stats["new"] += 1
                            else:
                                stats["updated"] += 1
                            stats["scraped"] += 1
                        except Exception as exc:
                            logger.warning(f"  Skip {raw.mls_number}: {exc}")
                            stats["errors"] += 1
                    await session.commit()

                stats["pages"] += 1
                logger.info(
                    f"  Page {page} done — {len(raw_list)} listings | "
                    f"total new={stats['new']} updated={stats['updated']}"
                )

                if stats["scraped"] >= target:
                    logger.info(f"Centris target reached ({target})")
                    break

                # Polite delay between pages
                if page < pages_needed:
                    await asyncio.sleep(3)

            except Exception as exc:
                logger.error(f"  Page {page} failed: {exc}")
                stats["errors"] += 1
                await asyncio.sleep(5)  # back off on error

    return stats


# ── Realtor.ca ────────────────────────────────────────────────────────────────

async def scrape_realtor(target: int = 500, dry_run: bool = False) -> dict:
    """
    Iterate city-level bboxes to work around Realtor.ca's per-bbox page cap (~1-2 pages).
    Each city bbox returns its own TotalPages independently.
    """
    import json
    from scrapfly import ScrapeConfig
    from app.scrapers.realtor import API_URL, API_HEADERS

    records_per_page = 50
    cities = list(QUEBEC_CITY_BBOXES.keys())
    logger.info(
        f"Realtor plan: {len(cities)} cities × up to N pages × {records_per_page} = target {target}"
    )

    if dry_run:
        return {"planned_cities": len(cities), "planned_properties": target}

    stats = {"pages": 0, "scraped": 0, "new": 0, "updated": 0, "errors": 0}

    scraper = RealtorScraper(api_key=settings.scrapfly_api_key)

    try:
        for city_name in cities:
            if stats["scraped"] >= target:
                break

            bbox = QUEBEC_CITY_BBOXES[city_name]
            page = 1

            while stats["scraped"] < target:
                try:
                    logger.info(f"Realtor.ca [{city_name}] page {page} ...")

                    body = scraper._build_body(
                        bbox=bbox,
                        page=page,
                        records_per_page=records_per_page,
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
                        logger.error(f"  [{city_name}] page {page}: HTTP {result.upstream_status_code}")
                        stats["errors"] += 1
                        break

                    data = json.loads(result.content)
                    raw_results = data.get("Results", [])
                    paging = data.get("Paging", {})
                    total_pages = int(paging.get("TotalPages", 1))

                    logger.info(
                        f"  [{city_name}] page {page}/{total_pages} — {len(raw_results)} listings"
                    )

                    if not raw_results:
                        break

                    raw_list = [p for p in (scraper._parse_result(r) for r in raw_results) if p]

                    async with AsyncSessionLocal() as session:
                        dedup = PropertyDeduplicator(session)
                        for raw in raw_list:
                            try:
                                _, is_new = await dedup.process(raw)
                                if is_new:
                                    stats["new"] += 1
                                else:
                                    stats["updated"] += 1
                                stats["scraped"] += 1
                            except Exception as exc:
                                logger.warning(f"  Skip {raw.mls_number}: {exc}")
                                stats["errors"] += 1
                        await session.commit()

                    stats["pages"] += 1

                    if page >= total_pages:
                        logger.info(f"  [{city_name}] exhausted ({page} pages)")
                        break

                    page += 1
                    await asyncio.sleep(2)

                except Exception as exc:
                    logger.error(f"  [{city_name}] page {page} failed: {exc}")
                    stats["errors"] += 1
                    await asyncio.sleep(5)
                    break

            logger.info(
                f"[{city_name}] done — total so far: {stats['scraped']} scraped"
            )

    finally:
        await scraper.close()

    logger.info(f"Realtor.ca complete — {stats['scraped']} properties saved")
    return stats


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(
    run_centris: bool = True,
    run_realtor: bool = True,
    centris_target: int = 500,
    realtor_target: int = 500,
    dry_run: bool = False,
) -> None:
    start = time.time()

    print("\n" + "=" * 65)
    print("Quebec Real Estate — Bulk Scraper")
    print("=" * 65)

    if dry_run:
        print("\n[DRY RUN] No credits will be used.\n")

    totals = {"new": 0, "updated": 0, "errors": 0}

    if run_centris:
        print(f"\n{'─'*65}")
        print(f"CENTRIS  (target: {centris_target} properties)")
        print(f"{'─'*65}")
        result = await scrape_centris(target=centris_target, dry_run=dry_run)
        if not dry_run:
            totals["new"]     += result.get("new", 0)
            totals["updated"] += result.get("updated", 0)
            totals["errors"]  += result.get("errors", 0)
            print(f"Centris complete: {result['new']} new | {result['updated']} updated")

    if run_realtor:
        print(f"\n{'─'*65}")
        print(f"REALTOR.CA  (target: {realtor_target} properties)")
        print(f"{'─'*65}")
        result = await scrape_realtor(target=realtor_target, dry_run=dry_run)
        if not dry_run:
            totals["new"]     += result.get("new", 0)
            totals["updated"] += result.get("updated", 0)
            totals["errors"]  += result.get("errors", 0)
            print(f"Realtor complete: {result['new']} new | {result['updated']} updated")

    elapsed = round(time.time() - start, 1)
    print(f"\n{'='*65}")
    if dry_run:
        print("Dry run complete. No data written.")
    else:
        print(
            f"DONE in {elapsed}s — "
            f"new={totals['new']} | updated={totals['updated']} | errors={totals['errors']}"
        )
    print("=" * 65 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quebec bulk property scraper")
    parser.add_argument("--centris-only",  action="store_true")
    parser.add_argument("--realtor-only",  action="store_true")
    parser.add_argument("--dry-run",       action="store_true", help="Plan only, no credits used")
    parser.add_argument("--centris-target", type=int, default=500)
    parser.add_argument("--realtor-target", type=int, default=500)
    args = parser.parse_args()

    run_centris = not args.realtor_only
    run_realtor = not args.centris_only

    asyncio.run(main(
        run_centris=run_centris,
        run_realtor=run_realtor,
        centris_target=args.centris_target,
        realtor_target=args.realtor_target,
        dry_run=args.dry_run,
    ))
