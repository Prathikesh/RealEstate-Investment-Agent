"""Longueuil mill rate scraper."""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

SOURCE_URL = "https://www.longueuil.quebec/fr/taxes-et-finances/taxe-fonciere"
SOURCE_LAW = "Charte de la Ville de Longueuil, RLRQ c C-11.3"

FALLBACK = {
    "mill_rate_per_1000": "8.9200",
    "unit": "per_1000",
    "year": 2025,
    "source_version": "2025-fallback",
}


class LongueuilScraper(BaseScrapFlyScraper):

    def scrape(self) -> list[ScrapedRate]:
        try:
            response, _ = self._timed_fetch(SOURCE_URL)
            data = self._parse(response.content)
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

    def _parse(self, html: str) -> dict:
        soup = parse_html(html)
        text = soup.get_text()
        match = re.search(r"résidentiel[^\d]{0,50}([\d]+\.[\d]+)", text, re.IGNORECASE)
        if match:
            rate_val = float(match.group(1))
            if rate_val < 5:
                rate_val = round(rate_val * 10, 4)
            return {
                "mill_rate_per_1000": str(rate_val),
                "unit": "per_1000",
                "year": 2025,
                "source_version": f"2025.scraped-{self._now_iso()[:10]}",
            }
        return FALLBACK
