"""
Client for the colleague's Quebec Real Estate Calculation Engine.
Calls POST http://localhost:8001/api/v1/property/analyze and returns
a dict of financial fields ready to store in our Property model.

Used by the pipeline (Stage 2) so the dashboard shows the colleague's
accurate tax and investment numbers, not our own rough estimates.
"""
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CALC_API_URL = os.getenv("CALC_ENGINE_URL", "http://localhost:8001") + "/api/v1/property/analyze"

_PTYPE_MAP = {
    "DUPLEX":          "duplex",
    "TRIPLEX":         "triplex",
    "QUADRUPLEX":      "plex_4_to_6",
    "QUINTUPLEX_PLUS": "plex_4_to_6",
    "SINGLE_FAMILY":   "residential",
    "CONDO":           "condo",
    "TOWNHOUSE":       "residential",
}

_AVG_RENT_PER_UNIT = 1_400.0   # fallback estimate when no rental_income_monthly
_DOWN_PCT          = 0.20
_INTEREST_RATE     = "5.50"
_AMORT_YEARS       = 25


def _build_payload(prop) -> Optional[dict]:
    price = prop.asking_price
    if not price or price <= 0:
        return None

    ptype_key = str(prop.property_type).split(".")[-1]  # e.g. "DUPLEX"
    ptype = _PTYPE_MAP.get(ptype_key, "residential")

    city   = prop.city or "Montreal"
    postal = (prop.postal_code or "H2L").replace(" ", "")[:6] or "H2L"

    down = round(price * _DOWN_PCT, 2)
    mortgage = {
        "down_payment":      str(down),
        "interest_rate":     _INTEREST_RATE,
        "amortization_years": _AMORT_YEARS,
    }

    rent = prop.rental_income_monthly
    if not rent and ptype_key in ("DUPLEX", "TRIPLEX", "QUADRUPLEX", "QUINTUPLEX_PLUS"):
        units = prop.unit_count or 2
        rent  = units * _AVG_RENT_PER_UNIT

    rental = None
    if rent:
        rental = {
            "gross_monthly_rent": str(round(rent, 2)),
            "vacancy_rate_pct":   "5.0",
            "management_fee_pct": "8.0",
        }

    return {
        "address":              prop.full_address or "Unknown",
        "city":                 city,
        "province":             "QC",
        "postal_code":          postal,
        "purchase_price":       str(round(price, 2)),
        "property_type":        ptype,
        "ownership_intent":     "investment",
        "is_new_construction":  False,
        "is_canadian_resident": True,
        "is_foreign_buyer":     False,
        "mortgage":             mortgage,
        "rental":               rental,
    }


def _extract(result: dict) -> dict:
    """
    Pull the fields we need from PropertyOutput JSON.

    Units used by the colleague's API:
      cap_rate    → percentage  (e.g. 6.21 means 6.21 %)
      noi         → annual CAD
      cash_flow   → annual CAD  (we convert to monthly)
      all taxes   → annual CAD
      mortgage    → monthly payment CAD
    """
    out: dict = {}
    try:
        taxes = result.get("taxes") or {}

        wt = taxes.get("welcome_tax")
        if wt:
            out["welcome_tax"] = float(wt["value"])

        mt = taxes.get("municipal_tax")
        if mt and float(mt["value"]) > 0:
            out["municipal_taxes_annual"] = float(mt["value"])

        st = taxes.get("school_tax")
        if st and float(st["value"]) > 0:
            out["school_taxes_annual"] = float(st["value"])

        inv = result.get("investment")
        if inv:
            noi = inv.get("noi")
            if noi:
                out["noi_annual"] = float(noi["value"])

            cr = inv.get("cap_rate")
            if cr:
                # colleague returns cap_rate as % (e.g. 6.21)
                out["cap_rate"] = float(cr["value"])

            cf = inv.get("cash_flow")
            if cf:
                # colleague cash_flow is ANNUAL → convert to monthly
                out["monthly_cash_flow"] = float(cf["value"]) / 12.0

        mort = result.get("mortgage")
        if mort:
            mp = mort.get("monthly_payment")
            if mp:
                out["monthly_mortgage"] = float(mp["value"])
            ma = mort.get("mortgage_amount")
            if ma:
                out["down_payment_20pct"] = float(ma) * (_DOWN_PCT / (1 - _DOWN_PCT))
    except Exception as exc:
        logger.warning(f"calc_client._extract error: {exc}")

    return out


async def analyze(prop) -> dict:
    """
    Call the colleague's calculation engine for one property.
    Returns a dict of financial fields (possibly empty if the API is
    unreachable or the location can't be resolved).
    """
    payload = _build_payload(prop)
    if not payload:
        return {}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(CALC_API_URL, json=payload)
        if resp.status_code == 200:
            return _extract(resp.json())
        logger.debug(
            f"calc_client: {resp.status_code} for {prop.full_address[:40]!r} — "
            f"{resp.text[:120]}"
        )
    except Exception as exc:
        logger.debug(f"calc_client unreachable: {exc}")

    return {}
