"""
Enrich all properties in our PostgreSQL DB with financial data from the
colleague's Quebec Real Estate Calculation Engine (running on port 8001).

For each property we call POST http://localhost:8001/api/v1/property/analyze
and store back:  welcome_tax, municipal_taxes_annual, school_taxes_annual,
                 noi_annual, cap_rate, monthly_cash_flow, monthly_mortgage

Run from backend/:
    python scripts/enrich_from_calc.py
    python scripts/enrich_from_calc.py --limit 10        # first 10 only
    python scripts/enrich_from_calc.py --dry-run         # print payload, skip POST
"""
import argparse
import asyncio
import json
import logging
import sys
import time
from decimal import Decimal
from pathlib import Path
from typing import Optional

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("enrich")

CALC_API = "http://localhost:8001/api/v1/property/analyze"

# Avg monthly rent per unit used when rental_income_monthly is missing
# (rough Montreal market estimate)
AVG_RENT_PER_UNIT = 1_400.0

# Standard investor mortgage assumptions
DOWN_PCT   = 0.20
RATE_PCT   = "5.50"
AMORT_YRS  = 25

# Property type mapping: our enum → colleague's enum
PTYPE_MAP = {
    "DUPLEX":         "duplex",
    "TRIPLEX":        "triplex",
    "QUADRUPLEX":     "plex_4_to_6",
    "QUINTUPLEX_PLUS":"plex_4_to_6",
    "SINGLE_FAMILY":  "residential",
    "CONDO":          "condo",
    "TOWNHOUSE":      "residential",
}


async def fetch_all_properties(conn) -> list[dict]:
    rows = await conn.fetch("""
        SELECT id, full_address, city, postal_code, province,
               asking_price, property_type, unit_count,
               rental_income_monthly, condo_fees_monthly
        FROM properties
        WHERE asking_price IS NOT NULL AND asking_price > 0
        ORDER BY created_at
    """)
    return [dict(r) for r in rows]


def build_payload(prop: dict) -> Optional[dict]:
    price = prop["asking_price"]
    if not price or price <= 0:
        return None

    ptype_raw = str(prop["property_type"])
    ptype = PTYPE_MAP.get(ptype_raw, "residential")

    city = prop["city"] or "Montreal"
    address = prop["full_address"] or "Unknown"
    postal = (prop["postal_code"] or "").strip()
    if not postal:
        postal = "H2L"  # fallback FSA (Montreal island)

    # Mortgage — always pass for investor analysis
    down = round(price * DOWN_PCT, 2)
    mortgage = {
        "down_payment": str(down),
        "interest_rate": RATE_PCT,
        "amortization_years": AMORT_YRS,
    }

    # Rental income
    rent_monthly = prop["rental_income_monthly"]
    if not rent_monthly:
        units = prop["unit_count"] or 1
        if ptype_raw in ("DUPLEX", "TRIPLEX", "QUADRUPLEX", "QUINTUPLEX_PLUS"):
            rent_monthly = units * AVG_RENT_PER_UNIT
        else:
            rent_monthly = None  # skip for single-family / condo

    rental = None
    if rent_monthly:
        rental = {
            "gross_monthly_rent": str(round(rent_monthly, 2)),
            "vacancy_rate_pct": "5.0",
            "management_fee_pct": "8.0",
        }

    payload = {
        "address":          address,
        "city":             city,
        "province":         prop["province"] or "QC",
        "postal_code":      postal,
        "purchase_price":   str(round(price, 2)),
        "property_type":    ptype,
        "ownership_intent": "investment",
        "is_new_construction": False,
        "is_canadian_resident": True,
        "is_foreign_buyer": False,
        "mortgage":         mortgage,
        "rental":           rental,
    }
    return payload


async def call_calc_api(client: httpx.AsyncClient, payload: dict) -> Optional[dict]:
    try:
        resp = await client.post(CALC_API, json=payload, timeout=120)
        if resp.status_code == 200:
            return resp.json()
        log.warning(f"  API returned {resp.status_code}: {resp.text[:200]}")
        return None
    except Exception as exc:
        log.warning(f"  HTTP error: {exc}")
        return None


def extract_updates(result: dict) -> dict:
    """Pull the fields we care about from PropertyOutput."""
    updates: dict = {}

    try:
        taxes = result.get("taxes", {})
        if taxes.get("welcome_tax"):
            updates["welcome_tax"] = float(taxes["welcome_tax"]["value"])
        if taxes.get("municipal_tax"):
            updates["municipal_taxes_annual"] = float(taxes["municipal_tax"]["value"])
        if taxes.get("school_tax"):
            updates["school_taxes_annual"] = float(taxes["school_tax"]["value"])

        inv = result.get("investment")
        if inv:
            if inv.get("noi"):
                updates["noi_annual"] = float(inv["noi"]["value"])
            if inv.get("cap_rate"):
                # cap_rate comes as a percentage (e.g. 5.73), store as decimal (0.0573)
                cr = float(inv["cap_rate"]["value"])
                updates["cap_rate"] = cr / 100.0
            if inv.get("cash_flow"):
                # cash_flow is annual → convert to monthly
                cf_annual = float(inv["cash_flow"]["value"])
                updates["monthly_cash_flow"] = cf_annual / 12.0

        mort = result.get("mortgage")
        if mort and mort.get("monthly_payment"):
            updates["monthly_mortgage"] = float(mort["monthly_payment"]["value"])
            updates["down_payment_20pct"] = float(mort["mortgage_amount"]) * 0.25  # approx 20% of price

    except Exception as exc:
        log.warning(f"  extract error: {exc}")

    return updates


async def update_property(conn, prop_id: str, updates: dict) -> None:
    if not updates:
        return
    cols = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    vals = list(updates.values())
    await conn.execute(
        f"UPDATE properties SET {cols}, needs_reanalysis = TRUE WHERE id = $1",
        prop_id, *vals
    )


async def main(limit: Optional[int], dry_run: bool) -> None:
    import asyncpg
    from app.config import settings

    db_url = settings.database_url.replace("+asyncpg", "")

    log.info(f"Connecting to DB: {db_url[:40]}...")
    conn = await asyncpg.connect(db_url)

    try:
        props = await fetch_all_properties(conn)
        if limit:
            props = props[:limit]

        log.info(f"Enriching {len(props)} properties from calc engine at {CALC_API}")

        if dry_run:
            sample = build_payload(props[0]) if props else {}
            log.info(f"DRY RUN — sample payload:\n{json.dumps(sample, indent=2)}")
            return

        # Warm up the API — first call scrapes rates from official sources
        log.info("Warming up calc engine (first call may take 10-30s for rate scraping)...")

        stats = {"ok": 0, "skip": 0, "err": 0, "no_inv": 0}

        async with httpx.AsyncClient() as client:
            for i, prop in enumerate(props, 1):
                pid = str(prop["id"])
                payload = build_payload(prop)
                if not payload:
                    log.warning(f"  [{i}/{len(props)}] {pid[:8]} — no price, skip")
                    stats["skip"] += 1
                    continue

                log.info(f"  [{i}/{len(props)}] {prop['full_address'][:50]} ...")
                result = await call_calc_api(client, payload)
                if not result:
                    stats["err"] += 1
                    await asyncio.sleep(0.5)
                    continue

                updates = extract_updates(result)
                if not updates:
                    log.warning(f"    no usable fields in response")
                    stats["no_inv"] += 1
                    continue

                if "cap_rate" in updates:
                    log.info(f"    cap_rate={updates['cap_rate']*100:.2f}%  "
                             f"noi={updates.get('noi_annual',0):,.0f}  "
                             f"cf/mo={updates.get('monthly_cash_flow',0):,.0f}")
                else:
                    log.info(f"    welcome_tax={updates.get('welcome_tax',0):,.0f}  "
                             f"muni_tax={updates.get('municipal_taxes_annual',0):,.0f}")

                await update_property(conn, pid, updates)
                stats["ok"] += 1
                await asyncio.sleep(0.2)   # be gentle to the calc API

    finally:
        await conn.close()

    print(f"\n{'='*55}")
    print(f"Enrichment complete")
    print(f"  OK:             {stats['ok']}")
    print(f"  No investment:  {stats['no_inv']}")
    print(f"  Errors:         {stats['err']}")
    print(f"  Skipped:        {stats['skip']}")
    print(f"{'='*55}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(limit=args.limit, dry_run=args.dry_run))
