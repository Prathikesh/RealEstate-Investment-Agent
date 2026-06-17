"""
CRA scraper — GST rate and New Housing Rebate thresholds.

Source: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/list-gst-hst-rates.html
Rebate: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-new-housing-rebate.html

GST rate: 5% (set in Excise Tax Act, RSC 1985, c E-15, Schedule VI)
Quebec is NOT HST — GST and QST are separate taxes.

New Housing Rebate (GST portion):
  Purchase price <= $350,000 → Full rebate (36% of GST, max $6,300)
  $350,000 < price < $450,000 → Partial rebate (linear phase-out)
  price >= $450,000 → No rebate
"""
import json
import re

from app.scrapers.base import BaseScrapFlyScraper, ScrapedRate
from app.scrapers.parser.html_parser import parse_html

GST_URL = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/list-gst-hst-rates.html"
REBATE_URL = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-new-housing-rebate.html"
SOURCE_LAW = "Excise Tax Act, RSC 1985, c E-15; Schedule VI (Quebec: GST 5% only)"

FALLBACK_GST = {
    "rate_pct": "5.0",
    "province": "QC",
    "note": "Quebec charges GST (5%) + QST (9.975%) separately. No HST.",
    "source_version": "2025-fallback",
}

FALLBACK_REBATE = {
    "full_rebate_threshold": "350000",
    "phase_out_end": "450000",
    "max_gst_rebate": "6300",
    "rebate_rate_pct": "36.0",
    "source_version": "2025-fallback",
}


class CRAScraper(BaseScrapFlyScraper):
    """Scrapes GST rate and New Housing Rebate thresholds from CRA."""

    def scrape(self) -> list[ScrapedRate]:
        results = []

        # GST rate
        try:
            response, _ = self._timed_fetch(GST_URL)
            gst_data = self._parse_gst(response.content)
            results.append(ScrapedRate(
                rate_type="gst",
                value=json.dumps(gst_data),
                unit="pct_json",
                source_url=GST_URL,
                source_law=SOURCE_LAW,
                data_version=gst_data.get("source_version", "2025.scraped"),
                scraped_at=self._now_iso(),
            ))
        except Exception:
            results.append(ScrapedRate(
                rate_type="gst",
                value=json.dumps(FALLBACK_GST),
                unit="pct_json",
                source_url=GST_URL,
                source_law=SOURCE_LAW,
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            ))

        # New Housing Rebate
        try:
            response, _ = self._timed_fetch(REBATE_URL)
            rebate_data = self._parse_rebate(response.content)
            results.append(ScrapedRate(
                rate_type="new_housing_rebate",
                value=json.dumps(rebate_data),
                unit="rebate_json",
                source_url=REBATE_URL,
                source_law="Excise Tax Act, RSC 1985, c E-15, s 254",
                data_version=rebate_data.get("source_version", "2025.scraped"),
                scraped_at=self._now_iso(),
            ))
        except Exception:
            results.append(ScrapedRate(
                rate_type="new_housing_rebate",
                value=json.dumps(FALLBACK_REBATE),
                unit="rebate_json",
                source_url=REBATE_URL,
                source_law="Excise Tax Act, RSC 1985, c E-15, s 254",
                data_version="2025-fallback",
                scraped_at=self._now_iso(),
            ))

        return results

    def _parse_gst(self, html: str) -> dict:
        soup = parse_html(html)
        text = soup.get_text()
        # Look for "Quebec" row with "5%" in a table
        match = re.search(r"Quebec[^\n]*?(\d+\.?\d*)\s*%", text, re.IGNORECASE)
        rate = match.group(1) if match else "5.0"
        return {
            "rate_pct": rate,
            "province": "QC",
            "note": "Quebec charges GST (5%) + QST (9.975%) separately. No HST.",
            "source_version": f"2025.scraped-{self._now_iso()[:10]}",
        }

    def _parse_rebate(self, html: str) -> dict:
        soup = parse_html(html)
        text = soup.get_text()
        # Look for threshold amounts like "$350,000" and "$450,000"
        amounts = re.findall(r"\$\s*([\d,]+)", text)
        amounts = [a.replace(",", "") for a in amounts if int(a.replace(",", "")) > 100000]

        if len(amounts) >= 2:
            return {
                "full_rebate_threshold": amounts[0],
                "phase_out_end": amounts[1],
                "max_gst_rebate": "6300",
                "rebate_rate_pct": "36.0",
                "source_version": f"2025.scraped-{self._now_iso()[:10]}",
            }
        return FALLBACK_REBATE
