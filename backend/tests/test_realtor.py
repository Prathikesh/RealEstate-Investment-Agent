"""
Test Realtor.ca scraper — parses saved JSON (no credits) then optionally live.
Run from backend/ with:  python tests/test_realtor.py
"""
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

from app.config import settings
from app.scrapers.realtor import RealtorScraper


async def main() -> None:
    print("=" * 60)
    print("Realtor.ca Scraper Test")
    print("=" * 60)

    scraper = RealtorScraper(api_key=settings.scrapfly_api_key)

    try:
        # Parse from already-saved JSON (free)
        saved = Path("realtor_probe_PropertySearch_Post.json")
        if saved.exists():
            print(f"\n[1] Parsing saved JSON ({saved.name}) — no credits used")
            data = json.loads(saved.read_text(encoding="utf-8"))
            raw_results = data.get("Results", [])
            properties = [p for p in (scraper._parse_result(r) for r in raw_results) if p]
        else:
            print("\n[1] Fetching Montreal listings from Realtor.ca (live) ...")
            properties = await scraper._post_and_parse(
                bbox={"LatitudeMax": "45.75", "LatitudeMin": "45.30",
                      "LongitudeMax": "-73.30", "LongitudeMin": "-74.10"},
                page=1,
                property_type_group_id=1,
            )

        print(f"\nFound {len(properties)} properties\n")

        for i, prop in enumerate(properties[:10], 1):
            price = f"${prop.asking_price:,.0f}" if prop.asking_price else "no price"
            sqft  = f"{prop.sqft_total:,} sqft" if prop.sqft_total else "no sqft"
            print(
                f"  {i:02d}. MLS={prop.mls_number or '?':>10} | "
                f"{price:>14} | {prop.property_type or '?':>12} | {prop.city or '?'}"
            )
            print(f"       {prop.full_address or '?'} | {sqft} | {prop.bedrooms_total or '?'} beds")
            print()

        with_price  = sum(1 for p in properties if p.asking_price)
        with_mls    = sum(1 for p in properties if p.mls_number)
        with_city   = sum(1 for p in properties if p.city)
        with_sqft   = sum(1 for p in properties if p.sqft_total)
        with_photos = sum(1 for p in properties if p.photos)
        print(f"  price={with_price}  mls={with_mls}  city={with_city}  sqft={with_sqft}  photos={with_photos}  / {len(properties)} total")

    finally:
        await scraper.close()


if __name__ == "__main__":
    asyncio.run(main())
