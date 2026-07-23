"""
Market Benchmark — compares a property's cap rate against the Colliers Canada
Cap Rate Report's institutional multifamily band for its city.

Informational only: this does not feed the opportunity scorer. Colliers' bands
are sourced from institutional-scale transactions and have no category for
small 2-6 unit plexes, so this is a directional cross-check, not a valuation —
see the caveat text and constants.py's comment block above COLLIERS_CAP_RATE_BANDS.
"""
from dataclasses import dataclass
from typing import Optional

from app.agent.constants import COLLIERS_CAP_RATE_BANDS, COLLIERS_REPORT_QUARTER
from app.models.property import Property, PropertyType

_ELIGIBLE_TYPES = {
    PropertyType.DUPLEX,
    PropertyType.TRIPLEX,
    PropertyType.QUADRUPLEX,
    PropertyType.QUINTUPLEX_PLUS,
}

_CAVEAT = (
    "Colliers' band is sourced from institutional-scale multifamily transactions "
    "(larger purpose-built rental buildings), not small plexes. Class B is used "
    "here as the closest available proxy — treat this as a directional "
    "cross-check, not a precise valuation."
)


@dataclass
class MarketBenchmark:
    city_key:            str
    building_grade:      str    # "class_b"
    band_low:            float  # decimal fraction, e.g. 0.0400
    band_high:           float
    property_cap_rate:   float
    position:            str    # "above" | "within" | "below"
    source_label:        str
    source_quarter:      str
    caveat:              str


class MarketBenchmarkComparator:
    """Stage: compare prop's cap rate to the Colliers multifamily Class B band."""

    def compare(self, prop: Property, cap_rate: Optional[float]) -> Optional[MarketBenchmark]:
        if cap_rate is None:
            return None
        if prop.property_type not in _ELIGIBLE_TYPES:
            return None

        city_key = self._resolve_city_key(prop.city)
        if city_key is None:
            return None

        band_low, band_high = COLLIERS_CAP_RATE_BANDS[city_key]["class_b"]

        # cap_rate on the Property model is stored as a percentage (e.g. 3.54),
        # band values are decimal fractions (e.g. 0.0400) — normalize to percent.
        cap_rate_pct = cap_rate
        band_low_pct  = band_low * 100
        band_high_pct = band_high * 100

        if cap_rate_pct < band_low_pct:
            position = "below"
        elif cap_rate_pct > band_high_pct:
            position = "above"
        else:
            position = "within"

        return MarketBenchmark(
            city_key=city_key,
            building_grade="class_b",
            band_low=band_low,
            band_high=band_high,
            property_cap_rate=cap_rate,
            position=position,
            source_label="Colliers Canada Cap Rate Report",
            source_quarter=COLLIERS_REPORT_QUARTER,
            caveat=_CAVEAT,
        )

    @staticmethod
    def _resolve_city_key(city: Optional[str]) -> Optional[str]:
        if not city:
            return None
        city_lower = city.lower()
        if "montr" in city_lower:
            return "montreal"
        if "québec" in city_lower or "quebec" in city_lower:
            return "québec"
        return None
