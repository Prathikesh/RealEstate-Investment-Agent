"""
Realtor.ca scraper — uses their internal JSON API directly.
HTML pages return ~1KB shells; the real data is in the POST endpoint.

API endpoint: POST https://api2.realtor.ca/Listing.svc/PropertySearch_Post
No ASP or JS rendering needed — plain POST with form-encoded body.
Credits: much cheaper than Centris (no browser rendering required).

Address format in response:
  "5950 Boul. Cavendish|#105|Côte-Saint-Luc, Quebec H4W3H1"
  Pipe-separated: street | unit (optional) | "City, Province PostalCode"
"""
import re
from typing import Optional
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper, RawProperty


# Realtor.ca building type → our PropertyType enum
PROPERTY_TYPE_MAP: dict[str, str] = {
    "duplex":            "duplex",
    "triplex":           "triplex",
    "fourplex":          "quadruplex",
    "quadruplex":        "quadruplex",
    "multi-family":      "triplex",
    "revenue property":  "triplex",
    "row / townhouse":   "townhouse",
    "townhouse":         "townhouse",
    "single family":     "single_family",
    "house":             "single_family",
    "apartment":         "condo",
    "condo":             "condo",
    "condominium":       "condo",
}

API_URL = "https://api2.realtor.ca/Listing.svc/PropertySearch_Post"
DETAIL_BASE = "https://www.realtor.ca"

API_HEADERS = {
    "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
    "Referer":          "https://www.realtor.ca/",
    "X-Requested-With": "XMLHttpRequest",
}

# Geographic bounding box for Greater Montreal (covers most Quebec plex inventory)
MONTREAL_BBOX = {
    "LatitudeMax":  "45.7500",
    "LatitudeMin":  "45.3000",
    "LongitudeMax": "-73.3000",
    "LongitudeMin": "-74.1000",
}

# Broader Quebec province bbox for province-wide scraping
QUEBEC_BBOX = {
    "LatitudeMax":  "47.0000",
    "LatitudeMin":  "44.9000",
    "LongitudeMax": "-71.0000",
    "LongitudeMin": "-79.5000",
}

# City-level bboxes — each returns more targeted pages from the API
QUEBEC_CITY_BBOXES: dict[str, dict] = {
    "montreal": {
        "LatitudeMax": "45.7050", "LatitudeMin": "45.4100",
        "LongitudeMax": "-73.4750", "LongitudeMin": "-73.9800",
    },
    "laval": {
        "LatitudeMax": "45.7300", "LatitudeMin": "45.5200",
        "LongitudeMax": "-73.5800", "LongitudeMin": "-73.8500",
    },
    "longueuil": {
        "LatitudeMax": "45.5800", "LatitudeMin": "45.4200",
        "LongitudeMax": "-73.3500", "LongitudeMin": "-73.6500",
    },
    "south_shore": {
        "LatitudeMax": "45.5000", "LatitudeMin": "45.2500",
        "LongitudeMax": "-73.1500", "LongitudeMin": "-73.7000",
    },
    "quebec_city": {
        "LatitudeMax": "46.9500", "LatitudeMin": "46.6500",
        "LongitudeMax": "-71.0500", "LongitudeMin": "-71.5500",
    },
    "sherbrooke": {
        "LatitudeMax": "45.4800", "LatitudeMin": "45.3200",
        "LongitudeMax": "-71.7500", "LongitudeMin": "-72.0500",
    },
    "gatineau": {
        "LatitudeMax": "45.5800", "LatitudeMin": "45.3500",
        "LongitudeMax": "-75.5500", "LongitudeMin": "-75.9000",
    },
    "trois_rivieres": {
        "LatitudeMax": "46.4200", "LatitudeMin": "46.2800",
        "LongitudeMax": "-72.4500", "LongitudeMin": "-72.6500",
    },
}


class RealtorScraper(BaseScraper):
    SOURCE = "realtor"

    def _build_body(
        self,
        bbox: dict,
        page: int = 1,
        records_per_page: int = 12,
        property_type_group_id: int = 1,   # 1=Residential, 3=Multi-family/Revenue
        transaction_type_id: int = 2,       # 2=For Sale
    ) -> str:
        # Minimal parameter set — matches what the API accepts without triggering 403.
        # Extra params like StoreyRange= (empty) cause the API to reject the request.
        params = {
            "ZoomLevel":           "11",
            "LatitudeMax":         bbox["LatitudeMax"],
            "LatitudeMin":         bbox["LatitudeMin"],
            "LongitudeMax":        bbox["LongitudeMax"],
            "LongitudeMin":        bbox["LongitudeMin"],
            "Sort":                "6-D",
            "PropertyTypeGroupID": str(property_type_group_id),
            "TransactionTypeId":   str(transaction_type_id),
            "RecordsPerPage":      str(records_per_page),
            "CurrentPage":         str(page),
            "CultureId":           "1",
            "ApplicationId":       "1",
            "Version":             "7.0",
        }
        return urlencode(params)

    # ── Public API ────────────────────────────────────────────────────────────

    async def scrape_listings(
        self,
        area: str = "montreal",
        page: int = 1,
        property_type_group_id: int = 1,
    ) -> list[RawProperty]:
        """
        Fetch one page of listings from the Realtor.ca JSON API.
        area: "montreal" (default) or "quebec" (province-wide)
        property_type_group_id: 1=Residential, 3=Multi-family/Revenue
        """
        bbox = MONTREAL_BBOX if area == "montreal" else QUEBEC_BBOX
        return await self._post_and_parse(bbox, page, property_type_group_id)

    async def _establish_session(self, session_id: str) -> None:
        """
        Visit realtor.ca homepage to get valid session cookies.
        Without this, direct API calls return 403 — Realtor.ca requires
        a real browser session before accepting API POST requests.
        """
        from scrapfly import ScrapeConfig
        self.logger.info("Establishing Realtor.ca browser session ...")
        await self.client.async_scrape(ScrapeConfig(
            url="https://www.realtor.ca",
            asp=True,
            render_js=True,
            session=session_id,
            country="ca",
        ))
        self.logger.info("Session established.")

    async def _post_and_parse(
        self, bbox: dict, page: int, property_type_group_id: int,
    ) -> list[RawProperty]:
        from scrapfly import ScrapeConfig

        body = self._build_body(bbox, page=page, property_type_group_id=property_type_group_id)
        config = ScrapeConfig(
            url=API_URL,
            method="POST",
            body=body,
            headers=API_HEADERS,
            country="ca",
            asp=False,
            render_js=False,
        )
        result = await self.client.async_scrape(config)

        if result.upstream_status_code != 200:
            self.logger.error(f"API returned {result.upstream_status_code}")
            return []

        import json
        try:
            data = json.loads(result.content)
        except Exception as exc:
            self.logger.error(f"JSON parse failed: {exc}")
            return []

        raw_results = data.get("Results", [])
        paging = data.get("Paging", {})
        self.logger.info(
            f"[realtor] Page {page} — {len(raw_results)} results "
            f"| total pages: {paging.get('TotalPages', '?')}"
        )

        return [p for p in (self._parse_result(r) for r in raw_results) if p]

    # ── Detail page ───────────────────────────────────────────────────────────

    async def scrape_detail(self, url: str) -> Optional[RawProperty]:
        """
        Fetch one property detail page to get financial data not available in
        the search API: rental income, municipal/school taxes, year built,
        unit count, lot size.
        Requires JS rendering — costs more Scrapfly credits than a search call.
        """
        result = await self.fetch(url, asp=True, render_js=True)
        if result.upstream_status_code != 200:
            self.logger.error(f"Detail {result.upstream_status_code}: {url}")
            return None
        return self._parse_detail_page(result.content, source_url=url)

    def _parse_detail_page(self, html: str, source_url: str) -> Optional[RawProperty]:
        soup = BeautifulSoup(html, "html.parser")

        # MLS from URL  e.g. /real-estate/28123456/address
        mls_match = re.search(r"/(\d{7,9})(?:[/?]|$)", source_url)
        mls_number = mls_match.group(1) if mls_match else None

        # Build a flat {label_lower: value_text} map from every label/value pair
        # on the page, covering Realtor.ca's two main HTML patterns.
        label_map: dict[str, str] = {}

        # Pattern 1: <li> with label/value span children
        for li in soup.select("li"):
            label_el = (
                li.select_one(".propertyDetailsSectionContentLabel") or
                li.select_one("[class*='label']")
            )
            value_el = (
                li.select_one(".propertyDetailsSectionContentValue") or
                li.select_one("[class*='value']")
            )
            if label_el and value_el:
                label_map[label_el.get_text(strip=True).lower()] = value_el.get_text(strip=True)

        # Pattern 2: <dl><dt>label</dt><dd>value</dd></dl>
        for dl in soup.select("dl"):
            for dt, dd in zip(dl.select("dt"), dl.select("dd")):
                label_map[dt.get_text(strip=True).lower()] = dd.get_text(strip=True)

        def _money(keys: list[str]) -> Optional[float]:
            for key in keys:
                for label, val in label_map.items():
                    if key in label:
                        digits = re.sub(r"[^\d]", "", val)
                        if digits:
                            return float(digits)
            return None

        def _int(keys: list[str]) -> Optional[int]:
            for key in keys:
                for label, val in label_map.items():
                    if key in label:
                        nums = re.findall(r"\d+", val)
                        if nums:
                            return int(nums[0])
            return None

        rental_annual   = _money(["annual rental", "rental income", "revenus locatifs", "revenu annuel"])
        municipal_tax   = _money(["municipal tax", "taxe municipal", "taxes municipal"])
        school_tax      = _money(["school tax", "taxe scolaire", "taxes scolaire"])
        condo_fees      = _money(["condo fee", "frais de condo", "monthly fee", "frais mensuels"])
        year_built      = _int(["year built", "année de construction", "construit", "year of construction"])
        unit_count      = _int(["number of unit", "nombre de logement", "total unit", "logements"])
        sqft            = _int(["living area", "interior size", "superficie habitable", "sq. ft", "pi²"])
        lot_sqft        = _int(["lot size", "lot area", "terrain", "land size", "superficie du terrain"])

        return RawProperty(
            source=self.SOURCE,
            source_url=source_url,
            source_listing_id=mls_number,
            mls_number=mls_number,
            rental_income_monthly=round(rental_annual / 12, 2) if rental_annual else None,
            municipal_taxes_annual=municipal_tax,
            school_taxes_annual=school_tax,
            condo_fees_monthly=condo_fees,
            year_built=year_built,
            unit_count=unit_count,
            sqft_total=sqft,
            lot_sqft=lot_sqft,
            raw_data={"source_url": source_url, "mls": mls_number},
        )

    # ── Parser ────────────────────────────────────────────────────────────────

    def _parse_result(self, r: dict) -> Optional[RawProperty]:
        mls_number = r.get("MlsNumber")
        if not mls_number:
            return None

        # ── Property sub-object ───────────────────────────────────────────────
        prop  = r.get("Property", {})
        bldg  = r.get("Building", {})
        addr  = prop.get("Address", {})

        # Price
        asking_price = self._parse_price(prop.get("Price", ""))

        # Address
        address_text = addr.get("AddressText", "")
        full_address, city, postal_code, province = self._parse_address(address_text)

        # Quebec-only filter — skip non-QC properties
        if province and province != "QC":
            return None

        # Coordinates
        lat = addr.get("Latitude")
        lng = addr.get("Longitude")

        # Property type — Building.Type is the real structural type ("Duplex",
        # "Triplex", ...); Property.Type is a generic top-level label that's
        # "Single Family" on nearly every residential listing regardless of
        # actual unit count, so it must not take priority (confirmed via live
        # API inspection: a "1728-1730 Rue Le Caron" duplex listing has
        # Property.Type="Single Family" and Building.Type="Duplex").
        raw_type = (bldg.get("Type") or prop.get("Type") or "").lower()
        property_type = PROPERTY_TYPE_MAP.get(raw_type, "single_family")

        # Building specs
        sqft_raw  = bldg.get("SizeInterior", "")
        sqft      = self._parse_sqft(sqft_raw)
        beds_raw  = bldg.get("Bedrooms", "")
        beds      = int(beds_raw) if beds_raw and beds_raw.isdigit() else None
        baths_raw = bldg.get("BathroomTotal", "")
        baths     = float(baths_raw) if baths_raw else None
        stories   = bldg.get("StoriesTotal")
        floors    = int(stories) if stories and str(stories).isdigit() else None

        # Year built — ConstructedDate is "1965-01-01T00:00:00" or plain "1965"
        year_built = self._parse_year(
            bldg.get("ConstructedDate") or bldg.get("YearBuilt") or ""
        )

        # Unit count — present on revenue/multi-family listings. UnitTotal is the
        # real field name confirmed via live API inspection (TotalUnits/
        # NumberOfUnits/TotalSuites below never actually appear — kept as a
        # harmless fallback in case Realtor's schema varies by listing).
        units_raw = (
            bldg.get("UnitTotal") or bldg.get("TotalUnits") or bldg.get("NumberOfUnits") or
            bldg.get("TotalSuites") or ""
        )
        unit_count = int(str(units_raw)) if units_raw and str(units_raw).isdigit() else None

        # Building.Type is sometimes blank on otherwise-complete listings (e.g. a
        # confirmed live case: a real 4-unit property with UnitTotal=4 but no
        # Building.Type at all, silently falling back to "single_family" above —
        # which matters beyond labeling, since the pipeline hard-caps estimated-
        # rent scoring for single_family/condo/townhouse). unit_count is the more
        # reliable signal when present, so let it correct an unclassified type.
        if property_type == "single_family" and unit_count:
            property_type = {2: "duplex", 3: "triplex", 4: "quadruplex"}.get(unit_count, "quintuplex_plus" if unit_count >= 5 else property_type)

        # Lot size
        land      = r.get("Land", {})
        lot_raw   = land.get("SizeTotal") or land.get("SizeTotalText") or ""
        lot_sqft  = self._parse_sqft(str(lot_raw)) if lot_raw else None

        # Parking
        parking_raw = prop.get("ParkingSpaceTotal", "")
        parking = int(parking_raw) if parking_raw and str(parking_raw).isdigit() else None

        # Photos — use HighResPath
        photos = [
            p["HighResPath"]
            for p in prop.get("Photo", [])
            if p.get("HighResPath")
        ]

        # Listing URL
        relative_url = r.get("RelativeDetailsURL") or r.get("RelativeURLEn", "")
        source_url = f"{DETAIL_BASE}{relative_url}" if relative_url else API_URL

        # Description
        description = r.get("PublicRemarks")

        # Days on market
        time_on = r.get("TimeOnRealtor", "")
        dom = self._parse_days_on_market(time_on)

        # Agent / dealer contact from Individual array
        individuals = r.get("Individual") or []
        agent = individuals[0] if individuals else {}
        agent_name  = agent.get("Name") or None
        agent_phone = self._extract_phone(agent)
        agent_email = agent.get("EmailAddress") or None
        org = agent.get("Organization") or {}
        agency_name = org.get("Name") or None

        return RawProperty(
            source=self.SOURCE,
            source_url=source_url,
            source_listing_id=mls_number,
            mls_number=mls_number,
            full_address=full_address,
            city=city,
            postal_code=postal_code,
            property_type=property_type,
            asking_price=asking_price,
            bedrooms_total=beds,
            bathrooms_total=baths,
            sqft_total=sqft,
            lot_sqft=lot_sqft,
            year_built=year_built,
            unit_count=unit_count,
            floors=floors,
            parking_spaces=parking,
            photos=photos,
            description=description,
            days_on_market=dom,
            agent_name=agent_name,
            agent_phone=agent_phone,
            agent_email=agent_email,
            agency_name=agency_name,
            raw_data={
                "mls": mls_number,
                "raw_type": raw_type,
                "address_text": address_text,
                "lat": lat,
                "lng": lng,
            },
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_price(text: str) -> Optional[float]:
        if not text:
            return None
        digits = re.sub(r"[^\d]", "", text)
        return float(digits) if digits else None

    @staticmethod
    def _parse_sqft(text: str) -> Optional[int]:
        if not text:
            return None
        text = str(text)
        match = re.search(r"[\d,]+\.?\d*", text)
        if not match:
            return None
        value = float(match.group().replace(",", ""))
        # Realtor.ca returns metric (m²) for most Quebec listings — convert to sqft
        if re.search(r"m2|m²|mètre|metre|sq\.?\s*m", text, re.IGNORECASE):
            value = value * 10.764
        # Sanity check: residential sqft must be between 100 and 50,000
        if value < 100 or value > 50000:
            return None
        return int(value)

    @staticmethod
    def _parse_address(text: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        """
        Parse pipe-separated Realtor.ca address.
        "5950 Boul. Cavendish|#105|Côte-Saint-Luc, Quebec H4W3H1"
        → ("5950 Boul. Cavendish, Côte-Saint-Luc", "Côte-Saint-Luc", "H4W3H1", "QC")
        """
        if not text:
            return None, None, None, None

        parts = [p.strip() for p in text.split("|")]

        # Last part: "City, Province PostalCode"
        city = postal_code = province = None
        if parts:
            last = parts[-1]
            # Postal code is 6 chars like H4W3H1
            pc_match = re.search(r"[A-Z]\d[A-Z]\s?\d[A-Z]\d", last)
            if pc_match:
                postal_code = pc_match.group().replace(" ", "")

            # "City, Province PostalCode" — province is between comma and postal code
            prov_match = re.search(
                r",\s*([A-Za-zÀ-ÿ\s]+?)\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d", last
            )
            if prov_match:
                prov_raw = prov_match.group(1).strip().upper()
                # Normalize to 2-letter code
                if prov_raw in ("QC", "QUEBEC", "QUÉBEC"):
                    province = "QC"
                elif prov_raw in ("ON", "ONTARIO"):
                    province = "ON"
                else:
                    province = prov_raw[:2]

            # City is before the comma
            city_match = re.match(r"^([^,]+),", last)
            if city_match:
                city = city_match.group(1).strip()

        # Street address = first part
        street = parts[0] if parts else None
        full_address = f"{street}, {city}" if street and city else street

        return full_address, city, postal_code, province

    @staticmethod
    def _extract_phone(agent: dict) -> Optional[str]:
        """Extract first available phone number from agent dict."""
        # Try Phone.Value first (single phone object)
        phone_obj = agent.get("Phone")
        if phone_obj and isinstance(phone_obj, dict):
            val = phone_obj.get("Value") or phone_obj.get("PhoneNumber")
            if val:
                return str(val)
        # Try Phones list
        phones = agent.get("Phones") or []
        if phones and isinstance(phones, list):
            first = phones[0]
            if isinstance(first, dict):
                return first.get("PhoneNumber") or first.get("Value") or None
            return str(first)
        return None

    @staticmethod
    def _parse_year(text: str) -> Optional[int]:
        """Extract a 4-digit year from strings like '1965-01-01T00:00:00' or '1965'."""
        if not text:
            return None
        match = re.search(r"\b(19|20)\d{2}\b", str(text))
        return int(match.group()) if match else None

    @staticmethod
    def _parse_days_on_market(text: str) -> Optional[int]:
        """Parse "3 days", "1 month", "2 weeks" → integer days."""
        if not text:
            return None
        text = text.lower()
        match = re.search(r"(\d+)\s*(day|week|month)", text)
        if not match:
            return None
        val = int(match.group(1))
        unit = match.group(2)
        if unit == "week":
            return val * 7
        if unit == "month":
            return val * 30
        return val
