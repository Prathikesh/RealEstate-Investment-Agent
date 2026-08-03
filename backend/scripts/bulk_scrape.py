"""
Bulk scraper — populates the DB with Quebec plex/revenue properties.

Default strategy (prototype):
  Centris   : 100 properties, Montreal only (best comparable density)
  Realtor.ca: 100 properties, Montreal bbox (API, no ASP needed)

Detail pages are fetched for EVERY property.  Without them we have no taxes,
no sqft, no rental income, no bedrooms — the AI analysis produces only dashes.

Credit budget per 1000-credit key:
  Centris search pages (ASP+JS) : 5 × 80 = 400 credits
  Centris detail pages (cheap)  : 100 × 5 = 500 credits   ← session cookie trick
  Total                         : ~900 credits per key

Run from backend/ with:
  python scripts/bulk_scrape.py                     # Centris + Realtor, 100 each
  python scripts/bulk_scrape.py --centris-only
  python scripts/bulk_scrape.py --realtor-only
  python scripts/bulk_scrape.py --dry-run
  python scripts/bulk_scrape.py --centris-target 50 --realtor-target 50
  python scripts/bulk_scrape.py --no-details        # skip detail pages (faster, less data)
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
from app.scrapers.remax import RemaxScraper
from app.scrapers.deduplicator import PropertyDeduplicator


# -- Centris -------------------------------------------------------------------

async def scrape_centris(
    target: int = 100,
    city: str = "montreal",
    dry_run: bool = False,
    fetch_details: bool = True,
) -> dict:
    """
    Scrape Centris plex listings.
    city="montreal" for prototype (best comparable density).
    Pass city=None for province-wide.
    """
    pages_needed = -(-target // 20)  # ceiling division
    city_label = city or "all QC"
    logger.info(
        f"Centris plan: {pages_needed} pages × 20 = ~{pages_needed * 20} properties "
        f"({city_label})" + (" + detail pages" if fetch_details else "")
    )

    if dry_run:
        return {"planned_pages": pages_needed, "planned_properties": pages_needed * 20}

    stats = {"pages": 0, "scraped": 0, "new": 0, "updated": 0, "errors": 0, "details": 0}

    async with CentrisScraper(api_keys=settings.scrapfly_api_key) as scraper:
        for page in range(1, pages_needed + 1):
            try:
                logger.info(f"Centris page {page}/{pages_needed} ({city_label}) ...")
                raw_list = await scraper.scrape_listings(category="plex", city=city, page=page)

                if not raw_list:
                    logger.warning(f"  Page {page}: no results")
                    break

                # -- Phase 1: save search-card data ----------------------------
                async with AsyncSessionLocal() as session:
                    dedup = PropertyDeduplicator(session)
                    for raw in raw_list:
                        try:
                            _, is_new = await dedup.process(raw)
                            stats["new" if is_new else "updated"] += 1
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

                # -- Phase 2: detail pages (taxes, income, sqft, coords) -------
                if fetch_details:
                    for raw in raw_list:
                        if not raw.source_url:
                            continue
                        try:
                            logger.info(f"  Detail: {raw.mls_number} ...")
                            detail = await scraper.scrape_detail(raw.source_url)
                            if detail:
                                async with AsyncSessionLocal() as ds:
                                    await PropertyDeduplicator(ds).process(detail)
                                    await ds.commit()
                                stats["details"] += 1
                            await asyncio.sleep(1)
                        except Exception as exc:
                            logger.warning(f"  Detail failed {raw.mls_number}: {exc}")

                if stats["scraped"] >= target:
                    logger.info(f"Centris target reached ({target})")
                    break

                if page < pages_needed:
                    await asyncio.sleep(3)

            except Exception as exc:
                logger.error(f"  Page {page} failed: {exc}")
                stats["errors"] += 1
                await asyncio.sleep(5)

    logger.info(
        f"Centris complete — {stats['scraped']} properties"
        + (f", {stats['details']} detail pages" if fetch_details else "")
    )
    return stats


# -- Realtor.ca ----------------------------------------------------------------

# Realtor.ca's PropertyTypeGroupID param doesn't actually filter server-side
# (confirmed: group_id=1 vs 3 return identical results) — filter client-side
# on the property_type RawProperty already derives from Building.Type instead.
PLEX_TYPES = {"duplex", "triplex", "quadruplex", "quintuplex_plus"}


async def _load_known_mls_numbers() -> set[str]:
    """MLS numbers already in the DB — skip these entirely (no re-scrape, no re-detail)."""
    from sqlalchemy import select
    from app.models.property import Property

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Property.mls_number).where(Property.mls_number.isnot(None))
        )
        return {r[0] for r in rows}


async def scrape_realtor(
    target: int = 100,
    dry_run: bool = False,
    fetch_details: bool = True,
    city: str = "montreal",
    plex_only: bool = False,
) -> dict:
    """
    Scrape Realtor.ca via API.
    Montreal bbox only for prototype; no ASP needed for the API call itself.
    Realtor.ca API results already include lat/lng and some key fields.

    Always skips any MLS number already present in the DB — avoids paying for
    detail-page credits on properties we already have. If plex_only=True, also
    keeps only multi-family listings (duplex/triplex/quadruplex/quintuplex+).
    """
    import json as _json
    from scrapfly import ScrapeConfig
    from app.scrapers.realtor import API_URL, API_HEADERS

    records_per_page = 50
    # Which city bbox(es) to scrape — defaults to Montreal, overridable via --realtor-city.
    # "all" covers every bbox in QUEBEC_CITY_BBOXES in one run.
    if city == "all":
        cities = dict(QUEBEC_CITY_BBOXES)
    else:
        target_cities = [city] if city else ["montreal"]
        cities = {k: v for k, v in QUEBEC_CITY_BBOXES.items() if k in target_cities}
        if not cities:
            logger.warning(f"Unknown realtor city '{city}'. Options: all, {list(QUEBEC_CITY_BBOXES)}. Falling back to Montreal.")
            cities = {"montreal": QUEBEC_CITY_BBOXES["montreal"]}

    logger.info(
        f"Realtor plan: cities={list(cities.keys())} target={target}"
        + (" + detail pages" if fetch_details else "")
    )

    if dry_run:
        return {"planned_cities": len(cities), "planned_properties": target}

    stats = {"pages": 0, "scraped": 0, "new": 0, "updated": 0, "errors": 0, "details": 0, "skipped_known": 0, "skipped_type": 0}

    known_mls = await _load_known_mls_numbers()
    logger.info(f"  {len(known_mls)} MLS numbers already in DB — will be skipped")

    realtor_keys = [k for k in [
        settings.scrapfly_api_key,
    ] if k]
    scraper = RealtorScraper(api_keys=realtor_keys)

    try:
        for city_name, bbox in cities.items():
            if stats["scraped"] >= target:
                break

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
                        logger.error(f"  [{city_name}] HTTP {result.upstream_status_code}")
                        stats["errors"] += 1
                        break

                    data = _json.loads(result.content)
                    raw_results = data.get("Results", [])
                    paging = data.get("Paging", {})
                    total_pages = int(paging.get("TotalPages", 1))

                    logger.info(
                        f"  [{city_name}] page {page}/{total_pages} — {len(raw_results)} listings"
                    )

                    if not raw_results:
                        break

                    parsed = [p for p in (scraper._parse_result(r) for r in raw_results) if p]

                    raw_list = []
                    for p in parsed:
                        if plex_only and p.property_type not in PLEX_TYPES:
                            stats["skipped_type"] += 1
                            continue
                        if p.mls_number in known_mls:
                            stats["skipped_known"] += 1
                            continue
                        known_mls.add(p.mls_number)
                        raw_list.append(p)

                    if not raw_list:
                        logger.info(f"  [{city_name}] page {page}: nothing new/relevant on this page")

                    # -- Phase 1: save API data --------------------------------
                    async with AsyncSessionLocal() as session:
                        dedup = PropertyDeduplicator(session)
                        for raw in raw_list:
                            try:
                                _, is_new = await dedup.process(raw)
                                stats["new" if is_new else "updated"] += 1
                                stats["scraped"] += 1
                            except Exception as exc:
                                logger.warning(f"  Skip {raw.mls_number}: {exc}")
                                stats["errors"] += 1
                        await session.commit()

                    stats["pages"] += 1

                    # -- Phase 2: detail pages ---------------------------------
                    if fetch_details:
                        for raw in raw_list:
                            detail_url = raw.source_url
                            if not detail_url or detail_url == API_URL:
                                continue
                            try:
                                logger.info(f"  Detail: {raw.mls_number} ...")
                                detail = await scraper.scrape_detail(detail_url)
                                if detail:
                                    async with AsyncSessionLocal() as ds:
                                        await PropertyDeduplicator(ds).process(detail)
                                        await ds.commit()
                                    stats["details"] += 1
                                await asyncio.sleep(1)
                            except Exception as exc:
                                logger.warning(f"  Detail failed {raw.mls_number}: {exc}")

                    if page >= total_pages:
                        break

                    page += 1
                    await asyncio.sleep(2)

                except Exception as exc:
                    logger.error(f"  [{city_name}] page {page} failed: {exc}")
                    stats["errors"] += 1
                    await asyncio.sleep(5)
                    break

    finally:
        await scraper.close()

    logger.info(
        f"Realtor.ca complete — {stats['scraped']} properties"
        + (f", {stats['details']} detail pages" if fetch_details else "")
        + f" | skipped: {stats['skipped_type']} non-plex, {stats['skipped_known']} already known"
    )
    return stats


# -- ReMax Canada -------------------------------------------------------------

# scrape_listings() has no server/sitemap-side category filter (remax-quebec.com's
# sitemap has no type metadata) — filter client-side on the parsed property_type
# instead, same pattern as Realtor's PLEX_TYPES filter above.
REMAX_CATEGORY_TYPES: dict[str, set[str]] = {
    "multi_family":  {"duplex", "triplex", "quadruplex", "quintuplex_plus"},
    "single_family": {"single_family"},
    "condo":         {"condo"},
}
REMAX_MAX_PAGES = 200   # safety cap — filtering to a narrow category can exhaust the sitemap before reaching target


async def scrape_remax(
    target: int = 100,
    category: str = "multi_family",
    dry_run: bool = False,
    fetch_details: bool = True,
) -> dict:
    """
    Scrape ReMax Quebec listings from remax-quebec.com.
    category: "multi_family" | "single_family" | "condo" | "all"
    Filtered client-side on parsed property_type — see REMAX_CATEGORY_TYPES.

    Uses sitemap_properties.xml to discover Quebec listing URLs (all cities, all
    types), then scrapes individual listing pages (no JS render, ~1 credit each).
    No Phase 2 detail pages needed — scrape_listings() already fetches full detail.
    Credit budget: ~1 (sitemap) + pages-scanned × 1 (listing pages).
    """
    page_size = 10
    wanted_types = REMAX_CATEGORY_TYPES.get(category)

    logger.info(
        f"ReMax plan: target={target} properties from remax-quebec.com sitemap "
        f"(category={category or 'all'})"
    )

    if dry_run:
        return {"planned_properties": target}

    stats = {"pages": 0, "scraped": 0, "new": 0, "updated": 0, "errors": 0, "details": 0}

    async with RemaxScraper(api_keys=settings.scrapfly_api_key) as scraper:
        page = 1
        while stats["scraped"] < target:
            try:
                logger.info(f"ReMax page {page} ...")
                fetched = await scraper.scrape_listings(page=page, page_size=page_size)

                if not fetched:
                    logger.warning(f"  Page {page}: no results — stopping")
                    break

                raw_list = (
                    [p for p in fetched if p.property_type in wanted_types]
                    if wanted_types else fetched
                )

                # Save listing data (already full detail — scraped individual pages)
                async with AsyncSessionLocal() as session:
                    dedup = PropertyDeduplicator(session)
                    for raw in raw_list:
                        try:
                            _, is_new = await dedup.process(raw)
                            stats["new" if is_new else "updated"] += 1
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
                    logger.info(f"ReMax target reached ({target})")
                    break

                page += 1
                if page > REMAX_MAX_PAGES:
                    logger.warning(f"ReMax hit page cap ({REMAX_MAX_PAGES}) before reaching target ({target})")
                    break
                await asyncio.sleep(2)

            except Exception as exc:
                logger.error(f"  Page {page} failed: {exc}")
                stats["errors"] += 1
                page += 1
                await asyncio.sleep(5)

    logger.info(
        f"ReMax complete — {stats['scraped']} properties"
        + (f", {stats['details']} detail pages" if fetch_details else "")
    )
    return stats


# -- Coverage check ------------------------------------------------------------

async def print_coverage() -> None:
    """Print data quality summary after scraping."""
    import asyncpg
    db_url = settings.database_url.replace("+asyncpg", "").replace("postgresql://", "postgresql://")
    try:
        conn = await asyncpg.connect(db_url)
        try:
            total    = await conn.fetchval("SELECT COUNT(*) FROM properties")
            coords   = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE location IS NOT NULL")
            sqft     = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE sqft_total IS NOT NULL")
            year     = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE year_built IS NOT NULL")
            tax      = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE municipal_taxes_annual IS NOT NULL")
            income   = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE rental_income_monthly IS NOT NULL")
            units    = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE unit_count IS NOT NULL")
            beds     = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE bedrooms_total IS NOT NULL")

            def pct(n: int) -> str:
                return f"{n}/{total} ({100*n//total if total else 0}%)"

            print("\n-- Data Coverage ---------------------------------")
            print(f"  Total properties : {total}")
            print(f"  Has coordinates  : {pct(coords)}")
            print(f"  Has sqft         : {pct(sqft)}")
            print(f"  Has year built   : {pct(year)}")
            print(f"  Has muni tax     : {pct(tax)}")
            print(f"  Has rental income: {pct(income)}")
            print(f"  Has unit count   : {pct(units)}")
            print(f"  Has bedrooms     : {pct(beds)}")
            print("--------------------------------------------------")
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning(f"Coverage check failed: {exc}")


# -- Main ----------------------------------------------------------------------

async def main(
    run_centris: bool = True,
    run_realtor: bool = True,
    run_remax: bool = False,
    centris_target: int = 100,
    realtor_target: int = 100,
    remax_target: int = 100,
    centris_city: str = "montreal",
    realtor_city: str = "montreal",
    remax_category: str = "multi_family",
    dry_run: bool = False,
    centris_details: bool = True,
    realtor_details: bool = True,
    remax_details: bool = True,
    realtor_plex_only: bool = False,
) -> None:
    start = time.time()

    print("\n" + "=" * 65)
    print("Quebec Real Estate — Bulk Scraper")
    print("=" * 65)

    if dry_run:
        print("\n[DRY RUN] No credits will be used.\n")

    totals = {"new": 0, "updated": 0, "errors": 0}

    if run_centris:
        print(f"\n{'-'*65}")
        print(f"CENTRIS  (target: {centris_target}, city: {centris_city or 'all QC'})")
        print(f"{'-'*65}")
        result = await scrape_centris(
            target=centris_target,
            city=centris_city,
            dry_run=dry_run,
            fetch_details=centris_details,
        )
        if not dry_run:
            totals["new"]     += result.get("new", 0)
            totals["updated"] += result.get("updated", 0)
            totals["errors"]  += result.get("errors", 0)
            print(f"Centris: {result['new']} new | {result['updated']} updated | {result['details']} detail pages")

    if run_realtor:
        print(f"\n{'-'*65}")
        print(f"REALTOR.CA  (target: {realtor_target})")
        print(f"{'-'*65}")
        result = await scrape_realtor(
            target=realtor_target,
            dry_run=dry_run,
            fetch_details=realtor_details,
            city=realtor_city,
            plex_only=realtor_plex_only,
        )
        if not dry_run:
            totals["new"]     += result.get("new", 0)
            totals["updated"] += result.get("updated", 0)
            totals["errors"]  += result.get("errors", 0)
            print(f"Realtor: {result['new']} new | {result['updated']} updated | {result['details']} detail pages")

    if run_remax:
        print(f"\n{'-'*65}")
        print(f"REMAX  (target: {remax_target}, category: {remax_category})")
        print(f"{'-'*65}")
        result = await scrape_remax(
            target=remax_target,
            category=remax_category,
            dry_run=dry_run,
            fetch_details=remax_details,
        )
        if not dry_run:
            totals["new"]     += result.get("new", 0)
            totals["updated"] += result.get("updated", 0)
            totals["errors"]  += result.get("errors", 0)
            print(f"ReMax: {result['new']} new | {result['updated']} updated | {result.get('details', 0)} detail pages")

    elapsed = round(time.time() - start, 1)
    print(f"\n{'='*65}")
    if dry_run:
        print("Dry run complete. No data written.")
    else:
        print(
            f"DONE in {elapsed}s — "
            f"new={totals['new']} | updated={totals['updated']} | errors={totals['errors']}"
        )
        print("=" * 65)
        await print_coverage()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quebec bulk property scraper")
    parser.add_argument("--centris-only",    action="store_true")
    parser.add_argument("--realtor-only",    action="store_true")
    parser.add_argument("--remax-only",      action="store_true")
    parser.add_argument("--dry-run",         action="store_true")
    parser.add_argument("--centris-target",  type=int, default=100)
    parser.add_argument("--realtor-target",  type=int, default=100)
    parser.add_argument("--remax-target",    type=int, default=100)
    parser.add_argument("--centris-city",    type=str, default="montreal",
                        help="City slug for Centris search (default: montreal). Pass empty for province-wide.")
    parser.add_argument("--realtor-city",    type=str, default="montreal",
                        help="City bbox for Realtor.ca: montreal | laval | longueuil | south_shore | "
                             "quebec_city | sherbrooke | gatineau | trois_rivieres | all "
                             "(default: montreal; 'all' covers every Quebec city bbox in one run).")
    parser.add_argument("--remax-category",  type=str, default="multi_family",
                        choices=["multi_family", "single_family", "condo", "all"],
                        help="ReMax property category, filtered client-side (default: multi_family)")
    parser.add_argument("--no-details",      action="store_true",
                        help="Skip detail page enrichment for all scrapers")
    parser.add_argument("--realtor-plex-only", action="store_true",
                        help="Only keep duplex/triplex/quadruplex/quintuplex+ listings from Realtor.ca "
                             "(default: off — keeps all residential types)")
    args = parser.parse_args()

    any_only = args.centris_only or args.realtor_only or args.remax_only
    run_centris = args.centris_only or not any_only
    run_realtor = args.realtor_only or not any_only
    run_remax   = args.remax_only   or not any_only

    asyncio.run(main(
        run_centris=run_centris,
        run_realtor=run_realtor,
        run_remax=run_remax,
        centris_target=args.centris_target,
        realtor_target=args.realtor_target,
        remax_target=args.remax_target,
        centris_city=args.centris_city,
        realtor_city=args.realtor_city,
        remax_category=args.remax_category,
        dry_run=args.dry_run,
        centris_details=not args.no_details,
        realtor_details=not args.no_details,
        remax_details=not args.no_details,
        realtor_plex_only=args.realtor_plex_only,
    ))
