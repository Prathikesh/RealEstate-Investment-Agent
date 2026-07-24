"""
Honest buildable-units estimate — the development-potential number.

Two cases, both derived from verified data (never a guessed code):
  • Use-capped zone (tier_cap 1 or 3): the bylaw permits at most that many
    dwellings per building, so that's the max regardless of lot size.
  • Open-ended zone ("4 logements ou plus"): the max is governed by the
    building envelope, estimated from the property's OFFICIAL lot area:
        floor area = lot × max coverage × max storeys × efficiency
        units      = floor area ÷ average unit size

Always an ESTIMATE for the open-ended case — presented as such, with the inputs
shown, and a "confirm with the municipality" caveat in the UI.
"""
from typing import Optional

# ~850 sqft (79 m²) gross per unit — matches REBUILD_AVG_UNIT_SQFT in constants.
AVG_UNIT_M2 = 79.0
# Usable residential fraction of gross floor area (circulation, walls, mechanical).
FLOOR_EFFICIENCY = 0.80

SQFT_PER_M2 = 10.7639


def estimate_max_units(lot_area_m2: Optional[float], rules: dict) -> dict:
    """Return {units, method, max_coverage_pct, max_storeys, lot_area_m2}."""
    rules = rules or {}
    tier_cap = rules.get("tier_cap")
    coverage = rules.get("max_coverage_pct")
    storeys  = rules.get("max_storeys")
    base = {"max_coverage_pct": coverage, "max_storeys": storeys, "lot_area_m2": lot_area_m2}

    if tier_cap == 0:
        return {"units": None, "method": "non_residential", **base}
    if tier_cap is not None:                      # 1 or 3 — capped by permitted use
        return {"units": int(tier_cap), "method": "use_permission", **base}

    # open-ended → envelope estimate from the real lot
    if lot_area_m2 and coverage and storeys:
        floor_m2 = lot_area_m2 * (coverage / 100.0) * storeys * FLOOR_EFFICIENCY
        units = max(1, int(floor_m2 / AVG_UNIT_M2))
        return {"units": units, "method": "envelope", **base}

    return {"units": None, "method": "insufficient_data", **base}
