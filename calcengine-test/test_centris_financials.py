


"""
Centris Financial Lookup — Terminal Test Tool
=============================================
Enter only the MLS number.
The script looks up the Centris URL from your PostgreSQL database,
scrapes Centris via Scrapfly, and displays all financial data in English.

Usage:
    python test_centris_financials.py
"""

import os
import re
import sys
import psycopg2
from dotenv import load_dotenv
from scrapfly import ScrapflyClient, ScrapeConfig
from scrapfly.errors import UpstreamHttpClientError

load_dotenv()

if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRAPFLY_KEY = os.getenv("SCRAPFLY_API_KEY")
DATABASE_URL  = os.getenv("DATABASE_URL")

if not SCRAPFLY_KEY:
    print("[ERROR] SCRAPFLY_API_KEY not found in .env")
    sys.exit(1)
if not DATABASE_URL:
    print("[ERROR] DATABASE_URL not found in .env")
    sys.exit(1)

SESSION  = "centris-test-session"
BASE_URL = "https://www.centris.ca"

# ── French → English field label translations ─────────────────────────────────
TRANSLATIONS = {
    # Assessment
    "terrain":                          "Lot",
    "bâtiment":                         "Building",
    "batiment":                         "Building",
    # Taxes
    "municipales":                      "Municipal Tax",
    "scolaires":                        "School Tax",
    "total":                            "Total",
    # Expenses
    "électricité":                      "Electricity",
    "electricite":                      "Electricity",
    "hydro":                            "Hydro",
    "assurances":                       "Insurance",
    "entretien":                        "Maintenance",
    "frais de gestion":                 "Management Fees",
    "dépenses totales":                 "Total Expenses",
    "total des dépenses":               "Total Expenses",
    # Income
    "revenus bruts potentiels":         "Gross Potential Revenue",
    "revenus bruts":                    "Gross Revenue",
    "revenus locatifs":                 "Rental Income",
    "revenu net":                       "Net Income",
    # Property details
    "année de construction":            "Year Built",
    "style de bâtiment":                "Building Style",
    "nombre d'unités":                  "Number of Units",
    "unités résidentielles":            "Residential Units",
    "unité principale":                 "Main Unit",
    "superficie habitable":             "Living Area (sqft)",
    "superficie du terrain":            "Lot Size (sqft)",
    "superficie du bâtiment (au sol)":  "Building Footprint (sqft)",
    "stationnement total":              "Total Parking",
    "foyer / poêle":                    "Fireplace / Stove",
    "piscine":                          "Pool",
    "caractéristiques additionnelles":  "Additional Features",
    "date d'emménagement":              "Move-in Date",
    "utilisation de la propriété":      "Property Use",
    "intergénération":                  "In-law Suite",
    # Demographics (shown in debug)
    "densité de population":            "Population Density",
    "population (2021)":                "Population (2021)",
    "taux de chômage (2021)":           "Unemployment Rate (2021)",
    "variation de la pop. entre 2016 et 2021": "Pop. Change 2016-2021",
}


def translate(label: str) -> str:
    """Translate a French Centris label to English."""
    lower = label.lower().strip()
    # Exact match first
    if lower in TRANSLATIONS:
        return TRANSLATIONS[lower]
    # Partial match for labels with year suffix e.g. "municipales (2026)"
    for fr, en in TRANSLATIONS.items():
        if lower.startswith(fr):
            # Preserve year suffix if present
            suffix = lower[len(fr):].strip()
            year = re.search(r"\d{4}", suffix)
            return f"{en} ({year.group()})" if year else en
    # Fallback: title-case the original
    return label.title()


# ── Database lookup ───────────────────────────────────────────────────────────

def get_property_from_db(mls: str) -> dict | None:
    """Return all fields needed to locate and analyse the property."""
    db_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://") \
                         .replace("+asyncpg", "")
    try:
        conn = psycopg2.connect(db_url)
        cur  = conn.cursor()
        cur.execute(
            """SELECT listing_url, asking_price, city, neighborhood, property_type
               FROM properties WHERE mls_number = %s LIMIT 1;""",
            (mls,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            return {
                "listing_url":   row[0],
                "asking_price":  row[1],
                "city":          row[2],
                "neighborhood":  row[3],
                "property_type": row[4],
            }
        return None
    except Exception as e:
        print(f"  [DB ERROR] {e}")
        return None


# ── Centris URL builder (for non-Centris sourced properties) ─────────────────

import unicodedata

TYPE_SLUG_MAP = {
    "single_family":    ["maison", "cottage"],
    "duplex":           ["duplex"],
    "triplex":          ["triplex"],
    "quadruplex":       ["quadruplex"],
    "quintuplex_plus":  ["quintuplex"],
    "condo":            ["condo"],
    "townhouse":        ["maison"],
    "plex":             ["plex", "triplex", "duplex", "quadruplex"],
}


def to_slug(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Replace spaces, slashes, underscores with hyphen
    slug = re.sub(r"[\s/_]+", "-", ascii_str.lower())
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    return re.sub(r"-+", "-", slug).strip("-")


def find_centris_url(client, mls: str, prop_type: str, city: str, neighborhood: str) -> str | None:
    """
    Try Centris URL patterns built from city + neighborhood + property type.
    Returns the working URL or None.
    """
    city_slug  = to_slug(city)
    nbhd_slug  = to_slug(neighborhood) if neighborhood else ""
    location   = f"{city_slug}-{nbhd_slug}" if nbhd_slug and nbhd_slug != city_slug else city_slug
    slugs      = TYPE_SLUG_MAP.get(prop_type, ["plex", "triplex", "duplex", "maison"])

    for slug in slugs:
        url = f"{BASE_URL}/fr/{slug}~a-vendre~{location}/{mls}"
        print(f"  Trying: {url}")
        try:
            result = fetch_cheap(client, url)
            if result.upstream_status_code == 200 and len(result.content) > 8_000:
                return url
        except UpstreamHttpClientError:
            pass
        except Exception:
            pass
        # Full JS fallback
        try:
            result = fetch_full(client, url)
            if result.upstream_status_code == 200 and len(result.content) > 8_000:
                return url
        except UpstreamHttpClientError:
            pass
        except Exception:
            pass

    return None


# ── Scrapfly helpers ──────────────────────────────────────────────────────────

def fetch_cheap(client, url):
    return client.scrape(ScrapeConfig(url=url, asp=False, render_js=False, country="CA"))


def fetch_full(client, url):
    return client.scrape(ScrapeConfig(
        url=url, asp=True, render_js=True, country="CA", session=SESSION,
    ))


def get_detail_page(client, url):
    try:
        result = fetch_cheap(client, url)
        credits = result.context.get("cost", {}).get("total", "?")
        if result.upstream_status_code == 200 and len(result.content) > 8_000:
            print(f"  Fetched successfully | Credits used: {credits}")
            return result
    except UpstreamHttpClientError:
        pass
    except Exception:
        pass

    result = fetch_full(client, url)
    credits = result.context.get("cost", {}).get("total", "?")
    print(f"  Fetched successfully | Credits used: {credits}")
    return result


# ── Carac dict builder ────────────────────────────────────────────────────────

def build_carac_dict(sel) -> dict:
    result: dict[str, str] = {}

    for container in sel.css(".carac-container"):
        label = " ".join(
            container.css(".carac-title::text, .carac-title *::text").getall()
        ).strip().lower()
        value = " ".join(
            container.css(".carac-value::text, .carac-value *::text").getall()
        ).strip()
        if label and value:
            result[label] = value

    for dl in sel.css("dl"):
        for dt, dd in zip(dl.css("dt"), dl.css("dd")):
            label = " ".join(dt.css("::text, *::text").getall()).strip().lower()
            value = " ".join(dd.css("::text, *::text").getall()).strip()
            if label and value:
                result[label] = value

    for row in sel.css("table tr"):
        cells = row.css("td, th")
        if len(cells) >= 2:
            label = " ".join(cells[0].css("::text, *::text").getall()).strip().lower()
            value = " ".join(cells[-1].css("::text, *::text").getall()).strip()
            if label and value and label != value:
                result[label] = value

    for li in sel.css("li"):
        spans = li.css("span")
        if len(spans) >= 2:
            label = " ".join(spans[0].css("::text, *::text").getall()).strip().lower()
            value = " ".join(spans[-1].css("::text, *::text").getall()).strip()
            if label and value and label != value and len(label) < 80:
                result.setdefault(label, value)

    return result


def lookup_money(carac: dict, *keys: str):
    _skip = ("superficie", "population", "taux", "variation", " pc", " m²",
             "km", "pièces", "chambre", "étage", "stationnement")
    # Exact match first
    for key in keys:
        val = carac.get(key)
        if val:
            digits = re.sub(r"[^\d]", "", val)
            if digits and int(digits) > 0:
                return float(digits)
    # Partial match
    for key in keys:
        for label, val in carac.items():
            if key in label and label != key:
                if any(s in label for s in _skip):
                    continue
                digits = re.sub(r"[^\d]", "", val)
                if digits and int(digits) > 0:
                    return float(digits)
    return None


def fmt(val) -> str:
    return "N/A" if val is None else f"${val:,.0f}"


def fmt_pct(val) -> str:
    return "N/A" if val is None else f"{val:.2f}%"


def divider():
    print(f"    {'─' * 34}")


# ── NOI & Cap Rate calculator ─────────────────────────────────────────────────

INSURANCE_RATE    = 0.002  # 0.2% of assessment total
MAINTENANCE_RATE  = 0.005  # 0.5% of assessment total

def calculate_noi_caprate(
    gross_revenue:    float | None,
    municipal_tax:    float | None,
    school_tax:       float | None,
    electricity:      float | None,
    assessment_total: float | None,
    asking_price:     float | None,
) -> dict:
    """
    Calculate NOI and Cap Rate from scraped Centris data.

    Uses actuals where available, industry-standard estimates where not.
    Returns a dict with all line items and flags showing actual vs estimated.
    """
    results = {}

    if not gross_revenue:
        results["error"] = "Cannot calculate — Gross Revenue not listed on Centris."
        return results

    # ── Expenses ──────────────────────────────────────────────────────────────
    muni_tax   = municipal_tax or 0
    school_tax = school_tax    or 0
    elec       = electricity   or 0

    # Insurance — use actual if listed, else estimate from assessment
    if assessment_total:
        insurance_est = round(assessment_total * INSURANCE_RATE, 2)
    else:
        insurance_est = 0
    insurance_actual = False  # Centris rarely lists insurance separately

    # Maintenance — always estimated
    if assessment_total:
        maintenance_est = round(assessment_total * MAINTENANCE_RATE, 2)
    else:
        maintenance_est = 0

    total_expenses = round(
        muni_tax + school_tax + elec + insurance_est + maintenance_est, 2
    )

    noi = round(gross_revenue - total_expenses, 2)

    # ── Cap Rate ──────────────────────────────────────────────────────────────
    cap_rate = None
    if asking_price and asking_price > 0 and noi > 0:
        cap_rate = round((noi / asking_price) * 100, 2)

    # ── ROI ───────────────────────────────────────────────────────────────────
    MORTGAGE_RATE        = 0.055   # 5.50% annual
    AMORTIZATION_YEARS   = 25
    DOWN_PAYMENT_PCT     = 0.20

    roi = None
    down_payment      = None
    mortgage_amount   = None
    monthly_mortgage  = None
    annual_mortgage   = None
    annual_cash_flow  = None

    if asking_price and asking_price > 0:
        down_payment    = round(asking_price * DOWN_PAYMENT_PCT, 2)
        mortgage_amount = round(asking_price - down_payment, 2)

        # Standard mortgage payment formula
        r = MORTGAGE_RATE / 12                  # monthly rate
        n = AMORTIZATION_YEARS * 12             # total months
        monthly_mortgage = round(
            mortgage_amount * (r * (1 + r) ** n) / ((1 + r) ** n - 1), 2
        )
        annual_mortgage  = round(monthly_mortgage * 12, 2)
        annual_cash_flow = round(noi - annual_mortgage, 2)

        if down_payment > 0:
            roi = round((annual_cash_flow / down_payment) * 100, 2)

    results = {
        "gross_revenue":       gross_revenue,
        "municipal_tax":       muni_tax,
        "school_tax":          school_tax,
        "electricity":         elec,
        "insurance":           insurance_est,
        "insurance_estimated": not insurance_actual,
        "maintenance":         maintenance_est,
        "maintenance_estimated": True,
        "total_expenses":      total_expenses,
        "noi":                 noi,
        "asking_price":        asking_price,
        "cap_rate":            cap_rate,
        "down_payment":        down_payment,
        "mortgage_amount":     mortgage_amount,
        "monthly_mortgage":    monthly_mortgage,
        "annual_mortgage":     annual_mortgage,
        "annual_cash_flow":    annual_cash_flow,
        "roi":                 roi,
    }
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 60)
    print("   CENTRIS FINANCIAL LOOKUP")
    print("=" * 60)
    print()

    mls = input("  MLS Number: ").strip()
    if not mls:
        print("\n  No MLS entered. Exiting.")
        return

    # ── Step 1: Database lookup ───────────────────────────────────
    print(f"\n[1/3] Looking up MLS {mls} in database...")
    db_data = get_property_from_db(mls)

    if not db_data:
        print(f"\n  ERROR: MLS {mls} was not found in the database.")
        print("  Make sure the property has been scraped first.")
        return

    url           = db_data["listing_url"]
    asking_price  = db_data["asking_price"]
    raw_city      = db_data["city"] or ""
    neighborhood  = db_data["neighborhood"] or ""
    property_type = (db_data["property_type"] or "plex").lower()

    # City column sometimes stores "Montréal (Rosemont/La Petite-Patrie)"
    # Extract the base city and the borough from parentheses if neighborhood is empty
    city_match = re.match(r"^([^(]+?)(?:\s*\(([^)]+)\))?$", raw_city.strip())
    if city_match:
        city = city_match.group(1).strip()
        if not neighborhood and city_match.group(2):
            neighborhood = city_match.group(2).strip()
    else:
        city = raw_city

    client = ScrapflyClient(key=SCRAPFLY_KEY)

    if url and "centris" in url:
        print(f"  Source       : Centris")
        print(f"  URL          : {url}")
        print(f"  Asking Price : {fmt(asking_price)}")
    else:
        print(f"  Source       : {url or 'unknown'}")
        print(f"  Not a Centris listing — building Centris URL from address...")
        print(f"  City: {city} | Neighborhood: {neighborhood} | Type: {property_type}")
        print()
        url = find_centris_url(client, mls, property_type, city, neighborhood)
        if not url:
            print(f"\n  ERROR: Could not find MLS {mls} on Centris.")
            print("  The property may not be listed on Centris.")
            return
        print(f"  Found on Centris: {url}")
        print(f"  Asking Price : {fmt(asking_price)}")

    # ── Step 2: Scrape Centris ────────────────────────────────────
    print(f"\n[2/3] Fetching property data from Centris...")
    result = get_detail_page(client, url)

    if result.upstream_status_code != 200:
        print(f"\n  ERROR: Centris returned status {result.upstream_status_code}.")
        return

    # ── Step 3: Parse ─────────────────────────────────────────────
    print(f"\n[3/3] Parsing financial data...")

    sel   = result.selector
    carac = build_carac_dict(sel)

    # Build an English title from the URL slug
    # URL pattern: /fr/{type}~a-vendre~{location}/{mls}
    url_type_match = re.search(r"/fr/([^~]+)~a-vendre~([^/]+)/", url)
    if url_type_match:
        prop_type = url_type_match.group(1).replace("-", " ").title()
        location  = url_type_match.group(2).replace("-", " ").title()
        title = f"{prop_type} for Sale — {location}"
    else:
        title = "Property"

    # Extract values
    terrain       = lookup_money(carac, "terrain")
    batiment      = lookup_money(carac, "bâtiment", "batiment")
    assessment_total = ((terrain or 0) + (batiment or 0)) or None

    municipal_tax = lookup_money(carac, "municipales", "municipal")
    school_tax    = lookup_money(carac, "scolaires", "school")
    tax_total     = ((municipal_tax or 0) + (school_tax or 0)) or None

    electricity   = lookup_money(carac, "électricité", "electricite", "electricity", "hydro")
    gross_revenue = lookup_money(carac, "revenus bruts potentiels", "revenus bruts", "revenus locatifs")
    expenses_total = lookup_money(carac,
        "total des dépenses", "total des depenses",
        "dépenses totales", "depenses totales",
    )

    # Extract year built and units
    year_built = carac.get("année de construction", "N/A")
    units      = carac.get("nombre d'unités") or carac.get("nombre d'unites") or carac.get("unités résidentielles") or "N/A"

    # Get tax year from label key e.g. "municipales (2026)"
    muni_year = next((re.search(r"\d{4}", k).group()
                      for k in carac if "municipales" in k and re.search(r"\d{4}", k)), "")
    school_year = next((re.search(r"\d{4}", k).group()
                        for k in carac if "scolaires" in k and re.search(r"\d{4}", k)), "")

    # ── Display ───────────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"  MLS   : {mls}")
    print(f"  {title[:57]}")
    print(f"  Units : {units}   |   Year Built: {year_built}")
    print("=" * 60)

    print()
    print("  MUNICIPAL ASSESSMENT")
    print(f"    Lot                      : {fmt(terrain)}")
    print(f"    Building                 : {fmt(batiment)}")
    divider()
    print(f"    Total                    : {fmt(assessment_total)}")

    print()
    print("  TAXES")
    print(f"    Municipal {'(' + muni_year + ')' if muni_year else '':10}       : {fmt(municipal_tax)}")
    print(f"    School    {'(' + school_year + ')' if school_year else '':10}       : {fmt(school_tax)}")
    divider()
    print(f"    Total                    : {fmt(tax_total)}")

    print()
    print("  INCOME & EXPENSES")
    print(f"    Gross Revenue (annual)   : {fmt(gross_revenue)}")
    print(f"    Electricity              : {fmt(electricity)}")
    if expenses_total:
        divider()
        print(f"    Total Expenses           : {fmt(expenses_total)}")

    # ── NOI & Cap Rate ────────────────────────────────────────────
    calc = calculate_noi_caprate(
        gross_revenue    = gross_revenue,
        municipal_tax    = municipal_tax,
        school_tax       = school_tax,
        electricity      = electricity,
        assessment_total = assessment_total,
        asking_price     = asking_price,
    )

    print()
    print("  NOI CALCULATION")
    if "error" in calc:
        print(f"    {calc['error']}")
    else:
        print(f"    Gross Revenue (annual)   : {fmt(calc['gross_revenue'])}")
        print()
        print(f"    Municipal Tax            : -{fmt(calc['municipal_tax'])}")
        print(f"    School Tax               : -{fmt(calc['school_tax'])}")
        print(f"    Electricity              : -{fmt(calc['electricity'])}")
        ins_label = "  [estimated]" if calc["insurance_estimated"] else ""
        mnt_label = "  [estimated]"
        print(f"    Insurance{ins_label:<16}  : -{fmt(calc['insurance'])}")
        print(f"    Maintenance{mnt_label:<14}  : -{fmt(calc['maintenance'])}")
        divider()
        print(f"    NOI (annual)             : {fmt(calc['noi'])}")
        print(f"    NOI (monthly)            : {fmt(round(calc['noi'] / 12, 2))}")
        print()
        print(f"  CAP RATE")
        print(f"    Asking Price             : {fmt(calc['asking_price'])}")
        print(f"    Cap Rate                 : {fmt_pct(calc['cap_rate'])}")
        if calc['cap_rate']:
            if calc['cap_rate'] >= 6:
                cap_verdict = "STRONG"
            elif calc['cap_rate'] >= 4.5:
                cap_verdict = "ACCEPTABLE"
            else:
                cap_verdict = "LOW"
            print(f"    Verdict                  : {cap_verdict}")

        print()
        print(f"  ROI  (assuming 20% down, 5.50%, 25yr amort.)")
        print(f"    Down Payment (20%)       : {fmt(calc['down_payment'])}")
        print(f"    Mortgage Amount          : {fmt(calc['mortgage_amount'])}")
        print(f"    Monthly Mortgage         : {fmt(calc['monthly_mortgage'])}")
        print(f"    Annual Mortgage          : {fmt(calc['annual_mortgage'])}")
        divider()
        print(f"    NOI                      : {fmt(calc['noi'])}")
        print(f"    Annual Mortgage          : -{fmt(calc['annual_mortgage'])}")
        divider()
        print(f"    Annual Cash Flow         : {fmt(calc['annual_cash_flow'])}")
        print(f"    Monthly Cash Flow        : {fmt(round(calc['annual_cash_flow'] / 12, 2)) if calc['annual_cash_flow'] else 'N/A'}")
        print(f"    ROI                      : {fmt_pct(calc['roi'])}")
        if calc['roi'] is not None:
            if calc['roi'] >= 8:
                roi_verdict = "EXCELLENT"
            elif calc['roi'] >= 4:
                roi_verdict = "GOOD"
            elif calc['roi'] >= 0:
                roi_verdict = "BREAKEVEN"
            else:
                roi_verdict = "NEGATIVE CASH FLOW"
            print(f"    Verdict                  : {roi_verdict}")

    print()
    print("=" * 60)

    # ── Debug: all fields in English ──────────────────────────────
    print()
    print("  ALL FIELDS FROM CENTRIS (English)")
    print("  " + "-" * 54)
    for fr_label, value in sorted(carac.items()):
        en_label = translate(fr_label)
        # Skip navigation/UI noise
        if fr_label in ("en", "fr", "acheter", "vendre", "louer"):
            continue
        print(f"    {en_label:<40} : {value}")
    print()


if __name__ == "__main__":
    main()
