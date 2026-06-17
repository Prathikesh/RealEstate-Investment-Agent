"""Generic school board scraper — fallback for boards without dedicated scrapers."""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

# Provincial baseline school tax rate used as fallback when board site can't be scraped
PROVINCIAL_FALLBACK_RATE = "0.1065"

SOURCE_LAW = "Education Act, CQLR c I-13.3, s 308"


class GenericBoardScraper(BaseScrapFlyScraper):

    def __init__(self, school_board_code: str, source_url: str):
        super().__init__()
        self.school_board_code = school_board_code
        self.source_url = source_url

    def scrape(self) -> list[ScrapedRate]:
        fallback = {
            "rate_per_100": PROVINCIAL_FALLBACK_RATE,
            "rate_per_1000": str(round(float(PROVINCIAL_FALLBACK_RATE) * 10, 4)),
            "unit": "per_100",
            "year": 2025,
            "source_version": "2025-fallback",
            "note": f"Fallback rate for school board {self.school_board_code}",
        }

        if not self.source_url:
            return [ScrapedRate(
                rate_type="school_tax",
                value=json.dumps(fallback),
                unit="school_tax_json",
                source_url="",
                source_law=SOURCE_LAW,
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            )]

        try:
            response, _ = self._timed_fetch(self.source_url)
            soup = parse_html(response.content)
            text = soup.get_text()
            match = re.search(r"(?:taux|rate)[^\d]{0,80}(0\.\d+)", text, re.IGNORECASE)
            if match:
                rate = match.group(1)
                rate_per_100 = float(rate)
                data = {
                    "rate_per_100": str(rate_per_100),
                    "rate_per_1000": str(round(rate_per_100 * 10, 4)),
                    "unit": "per_100",
                    "year": 2025,
                    "source_version": f"2025.scraped-{self._now_iso()[:10]}",
                }
                return [ScrapedRate(
                    rate_type="school_tax",
                    value=json.dumps(data),
                    unit="school_tax_json",
                    source_url=self.source_url,
                    source_law=SOURCE_LAW,
                    data_version=data["source_version"],
                    scraped_at=self._now_iso(),
                )]
        except Exception:
            pass

        return [ScrapedRate(
            rate_type="school_tax",
            value=json.dumps(fallback),
            unit="school_tax_json",
            source_url=self.source_url,
            source_law=SOURCE_LAW,
            data_version="2025-fallback",
            scraped_at=self._now_iso(),
        )]
