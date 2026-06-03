"""
Test Centris scraper.
Run from backend/ with:  python tests/test_centris.py
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

from app.config import settings
from app.scrapers.centris import CentrisScraper


async def main() -> None:
    print("=" * 60)
    print("Centris Scraper Test")
    print("=" * 60)

    async with CentrisScraper(api_key=settings.scrapfly_api_key) as scraper:

        # Parse from already-saved HTML (free — no credits used)
        saved = Path("probe_plex~a-vendre~montreal.html")
        if saved.exists():
            print(f"\n[1] Parsing saved HTML ({saved.name}) — no credits used")
            html = saved.read_text(encoding="utf-8")
            properties = scraper._parse_search_page(html, page_url="[saved file]")
        else:
            # Live fetch (uses ~16 credits)
            print("\n[1] Fetching Montreal plexes from Centris (live) ...")
            properties = await scraper.scrape_listings(category="plex", city="montreal", page=1)

        print(f"\nFound {len(properties)} properties\n")

        for i, prop in enumerate(properties[:10], 1):
            price = f"${prop.asking_price:,.0f}" if prop.asking_price else "no price"
            print(
                f"  {i:02d}. MLS={prop.mls_number or '?':>10} | "
                f"{price:>14} | "
                f"{prop.property_type or '?':>12} | "
                f"{prop.city or '?'}"
            )
            if prop.full_address:
                print(f"       {prop.full_address}")
            print()

        # Summary
        with_price = sum(1 for p in properties if p.asking_price)
        with_mls   = sum(1 for p in properties if p.mls_number)
        with_city  = sum(1 for p in properties if p.city)
        print(f"  Properties with price : {with_price}/{len(properties)}")
        print(f"  Properties with MLS   : {with_mls}/{len(properties)}")
        print(f"  Properties with city  : {with_city}/{len(properties)}")


if __name__ == "__main__":
    asyncio.run(main())
