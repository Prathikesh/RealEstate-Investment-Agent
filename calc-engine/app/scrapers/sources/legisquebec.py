"""
Legisquebec scraper — Welcome Tax (Droits de mutation immobilières) brackets.

Source: https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1
Law: Loi concernant les droits sur les mutations immobilières, RLRQ c D-15.1

The brackets are published in the law text. We scrape the current brackets
and store them as JSON so the calculator can apply them.

Standard Quebec brackets (as of 2025):
  0.5%  on first $55,200
  1.0%  on $55,200 – $276,200
  1.5%  above $276,200

Montreal adds extra brackets via municipal by-law:
  3.0%  on $500,001 – $1,000,000
  4.0%  above $1,000,000

NOTE: Bracket thresholds are adjusted annually by MAMH. This scraper
reads the current published values from Legisquebec.
"""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

SOURCE_URL = "https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1"
SOURCE_LAW = "Loi concernant les droits sur les mutations immobilières, RLRQ c D-15.1, Art. 2"

# Fallback hardcoded brackets (2025) used if scraping fails.
# Updated from official source; version-tagged so changes are visible.
FALLBACK_BRACKETS = {
    "standard": [
        {"threshold": "0", "up_to": "55200", "rate_pct": "0.5", "label": "First bracket"},
        {"threshold": "55200", "up_to": "276200", "rate_pct": "1.0", "label": "Second bracket"},
        {"threshold": "276200", "up_to": None, "rate_pct": "1.5", "label": "Third bracket"},
    ],
    "municipality_overrides": {
        "MTL": {
            "name": "Ville de Montréal",
            "extra_brackets": [
                {"threshold": "500000", "up_to": "1000000", "rate_pct": "3.0", "label": "Montreal 4th bracket"},
                {"threshold": "1000000", "up_to": None, "rate_pct": "4.0", "label": "Montreal 5th bracket"},
            ],
            "authority": "City of Montreal By-law 22-039",
        }
    },
    "source_version": "2025-fallback",
}


class LegisquebecScraper(BaseScrapFlyScraper):
    """Scrapes Welcome Tax brackets from Legisquebec."""

    def scrape(self) -> list[ScrapedRate]:
        try:
            response, _ = self._timed_fetch(SOURCE_URL)
            brackets = self._parse_brackets(response.content)
            return [
                ScrapedRate(
                    rate_type="welcome_tax_brackets",
                    value=json.dumps(brackets),
                    unit="bracket_json",
                    source_url=SOURCE_URL,
                    source_law=SOURCE_LAW,
                    data_version=brackets.get("source_version", "2025.scraped"),
                    scraped_at=self._now_iso(),
                )
            ]
        except Exception as e:
            # Return fallback brackets on any scraping failure
            return [
                ScrapedRate(
                    rate_type="welcome_tax_brackets",
                    value=json.dumps(FALLBACK_BRACKETS),
                    unit="bracket_json",
                    source_url=SOURCE_URL,
                    source_law=SOURCE_LAW,
                    data_version="2025-fallback",
                    scraped_at=self._now_iso(),
                )
            ]

    def _parse_brackets(self, html: str) -> dict:
        """
        Parse Welcome Tax brackets from Legisquebec HTML.
        Looks specifically for dollar amounts matching the Quebec bracket thresholds
        (expected to be in the range $50,000–$350,000 for standard brackets).
        Falls back to hardcoded 2025 values if parsing is unreliable.
        """
        soup = parse_html(html)
        text = soup.get_text()

        # Look for amounts in the specific range of Quebec bracket thresholds.
        # Standard brackets are two thresholds: ~$55K and ~$276K (indexed annually).
        # We require exactly the pattern: space-separated digits with $ sign in law context.
        amounts = re.findall(r"(\d{2,3}\s\d{3})\s*\$", text)
        amounts_clean = []
        for a in amounts:
            val = int(a.replace(" ", ""))
            if 40000 < val < 400000:
                amounts_clean.append(str(val))

        # Deduplicate and sort
        amounts_clean = sorted(set(amounts_clean), key=lambda x: int(x))

        if len(amounts_clean) >= 2:
            bracket1 = amounts_clean[0]
            bracket2 = amounts_clean[1]
            brackets = {
                "standard": [
                    {"threshold": "0", "up_to": bracket1, "rate_pct": "0.5", "label": "First bracket"},
                    {"threshold": bracket1, "up_to": bracket2, "rate_pct": "1.0", "label": "Second bracket"},
                    {"threshold": bracket2, "up_to": None, "rate_pct": "1.5", "label": "Third bracket"},
                ],
                "municipality_overrides": FALLBACK_BRACKETS["municipality_overrides"],
                "source_version": f"2025.scraped-{self._now_iso()[:10]}",
            }
            return brackets

        return FALLBACK_BRACKETS
