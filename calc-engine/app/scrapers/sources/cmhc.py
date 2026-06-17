"""
CMHC scraper — Mortgage Default Insurance premium brackets.

Source: https://www.cmhc-schl.gc.ca/consumers/home-buying/mortgage-loan-insurance-for-consumers/what-does-cmhc-mortgage-loan-insurance-cost
Law: National Housing Act, RSC 1985, c N-11, s.6

Brackets (as of 2024 — rarely change):
  5.00–9.99%  down → 4.00% premium
 10.00–14.99% down → 3.10% premium
 15.00–19.99% down → 2.80% premium
 >= 20.00%    down → No CMHC required

Max insured purchase price: $1,500,000
Quebec provincial tax on CMHC premium: 9%
"""
import json

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import extract_table_value, parse_html

SOURCE_URL = "https://www.cmhc-schl.gc.ca/consumers/home-buying/mortgage-loan-insurance-for-consumers/what-does-cmhc-mortgage-loan-insurance-cost"
SOURCE_LAW = "National Housing Act, RSC 1985, c N-11, s.6"

FALLBACK_DATA = {
    "brackets": [
        {"min_down_pct": "5.00",  "max_down_pct": "9.99",  "premium_rate_pct": "4.00"},
        {"min_down_pct": "10.00", "max_down_pct": "14.99", "premium_rate_pct": "3.10"},
        {"min_down_pct": "15.00", "max_down_pct": "19.99", "premium_rate_pct": "2.80"},
    ],
    "max_insured_price": "1500000",
    "min_down_pct": "5.0",
    "quebec_premium_tax_pct": "9.0",
    "source_version": "2024-fallback",
}


class CMHCScraper(BaseScrapFlyScraper):
    """Scrapes CMHC insurance premium brackets from the CMHC website."""

    def scrape(self) -> list[ScrapedRate]:
        try:
            response, _ = self._timed_fetch(SOURCE_URL)
            data = self._parse_premiums(response.content)
            return [
                ScrapedRate(
                    rate_type="cmhc_premiums",
                    value=json.dumps(data),
                    unit="bracket_json",
                    source_url=SOURCE_URL,
                    source_law=SOURCE_LAW,
                    data_version=data.get("source_version", "2024.scraped"),
                    scraped_at=self._now_iso(),
                )
            ]
        except Exception as e:
            return [
                ScrapedRate(
                    rate_type="cmhc_premiums",
                    value=json.dumps(FALLBACK_DATA),
                    unit="bracket_json",
                    source_url=SOURCE_URL,
                    source_law=SOURCE_LAW,
                    data_version="2024-fallback",
                    scraped_at=self._now_iso(),
                )
            ]

    def _parse_premiums(self, html: str) -> dict:
        soup = parse_html(html)

        # CMHC publishes a table with down payment % and premium rate columns
        brackets = []
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows[1:]:  # skip header
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    down_text = cells[0].get_text(strip=True)
                    premium_text = cells[1].get_text(strip=True)
                    # Parse ranges like "5% to 9.99%" and rates like "4.00%"
                    import re
                    down_match = re.findall(r"\d+\.?\d*", down_text)
                    premium_match = re.findall(r"\d+\.?\d*", premium_text)
                    if len(down_match) >= 1 and len(premium_match) >= 1:
                        min_d = down_match[0]
                        max_d = down_match[1] if len(down_match) >= 2 else "19.99"
                        prem = premium_match[0]
                        brackets.append({
                            "min_down_pct": min_d,
                            "max_down_pct": max_d,
                            "premium_rate_pct": prem,
                        })

        if len(brackets) >= 3:
            return {
                "brackets": brackets,
                "max_insured_price": "1500000",
                "min_down_pct": "5.0",
                "quebec_premium_tax_pct": "9.0",
                "source_version": f"2024.scraped-{self._now_iso()[:10]}",
            }

        return FALLBACK_DATA
