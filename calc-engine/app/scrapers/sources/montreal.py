"""
Montreal mill rate scraper.

Source: https://montreal.ca/en/articles/property-taxes-rates-services
The page publishes the general property tax mill rate (taux général) each year.

Mill rate is expressed as $/per $100 of assessment (Montreal format),
we convert to per $1,000 for consistency with other municipalities.
"""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

SOURCE_URL = "https://montreal.ca/en/articles/property-taxes-rates-services"
SOURCE_LAW = "City of Montreal Charter, CQLR c C-11.4, s 244"

FALLBACK = {
    "mill_rate_per_1000": "10.2427",
    "unit": "per_1000",
    "year": 2025,
    "source_version": "2025-fallback",
    "note": "General residential rate. Commercial and multi-unit rates differ.",
}


class MontrealScraper(BaseScrapFlyScraper):
    """Scrapes Montreal general property tax mill rate."""

    def scrape(self) -> list[ScrapedRate]:
        try:
            response, _ = self._timed_fetch(SOURCE_URL, render_js=True)
            data = self._parse_mill_rate(response.content)
            return [ScrapedRate(
                rate_type="municipal_mill",
                value=json.dumps(data),
                unit="mill_json",
                source_url=SOURCE_URL,
                source_law=SOURCE_LAW,
                data_version=data.get("source_version", "2025.scraped"),
                scraped_at=self._now_iso(),
            )]
        except Exception:
            return [ScrapedRate(
                rate_type="municipal_mill",
                value=json.dumps(FALLBACK),
                unit="mill_json",
                source_url=SOURCE_URL,
                source_law=SOURCE_LAW,
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            )]

    def _parse_mill_rate(self, html: str) -> dict:
        soup = parse_html(html)
        text = soup.get_text()

        # Look for "général" or "general" near a decimal number that looks like a mill rate
        # Montreal rates are typically 0.X per $100 or X.XXXX per $1,000
        match = re.search(
            r"(?:général|general|residential)[^\d]{0,50}([\d]+\.[\d]+)",
            text, re.IGNORECASE
        )
        if match:
            raw_rate = match.group(1)
            rate_val = float(raw_rate)
            # If rate looks like per-$100 format (e.g., 1.02427), convert to per-$1,000
            if rate_val < 5:
                rate_val = round(rate_val * 10, 4)
            return {
                "mill_rate_per_1000": str(rate_val),
                "unit": "per_1000",
                "year": 2025,
                "source_version": f"2025.scraped-{self._now_iso()[:10]}",
                "note": "General residential rate. Commercial and multi-unit rates differ.",
            }

        return FALLBACK
