"""
Generic municipality scraper — fallback for municipalities not covered by
dedicated scrapers. Uses the municipality_sources.json registry to find
the source URL and scraping strategy.
"""
import json
import re
from pathlib import Path

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import extract_first_number, parse_html
from app.scrapers.parser.pdf_parser import extract_text_from_pdf_bytes, find_rate_in_pdf_text

SOURCES_FILE = Path(__file__).parent.parent.parent.parent / "data" / "municipality_sources.json"


class GenericMunicipalityScraper(BaseScrapFlyScraper):
    """
    Scrapes a municipality's mill rate using the registry entry.
    Supports HTML pages and PDF documents.
    Falls back to the default rate in the registry on failure.
    """

    def __init__(self, municipality_code: str):
        super().__init__()
        self.municipality_code = municipality_code
        self._registry = self._load_registry()

    def _load_registry(self) -> dict:
        with open(SOURCES_FILE, encoding="utf-8") as f:
            return json.load(f)

    def scrape(self) -> list[ScrapedRate]:
        entry = self._registry.get(self.municipality_code)
        if not entry:
            return [ScrapedRate.failure(
                "municipal_mill",
                "",
                f"No registry entry for municipality '{self.municipality_code}'",
            )]

        source_url = entry.get("mill_rate_url", "")
        fallback_rate = entry.get("fallback_mill_rate", "10.0")
        source_law = entry.get("source_law", "")
        is_pdf = entry.get("is_pdf", False)
        keyword = entry.get("keyword", "résidentiel")

        try:
            response, _ = self._timed_fetch(source_url)
            if is_pdf:
                text = extract_text_from_pdf_bytes(response.content.encode())
                rate = find_rate_in_pdf_text(text, keyword) or fallback_rate
            else:
                soup = parse_html(response.content)
                text = soup.get_text()
                match = re.search(
                    rf"{keyword}[^\d]{{0,80}}([\d]+\.[\d]+)", text, re.IGNORECASE
                )
                rate = match.group(1) if match else None
                if rate:
                    rate_val = float(rate)
                    if rate_val < 5:
                        rate_val = round(rate_val * 10, 4)
                    rate = str(rate_val)
                else:
                    rate = fallback_rate

            data = {
                "mill_rate_per_1000": rate,
                "unit": "per_1000",
                "year": 2025,
                "source_version": f"2025.scraped-{self._now_iso()[:10]}",
            }
            return [ScrapedRate(
                rate_type="municipal_mill",
                value=json.dumps(data),
                unit="mill_json",
                source_url=source_url,
                source_law=source_law,
                data_version=data["source_version"],
                scraped_at=self._now_iso(),
            )]
        except Exception as e:
            data = {
                "mill_rate_per_1000": fallback_rate,
                "unit": "per_1000",
                "year": 2025,
                "source_version": "2025-fallback",
            }
            return [ScrapedRate(
                rate_type="municipal_mill",
                value=json.dumps(data),
                unit="mill_json",
                source_url=source_url,
                source_law=source_law,
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            )]
