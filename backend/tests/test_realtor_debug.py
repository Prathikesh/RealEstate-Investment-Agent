"""
Debug Realtor.ca — test exact probe parameters vs bulk parameters.
Run: python tests/test_realtor_debug.py
"""
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

from scrapfly import ScrapeConfig, ScrapflyClient
from app.config import settings

API_URL = "https://api2.realtor.ca/Listing.svc/PropertySearch_Post"

HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Referer": "https://www.realtor.ca/",
    "X-Requested-With": "XMLHttpRequest",
}

TESTS = [
    # label, body
    (
        "Exact probe (Montreal, 12 results)",
        "ZoomLevel=11&LatitudeMax=45.7011&LatitudeMin=45.4167"
        "&LongitudeMax=-73.4553&LongitudeMin=-73.8203"
        "&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2"
        "&RecordsPerPage=12&CurrentPage=1&CultureId=1&ApplicationId=1&Version=7.0",
    ),
    (
        "Montreal, 50 results",
        "ZoomLevel=11&LatitudeMax=45.7011&LatitudeMin=45.4167"
        "&LongitudeMax=-73.4553&LongitudeMin=-73.8203"
        "&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2"
        "&RecordsPerPage=50&CurrentPage=1&CultureId=1&ApplicationId=1&Version=7.0",
    ),
    (
        "Quebec province, 12 results",
        "ZoomLevel=7&LatitudeMax=47.0&LatitudeMin=44.9"
        "&LongitudeMax=-71.0&LongitudeMin=-79.5"
        "&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2"
        "&RecordsPerPage=12&CurrentPage=1&CultureId=1&ApplicationId=1&Version=7.0",
    ),
    (
        "Montreal, page 2",
        "ZoomLevel=11&LatitudeMax=45.7011&LatitudeMin=45.4167"
        "&LongitudeMax=-73.4553&LongitudeMin=-73.8203"
        "&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2"
        "&RecordsPerPage=12&CurrentPage=2&CultureId=1&ApplicationId=1&Version=7.0",
    ),
]


async def main():
    client = ScrapflyClient(key=settings.scrapfly_api_key)
    print("\n=== Realtor.ca Debug ===\n")

    for label, body in TESTS:
        try:
            config = ScrapeConfig(
                url=API_URL,
                method="POST",
                body=body,
                headers=HEADERS,
                country="ca",
                asp=False,
                render_js=False,
                raise_on_upstream_error=False,
            )
            result = await client.async_scrape(config)
            status = result.upstream_status_code
            content = result.content

            if status == 200 and content.strip().startswith("{"):
                data = json.loads(content)
                count = len(data.get("Results", []))
                print(f"  ✓ {status} | {count:>3} results | {label}")
            else:
                print(f"  ✗ {status} | {label}")
                print(f"    Response: {content[:100]}")

        except Exception as exc:
            print(f"  ✗ ERROR | {label}: {exc}")

        await asyncio.sleep(3)

    client.close()
    print()


if __name__ == "__main__":
    asyncio.run(main())
