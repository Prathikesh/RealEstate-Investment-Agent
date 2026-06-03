"""
End-to-end test: scrape Centris → deduplicate → write to DB → verify.
Run from backend/ with:  python tests/test_e2e.py

Uses the saved HTML file if present (no credits). Otherwise fetches live.
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

from sqlalchemy import select, func

from app.database import AsyncSessionLocal
from app.models.property import Property
from app.models.snapshot import PropertySnapshot
from app.models.source import PropertySource
from app.scrapers.centris import CentrisScraper
from app.scrapers.deduplicator import PropertyDeduplicator
from app.config import settings


async def main() -> None:
    print("=" * 60)
    print("End-to-End: Centris → DB")
    print("=" * 60)

    # ── Step 1: Scrape ────────────────────────────────────────────────────────
    saved = Path("probe_plex~a-vendre~montreal.html")
    async with CentrisScraper(api_key=settings.scrapfly_api_key) as scraper:
        if saved.exists():
            print(f"\n[1] Parsing saved HTML — no credits used")
            html = saved.read_text(encoding="utf-8")
            raw_properties = scraper._parse_search_page(html, page_url="[saved]")
        else:
            print(f"\n[1] Fetching live from Centris (uses ~16 credits) ...")
            raw_properties = await scraper.scrape_listings(category="plex", city="montreal")

    print(f"    Scraped {len(raw_properties)} properties")

    # ── Step 2: Write to DB ───────────────────────────────────────────────────
    print(f"\n[2] Writing to database ...")
    new_count = updated_count = skipped_count = 0

    async with AsyncSessionLocal() as session:
        dedup = PropertyDeduplicator(session)

        for raw in raw_properties:
            try:
                prop, is_new = await dedup.process(raw)
                if is_new:
                    new_count += 1
                else:
                    updated_count += 1
            except Exception as exc:
                skipped_count += 1
                logging.warning(f"Skipped {raw.mls_number}: {exc}")

        await session.commit()

    print(f"    New:     {new_count}")
    print(f"    Updated: {updated_count}")
    print(f"    Skipped: {skipped_count}")

    # ── Step 3: Verify in DB ──────────────────────────────────────────────────
    print(f"\n[3] Verifying database ...")

    async with AsyncSessionLocal() as session:
        prop_count = await session.scalar(select(func.count()).select_from(Property))
        snap_count = await session.scalar(select(func.count()).select_from(PropertySnapshot))
        src_count  = await session.scalar(select(func.count()).select_from(PropertySource))

        print(f"    properties table:         {prop_count} rows")
        print(f"    property_snapshots table: {snap_count} rows")
        print(f"    property_sources table:   {src_count} rows")

        # Show first 5 properties
        props = (await session.scalars(
            select(Property).order_by(Property.created_at.desc()).limit(5)
        )).all()

        print(f"\n    Last 5 inserted:\n")
        for p in props:
            price = f"${p.asking_price:,.0f}" if p.asking_price else "no price"
            print(
                f"    MLS={p.mls_number or '?':>10} | "
                f"{price:>14} | {p.property_type.value:>12} | {p.city}"
            )
            print(f"    {p.full_address}")
            print()

    print("=" * 60)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
