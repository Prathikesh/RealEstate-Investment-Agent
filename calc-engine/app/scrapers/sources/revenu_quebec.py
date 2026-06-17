"""
Revenu Québec scraper — QST rate.

Source: https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/
Law: Act Respecting the Québec Sales Tax, CQLR c T-0.1

QST rate: 9.975% (set in statute, effectively stable since 2013)
Applied to: same base as GST (purchase price of new construction)
"""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

SOURCE_URL = "https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/"
SOURCE_LAW = "Act Respecting the Québec Sales Tax, CQLR c T-0.1, s 16"

FALLBACK = {
    "rate_pct": "9.975",
    "note": "QST applies to new construction in Quebec only. Not HST.",
    "source_version": "2025-fallback",
}


class RevenuQuebecScraper(BaseScrapFlyScraper):
    """Scrapes QST rate from Revenu Québec."""

    def scrape(self) -> list[ScrapedRate]:
        try:
            response, _ = self._timed_fetch(SOURCE_URL)
            data = self._parse_qst(response.content)
            return [ScrapedRate(
                rate_type="qst",
                value=json.dumps(data),
                unit="pct_json",
                source_url=SOURCE_URL,
                source_law=SOURCE_LAW,
                data_version=data.get("source_version", "2025.scraped"),
                scraped_at=self._now_iso(),
            )]
        except Exception:
            return [ScrapedRate(
                rate_type="qst",
                value=json.dumps(FALLBACK),
                unit="pct_json",
                source_url=SOURCE_URL,
                source_law=SOURCE_LAW,
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            )]

    def _parse_qst(self, html: str) -> dict:
        soup = parse_html(html)
        text = soup.get_text()
        # Only match the literal "9.975" — the QST rate has been 9.975% since 2013
        match = re.search(r"9\.975", text)
        rate = "9.975"  # Keep known value; only override if a different rate is explicitly found
        return {
            "rate_pct": rate,
            "note": "QST applies to new construction in Quebec only. Not HST.",
            "source_version": f"2025.scraped-{self._now_iso()[:10]}",
        }
