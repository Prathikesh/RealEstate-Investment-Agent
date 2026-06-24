"""
Realtor.ca → Centris Financial Enrichment → PostgreSQL Pipeline
================================================================
1. Scrapes up to TARGET_COUNT new properties from Realtor.ca Montreal
   that are NOT already in the database.
2. Inserts basic property data to the `properties` table.
3. For each new property, searches Centris for the matching listing,
   scrapes tax values + income + expenses, and calculates NOI, Cap Rate, ROI.
4. Updates the DB row with the full financial profile.

After running, open the dashboard — all financial fields will be populated.

Usage:
    cd calcengine-test
    python pipeline_realtor_to_db.py
"""

import json
import os
import re
import sys
import uuid
import psycopg2
from urllib.parse import urlencode
from dotenv import load_dotenv
from scrapfly import ScrapflyClient, ScrapeConfig

load_dotenv()

if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRAPFLY_KEY = os.getenv("SCRAPFLY_API_KEY")
DATABASE_URL  = os.getenv("DATABASE_URL")

if not SCRAPFLY_KEY:
    print("[ERROR] SCRAPFLY_API_KEY not found in .env"); sys.exit(1)
if not DATABASE_URL:
    print("[ERROR] DATABASE_URL not found in .env"); sys.exit(1)

# Import shared Centris lookup functions from our existing test tool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_centris_financials import (
    find_centris_url,
    get_detail_page,
    build_carac_dict,
    lookup_money,
    calculate_noi_caprate,
    fmt,
    fmt_pct,
)

# ── Config ────────────────────────────────────────────────────────────────────

TARGET_COUNT = 5   # how many new properties to find and process

# Only income-producing property types have rental data on Centris
MULTI_FAMILY_TYPES = {"DUPLEX", "TRIPLEX", "QUADRUPLEX", "QUINTUPLEX_PLUS"}

REALTOR_API_URL = "https://api2.realtor.ca/Listing.svc/PropertySearch_Post"
REALTOR_HEADERS = {
    "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
    "Referer":          "https://www.realtor.ca/",
    "X-Requested-With": "XMLHttpRequest",
}

# Montreal bounding box
MONTREAL_BBOX = {
    "LatitudeMax": "45.7500", "LatitudeMin": "45.3000",
    "LongitudeMax": "-73.3000", "LongitudeMin": "-74.1000",
}

PROPERTY_TYPE_MAP = {
    "duplex":           "DUPLEX",
    "triplex":          "TRIPLEX",
    "fourplex":         "QUADRUPLEX",
    "quadruplex":       "QUADRUPLEX",
    "multi-family":     "TRIPLEX",
    "revenue property": "TRIPLEX",
    "row / townhouse":  "TOWNHOUSE",
    "townhouse":        "TOWNHOUSE",
    "single family":    "SINGLE_FAMILY",
    "house":            "SINGLE_FAMILY",
    "apartment":        "CONDO",
    "condo":            "CONDO",
    "condominium":      "CONDO",
}

# ── Database helpers ──────────────────────────────────────────────────────────

def get_db_conn():
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")
    return psycopg2.connect(url)


def mls_exists(conn, mls: str) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM properties WHERE mls_number = %s LIMIT 1;", (mls,))
    found = cur.fetchone() is not None
    cur.close()
    return found


def insert_property(conn, p: dict) -> bool:
    """
    Insert one property. Returns True on success, False on duplicate/error.
    Uses ON CONFLICT DO NOTHING so safe to call even if the row exists.
    """
    new_id = str(uuid.uuid4())
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO properties (
                id, mls_number, full_address, city, neighborhood,
                postal_code, province, property_type,
                unit_count, bedrooms_total, bathrooms_total,
                sqft_total, lot_sqft, year_built, floors, parking_spaces,
                asking_price, listing_url, primary_source, active_sources,
                photos, description, days_on_market,
                agent_name, agent_phone, agent_email, agency_name,
                status, is_new, needs_reanalysis, is_flagged,
                raw_expenses
            ) VALUES (
                %s::uuid, %s, %s, %s, %s,
                %s, 'QC', %s::propertytype,
                %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, 'realtor', %s::jsonb,
                %s::jsonb, %s, %s,
                %s, %s, %s, %s,
                'ACTIVE'::propertystatus, TRUE, TRUE, FALSE,
                '{}'::jsonb
            )
            ON CONFLICT (mls_number) DO NOTHING;
        """, (
            new_id, p["mls_number"], p["full_address"], p["city"], p.get("neighborhood"),
            p.get("postal_code"), p["property_type"],
            p.get("unit_count"), p.get("bedrooms_total"), p.get("bathrooms_total"),
            p.get("sqft_total"), p.get("lot_sqft"), p.get("year_built"),
            p.get("floors"), p.get("parking_spaces"),
            p.get("asking_price"), p.get("listing_url"),
            json.dumps(["realtor"]),
            json.dumps(p.get("photos", [])), p.get("description"),
            p.get("days_on_market"),
            p.get("agent_name"), p.get("agent_phone"),
            p.get("agent_email"), p.get("agency_name"),
        ))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"    [DB INSERT ERROR] {e}")
        return False
    finally:
        cur.close()


def update_financials(conn, mls: str, fin: dict):
    """Write Centris-scraped financials back to the DB row."""
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE properties SET
                rental_income_monthly  = %s,
                municipal_taxes_annual = %s,
                school_taxes_annual    = %s,
                evaluation_fonciere    = %s,
                welcome_tax            = %s,
                cap_rate               = %s,
                noi_annual             = %s,
                monthly_cash_flow      = %s,
                monthly_mortgage       = %s,
                cash_on_cash_return    = %s,
                raw_expenses           = %s::jsonb,
                needs_reanalysis       = FALSE,
                last_scraped_at        = NOW()
            WHERE mls_number = %s;
        """, (
            fin.get("rental_income_monthly"),
            fin.get("municipal_taxes_annual"),
            fin.get("school_taxes_annual"),
            fin.get("evaluation_fonciere"),
            fin.get("welcome_tax"),
            fin.get("cap_rate"),
            fin.get("noi_annual"),
            fin.get("monthly_cash_flow"),
            fin.get("monthly_mortgage"),
            fin.get("cash_on_cash_return"),
            json.dumps(fin.get("raw_expenses", {})),
            mls,
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"    [DB UPDATE ERROR] {e}")
    finally:
        cur.close()


# ── Realtor.ca parser helpers ─────────────────────────────────────────────────

def _parse_price(text: str):
    if not text: return None
    digits = re.sub(r"[^\d]", "", text)
    return float(digits) if digits else None

def _parse_sqft(text: str):
    if not text: return None
    text = str(text)
    m = re.search(r"[\d,]+\.?\d*", text)
    if not m: return None
    v = float(m.group().replace(",", ""))
    if re.search(r"m2|m²|mètre|metre|sq\.?\s*m", text, re.IGNORECASE):
        v *= 10.764
    return int(v) if 100 <= v <= 50000 else None

def _parse_address(text: str):
    if not text: return None, None, None
    parts = [p.strip() for p in text.split("|")]
    city = postal_code = None
    if parts:
        last = parts[-1]
        pc = re.search(r"[A-Z]\d[A-Z]\s?\d[A-Z]\d", last)
        if pc: postal_code = pc.group().replace(" ", "")
        cm = re.match(r"^([^,]+),", last)
        if cm: city = cm.group(1).strip()
    street = parts[0] if parts else None
    full = f"{street}, {city}" if street and city else street
    return full, city, postal_code

def _parse_year(text: str):
    if not text: return None
    m = re.search(r"\b(19|20)\d{2}\b", str(text))
    return int(m.group()) if m else None

def _parse_dom(text: str):
    if not text: return None
    text = text.lower()
    m = re.search(r"(\d+)\s*(day|week|month)", text)
    if not m: return None
    val, unit = int(m.group(1)), m.group(2)
    return val * 7 if unit == "week" else val * 30 if unit == "month" else val

def _extract_phone(agent: dict):
    ph = agent.get("Phone")
    if ph and isinstance(ph, dict):
        v = ph.get("Value") or ph.get("PhoneNumber")
        if v: return str(v)
    phones = agent.get("Phones") or []
    if phones and isinstance(phones[0], dict):
        return phones[0].get("PhoneNumber") or phones[0].get("Value")
    return None


# ── Realtor.ca API (sync) ─────────────────────────────────────────────────────

def scrape_realtor_page(client: ScrapflyClient, page: int, ptg_id: int) -> list:
    """POST to Realtor.ca JSON API and return raw Results list."""
    params = {
        "ZoomLevel": "11",
        **MONTREAL_BBOX,
        "Sort": "6-D",
        "PropertyTypeGroupID": str(ptg_id),
        "TransactionTypeId": "2",
        "RecordsPerPage": "12",
        "CurrentPage": str(page),
        "CultureId": "1",
        "ApplicationId": "1",
        "Version": "7.0",
    }
    result = client.scrape(ScrapeConfig(
        url=REALTOR_API_URL,
        method="POST",
        body=urlencode(params),
        headers=REALTOR_HEADERS,
        country="ca",
        asp=False,
        render_js=False,
    ))
    if result.upstream_status_code != 200:
        print(f"  [WARN] Realtor.ca API → HTTP {result.upstream_status_code}")
        return []
    try:
        data = json.loads(result.content)
        return data.get("Results", [])
    except Exception as e:
        print(f"  [WARN] JSON parse failed: {e}")
        return []


def parse_realtor_result(r: dict) -> dict | None:
    """Parse one raw Realtor.ca result dict into a flat property dict."""
    mls = r.get("MlsNumber")
    if not mls:
        return None

    prop  = r.get("Property", {})
    bldg  = r.get("Building", {})
    addr  = prop.get("Address", {})
    land  = r.get("Land", {})

    address_text = addr.get("AddressText", "")
    full_address, city, postal_code = _parse_address(address_text)

    # Skip non-QC listings (bbox is tight but API may still return some)
    if address_text and "Quebec" not in address_text and "Québec" not in address_text and "QC" not in address_text:
        if not city:
            return None

    raw_type = (prop.get("Type") or bldg.get("Type") or "").lower()
    property_type = PROPERTY_TYPE_MAP.get(raw_type, "SINGLE_FAMILY")

    units_raw   = bldg.get("TotalUnits") or bldg.get("NumberOfUnits") or bldg.get("TotalSuites") or ""
    parking_raw = prop.get("ParkingSpaceTotal", "")
    stories     = bldg.get("StoriesTotal")
    beds_raw    = bldg.get("Bedrooms", "")
    baths_raw   = bldg.get("BathroomTotal", "")

    photos      = [p["HighResPath"] for p in prop.get("Photo", []) if p.get("HighResPath")]
    relative_url = r.get("RelativeDetailsURL") or r.get("RelativeURLEn", "")
    source_url  = f"https://www.realtor.ca{relative_url}" if relative_url else None

    individuals = r.get("Individual") or []
    agent       = individuals[0] if individuals else {}
    org         = agent.get("Organization") or {}

    return {
        "mls_number":      mls,
        "full_address":    full_address or f"MLS {mls}",
        "city":            city or "Montreal",
        "neighborhood":    None,
        "postal_code":     postal_code,
        "property_type":   property_type,
        "unit_count":      int(str(units_raw)) if units_raw and str(units_raw).isdigit() else None,
        "bedrooms_total":  int(beds_raw) if beds_raw and str(beds_raw).isdigit() else None,
        "bathrooms_total": float(baths_raw) if baths_raw else None,
        "sqft_total":      _parse_sqft(bldg.get("SizeInterior", "")),
        "lot_sqft":        _parse_sqft(str(land.get("SizeTotal") or land.get("SizeTotalText") or "")),
        "year_built":      _parse_year(bldg.get("ConstructedDate") or bldg.get("YearBuilt") or ""),
        "floors":          int(stories) if stories and str(stories).isdigit() else None,
        "parking_spaces":  int(parking_raw) if parking_raw and str(parking_raw).isdigit() else None,
        "asking_price":    _parse_price(prop.get("Price", "")),
        "listing_url":     source_url,
        "photos":          photos,
        "description":     r.get("PublicRemarks"),
        "days_on_market":  _parse_dom(r.get("TimeOnRealtor", "")),
        "agent_name":      agent.get("Name"),
        "agent_phone":     _extract_phone(agent),
        "agent_email":     agent.get("EmailAddress"),
        "agency_name":     org.get("Name"),
    }


# ── Centris financial enrichment ──────────────────────────────────────────────

CITY_CALC_CONFIG = {
    "montréal": "montréal",
    "montreal": "montréal",
    "laval":    "laval",
    "longueuil":"longueuil",
}

def get_transfer_tax(client: ScrapflyClient, city: str, asking_price: float, assessment: float) -> float | None:
    """Call Centris transfer tax API — returns total transfer tax or None on failure."""
    if not asking_price:
        return None
    city_key    = city.lower().strip()
    calc_config = CITY_CALC_CONFIG.get(city_key, "default")
    tax_base    = max(asking_price, assessment or 0)
    try:
        payload = json.dumps({
            "calcConfigId": calc_config,
            "input": {
                "priceOfProperty":        int(asking_price),
                "municipalAssessmentTotal": int(assessment or 0),
            }
        })
        r = client.scrape(ScrapeConfig(
            url="https://www.centris.ca/api/calculator/CalcTransfersImmovableDutiesForQc",
            method="POST",
            body=payload,
            headers={
                "Content-Type":     "application/json; charset=utf-8",
                "Referer":          "https://www.centris.ca/fr/outils/calculatrice",
                "X-Requested-With": "XMLHttpRequest",
            },
            asp=True, render_js=False, country="CA",
        ))
        if r.upstream_status_code == 200:
            brackets = json.loads(r.content)
            return round(sum(brackets), 2)
    except Exception as e:
        print(f"    [WARN] Transfer tax API failed: {e}")
    return None


def enrich_with_centris(client: ScrapflyClient, prop: dict) -> dict:
    """
    Find property on Centris by MLS, scrape financial data,
    run NOI/Cap Rate/ROI calculations, and fetch transfer tax.
    Returns dict of financial fields ready to write to DB.
    """
    mls           = prop["mls_number"]
    city          = prop.get("city") or ""
    neighborhood  = prop.get("neighborhood") or ""
    property_type = (prop.get("property_type") or "SINGLE_FAMILY").lower()
    asking_price  = prop.get("asking_price")

    # Resolve Centris URL
    centris_url = find_centris_url(client, mls, property_type, city, neighborhood)
    if not centris_url:
        print(f"    [WARN] MLS {mls} not found on Centris — no financial data.")
        return {}

    print(f"    Centris URL: {centris_url}")

    result = get_detail_page(client, centris_url)
    if result.upstream_status_code != 200:
        print(f"    [WARN] Centris returned HTTP {result.upstream_status_code}")
        return {}

    sel   = result.selector
    carac = build_carac_dict(sel)

    # Assessment (lot + building from Centris listing)
    terrain  = lookup_money(carac, "terrain")
    batiment = lookup_money(carac, "bâtiment", "batiment")
    assessment = ((terrain or 0) + (batiment or 0)) or None

    # Taxes (from Centris listing)
    municipal_tax = lookup_money(carac, "municipales", "municipal")
    school_tax    = lookup_money(carac, "scolaires", "school")

    # Expenses
    electricity   = lookup_money(carac, "électricité", "electricite", "electricity", "hydro")

    # Income
    gross_revenue = lookup_money(carac, "revenus bruts potentiels", "revenus bruts", "revenus locatifs")

    # Transfer tax from Centris calculator API
    transfer_tax = get_transfer_tax(client, city, asking_price, assessment)
    if transfer_tax:
        print(f"    Transfer Tax: ${transfer_tax:,.2f} (Centris API)")
    else:
        print(f"    Transfer Tax: not available")

    # NOI / Cap Rate calculations
    calc = calculate_noi_caprate(
        gross_revenue    = gross_revenue,
        municipal_tax    = municipal_tax,
        school_tax       = school_tax,
        electricity      = electricity,
        assessment_total = assessment,
        asking_price     = asking_price,
    )

    return {
        "rental_income_monthly":  round(gross_revenue / 12, 2) if gross_revenue else None,
        "municipal_taxes_annual": municipal_tax,
        "school_taxes_annual":    school_tax,
        "evaluation_fonciere":    assessment,
        "welcome_tax":            transfer_tax,
        "cap_rate":               calc.get("cap_rate"),
        "noi_annual":             calc.get("noi"),
        "monthly_cash_flow":      round(calc["annual_cash_flow"] / 12, 2) if calc.get("annual_cash_flow") else None,
        "monthly_mortgage":       calc.get("monthly_mortgage"),
        "cash_on_cash_return":    calc.get("roi"),
        "raw_expenses": {
            "centris_url":         centris_url,
            "gross_revenue":       gross_revenue,
            "municipal_tax":       municipal_tax,
            "school_tax":          school_tax,
            "electricity":         electricity,
            "assessment_lot":      terrain,
            "assessment_building": batiment,
            "assessment_total":    assessment,
            "transfer_tax":        transfer_tax,
            "transfer_tax_source": "centris.ca/api/calculator/CalcTransfersImmovableDutiesForQc",
            "noi":                 calc.get("noi"),
            "cap_rate":            calc.get("cap_rate"),
            "roi":                 calc.get("roi"),
            "down_payment":        calc.get("down_payment"),
            "monthly_mortgage":    calc.get("monthly_mortgage"),
            "annual_mortgage":     calc.get("annual_mortgage"),
            "annual_cash_flow":    calc.get("annual_cash_flow"),
        },
    }


# ── Main pipeline ─────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 68)
    print("   REALTOR.CA  →  CENTRIS ENRICHMENT  →  DATABASE")
    print("=" * 68)
    print(f"   Target: {TARGET_COUNT} new properties not yet in DB")
    print()

    conn   = get_db_conn()
    client = ScrapflyClient(key=SCRAPFLY_KEY)

    # ── Step 1: Find new listings from Realtor.ca ─────────────────────────────
    print("[1/4]  Fetching Realtor.ca listings — Montreal multi-family...")
    new_props: list[dict] = []
    page = 1

    while len(new_props) < TARGET_COUNT and page <= 25:
        print(f"  Page {page} (multi-family group)...")
        # ptg_id=3 = Revenue/multi-family group; ptg_id=1 = Residential (also has plexes)
        results = scrape_realtor_page(client, page=page, ptg_id=3)
        if not results:
            results = scrape_realtor_page(client, page=page, ptg_id=1)

        if not results:
            print("  No more results from Realtor.ca API.")
            break

        for r in results:
            prop = parse_realtor_result(r)
            if not prop:
                continue

            # Skip single-family / condo — no rental income on Centris → can't calculate NOI
            if prop["property_type"] not in MULTI_FAMILY_TYPES:
                continue

            mls = prop["mls_number"]
            if mls_exists(conn, mls):
                print(f"  [skip] MLS {mls} already in DB")
                continue

            # Split "Laval (Laval-Ouest)" → city="Laval", neighborhood="Laval-Ouest"
            city_raw = prop.get("city") or ""
            city_match = re.match(r"^([^(]+?)(?:\s*\(([^)]+)\))?$", city_raw.strip())
            if city_match:
                prop["city"] = city_match.group(1).strip()
                if city_match.group(2):
                    prop["neighborhood"] = city_match.group(2).strip()

            new_props.append(prop)
            price = prop.get("asking_price") or 0
            print(f"  [NEW]  MLS {mls:<12} {prop['property_type']:<14} "
                  f"${price:>12,.0f}  {prop['full_address']}")
            if len(new_props) >= TARGET_COUNT:
                break

        page += 1

    if not new_props:
        print("\n  No new properties found. All current Realtor.ca listings")
        print("  in this area are already saved in the database.")
        conn.close()
        return

    print(f"\n  Found {len(new_props)} new properties to process.\n")

    # ── Step 2: Insert basic property records ─────────────────────────────────
    print("[2/4]  Inserting property records to database...")
    inserted = []
    for prop in new_props:
        ok = insert_property(conn, prop)
        mls = prop["mls_number"]
        if ok:
            inserted.append(prop)
            print(f"  [OK]   MLS {mls}  →  {prop['full_address']}")
        else:
            print(f"  [FAIL] MLS {mls}  →  insert failed (see error above)")

    # ── Step 3: Centris financial enrichment ──────────────────────────────────
    print(f"\n[3/4]  Enriching with Centris financials ({len(inserted)} properties)...")

    enriched = []
    for prop in inserted:
        mls = prop["mls_number"]
        print(f"\n  ── MLS {mls}  {prop['full_address'][:50]} ──────")
        try:
            fin = enrich_with_centris(client, prop)
        except Exception as e:
            print(f"    [ERROR] Centris enrichment failed: {e}")
            fin = {}

        if fin:
            update_financials(conn, mls, fin)
            cap = fin.get("cap_rate")
            noi = fin.get("noi_annual")
            roi = fin.get("cash_on_cash_return")
            mcf = fin.get("monthly_cash_flow")
            print(f"    Saved → NOI: {fmt(noi)}/yr  |  Cap Rate: {fmt_pct(cap)}"
                  f"  |  Monthly Cash Flow: {fmt(mcf)}  |  ROI: {fmt_pct(roi)}")
            enriched.append((mls, prop["full_address"], fin))
        else:
            enriched.append((mls, prop["full_address"], {}))
            print(f"    Basic record saved. Centris data not available for this MLS.")

    # ── Step 4: Final summary ─────────────────────────────────────────────────
    print(f"\n[4/4]  Pipeline complete.\n")
    print("=" * 68)
    print(f"  {'MLS':<13} {'Address':<36} {'Cap Rate':<10} {'NOI/yr':<12} {'CF/mo'}")
    print("  " + "─" * 66)
    for mls, addr, fin in enriched:
        cap = f"{fin['cap_rate']:.2f}%"   if fin.get("cap_rate")         else "N/A"
        noi = f"${fin['noi_annual']:,.0f}" if fin.get("noi_annual")       else "N/A"
        mcf = f"${fin['monthly_cash_flow']:,.0f}" if fin.get("monthly_cash_flow") else "N/A"
        print(f"  {mls:<13} {addr[:36]:<36} {cap:<10} {noi:<12} {mcf}")
    print("=" * 68)
    print()
    print("  Open the dashboard to see these properties with financial data.")
    print()

    conn.close()


if __name__ == "__main__":
    main()
