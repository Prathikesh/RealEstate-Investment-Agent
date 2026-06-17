"""
CSDM school tax rate scraper.

Commission scolaire de Montréal (now Centre de services scolaire de Montréal)
Source: https://csdm.ca/a-propos/budget-et-documents-financiers/
The school tax rate is published in the annual budget document (often PDF).
"""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

SOURCE_URL = "https://csdm.ca/a-propos/budget-et-documents-financiers/"
SOURCE_LAW = "Education Act, CQLR c I-13.3, s 308"

FALLBACK = {
    "rate_per_100": "0.1065",
    "rate_per_1000": "1.065",
    "unit": "per_100",
    "year": 2025,
    "source_version": "2025-fallback",
    "note": "School tax based on standardized assessment value of property.",
}


class CSDMScraper(BaseScrapFlyScraper):

    def scrape(self) -> list[ScrapedRate]:
        try:
            response, _ = self._timed_fetch(SOURCE_URL)
            data = self._parse(response.content)
            return [ScrapedRate(
                rate_type="school_tax",
                value=json.dumps(data),
                unit="school_tax_json",
                source_url=SOURCE_URL,
                source_law=SOURCE_LAW,
                data_version=data.get("source_version", "2025.scraped"),
                scraped_at=self._now_iso(),
            )]
        except Exception:
            return [ScrapedRate(
                rate_type="school_tax",
                value=json.dumps(FALLBACK),
                unit="school_tax_json",
                source_url=SOURCE_URL,
                source_law=SOURCE_LAW,
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            )]

    def _parse(self, html: str) -> dict:
        soup = parse_html(html)
        text = soup.get_text()
        # Look for tax rate numbers in the 0.05 – 0.3 range (school tax is small)
        match = re.search(r"taux[^\d]{0,50}(0\.\d+)", text, re.IGNORECASE)
        if match:
            rate = match.group(1)
            rate_per_100 = float(rate)
            return {
                "rate_per_100": str(rate_per_100),
                "rate_per_1000": str(round(rate_per_100 * 10, 4)),
                "unit": "per_100",
                "year": 2025,
                "source_version": f"2025.scraped-{self._now_iso()[:10]}",
                "note": "School tax based on standardized assessment value of property.",
            }
        return FALLBACK
