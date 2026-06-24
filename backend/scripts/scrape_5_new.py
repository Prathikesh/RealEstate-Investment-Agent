"""
Scrape exactly 5 new revenue properties from Realtor.ca, run the full
AI pipeline on each one (calc-engine + risk + neighbourhood + Claude brief),
and print a summary of what was added to the dashboard.

Usage (from backend/ directory, with venv activated):
    python scripts/scrape_5_new.py
"""
import asyncio
import json
import logging
import sys
import os

# Allow running from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("scrape_5_new")

# Silence noisy sub-loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("scrapfly").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
logging.getLogger("aiosqlite").setLevel(logging.WARNING)


TARGET_NEW = 5          # stop after saving this many brand-new properties
MAX_PAGES  = 5          # safety cap — won't scan more than this many API pages
PAGE_SIZE  = 12         # realtor.ca API records_per_page

# Multi-family/revenue bbox — Montreal island focus (plexes, duplexes, triplexes)
BBOX = {
    "LatitudeMax": "45.7050", "LatitudeMin": "45.4100",
    "LongitudeMax": "-73.4750", "LongitudeMin": "-73.9800",
}


async def main() -> None:
    from app.config import settings
    from app.database import AsyncSessionLocal
    from app.scrapers.realtor import RealtorScraper, API_URL, API_HEADERS
    from app.scrapers.deduplicator import PropertyDeduplicator
    from app.agent.pipeline import InvestmentPipeline
    from scrapfly import ScrapeConfig

    api_keys = [k for k in [settings.scrapfly_api_key, getattr(settings, "scrapfly_api_key_2", None)] if k]
    if not api_keys:
        logger.error("No SCRAPFLY_API_KEY found in .env — cannot scrape.")
        sys.exit(1)

    logger.info("=== Scraping realtor.ca (revenue properties, Montreal) ===")

    scraper = RealtorScraper(api_keys=api_keys)
    saved_properties = []   # (Property, is_new) for newly saved ones
    pages_tried = 0

    for page in range(1, MAX_PAGES + 1):
        if len(saved_properties) >= TARGET_NEW:
            break

        pages_tried += 1
        logger.info(f"Fetching page {page} from realtor.ca API ...")

        body = scraper._build_body(
            bbox=BBOX,
            page=page,
            records_per_page=PAGE_SIZE,
            property_type_group_id=3,   # 3 = Multi-family / Revenue
            transaction_type_id=2,      # 2 = For Sale
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

        try:
            result = await scraper.client.async_scrape(config)
        except Exception as exc:
            logger.error(f"Scrapfly error on page {page}: {exc}")
            break

        if result.upstream_status_code != 200:
            logger.error(f"API returned HTTP {result.upstream_status_code} on page {page}")
            break

        try:
            data = json.loads(result.content)
        except Exception as exc:
            logger.error(f"JSON parse error: {exc}")
            break

        raw_results = data.get("Results", [])
        logger.info(f"  Page {page}: {len(raw_results)} raw results from API")

        if not raw_results:
            logger.info("  No more results — stopping.")
            break

        # Parse and deduplicate
        async with AsyncSessionLocal() as session:
            dedup = PropertyDeduplicator(session)
            for r in raw_results:
                if len(saved_properties) >= TARGET_NEW:
                    break
                raw = scraper._parse_result(r)
                if not raw or not raw.asking_price:
                    continue
                try:
                    prop, is_new = await dedup.process(raw)
                    if is_new:
                        saved_properties.append(prop)
                        logger.info(
                            f"  [NEW] {prop.full_address} — "
                            f"${prop.asking_price:,.0f} | {prop.property_type}"
                        )
                    else:
                        logger.debug(f"  [DUP] {prop.full_address} — already in DB")
                except Exception as exc:
                    logger.warning(f"  Dedup error: {exc}")
            await session.commit()

        await asyncio.sleep(2)   # be polite between API pages

    await scraper.close()

    if not saved_properties:
        logger.warning("No new properties found — they may all already be in the database.")
        logger.info("Tip: try changing BBOX or property_type_group_id to get different results.")
        return

    logger.info(f"\n=== {len(saved_properties)} new properties saved. Running AI pipeline ... ===\n")

    # Run enhanced pipeline on each new property
    results = []
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        from app.models.property import Property

        for prop in saved_properties:
            # Re-fetch the prop inside this session so it's attached
            db_prop = await session.get(Property, prop.id)
            if not db_prop:
                continue

            logger.info(f"Analyzing: {db_prop.full_address}")
            try:
                pipeline = InvestmentPipeline(session, generate_brief=True)
                await pipeline.run(db_prop, strategy="both", force_brief=True)
                await session.commit()
                results.append({
                    "address":  db_prop.full_address,
                    "city":     db_prop.city,
                    "type":     db_prop.property_type.value if db_prop.property_type else "?",
                    "price":    db_prop.asking_price,
                    "score":    db_prop.score,
                    "category": db_prop.score_category.value if db_prop.score_category else "?",
                    "cap_rate": db_prop.cap_rate,
                    "cf_mo":    db_prop.monthly_cash_flow,
                    "has_brief": bool(db_prop.ai_brief_en),
                    "id":       str(db_prop.id),
                })
                logger.info(
                    f"  → Score: {db_prop.score}/100 ({db_prop.score_category.value if db_prop.score_category else '?'}) | "
                    f"cap={db_prop.cap_rate}% | cf={db_prop.monthly_cash_flow}/mo | "
                    f"brief={'✓' if db_prop.ai_brief_en else '✗'}"
                )
            except Exception as exc:
                logger.error(f"  Pipeline error: {exc}")

    # Print final summary table (ASCII only for Windows terminal compatibility)
    sep = "=" * 80
    print("\n" + sep)
    print(f"  SCRAPE COMPLETE -- {len(results)} new properties added to dashboard")
    print(sep)
    for i, r in enumerate(results, 1):
        score = r["score"] or 0
        score_bar = "#" * (score // 10) + "-" * (10 - score // 10)
        price_str = f"${r['price']:,.0f}" if r["price"] else "---"
        cap_str   = f"{r['cap_rate']:.2f}%" if r["cap_rate"] else "---"
        cf_str    = f"${r['cf_mo']:,.0f}/mo" if r["cf_mo"] is not None else "---"
        brief_str = "Generated OK" if r["has_brief"] else "Not generated"
        print(f"\n  {i}. {r['address']} ({r['city']})")
        print(f"     Type    : {r['type']}")
        print(f"     Price   : {price_str}")
        print(f"     Score   : {r['score']}/100  [{score_bar}]  {r['category'].upper()}")
        print(f"     Cap Rate: {cap_str}")
        print(f"     CF/mo   : {cf_str}")
        print(f"     AI Brief: {brief_str}")
        print(f"     View at : http://localhost:3000/properties/{r['id']}")
    print("\n" + sep + "\n")


if __name__ == "__main__":
    asyncio.run(main())
