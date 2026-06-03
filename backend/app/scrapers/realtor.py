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
        full_address, city, postal_code = self._parse_address(address_text)

        # Coordinates
        lat = addr.get("Latitude")
        lng = addr.get("Longitude")

        # Property type
        raw_type = (prop.get("Type") or bldg.get("Type") or "").lower()
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
            floors=floors,
            parking_spaces=parking,
            photos=photos,
            description=description,
            days_on_market=dom,
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
        match = re.search(r"[\d,]+", text)
        if match:
            return int(match.group().replace(",", ""))
        return None

    @staticmethod
    def _parse_address(text: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Parse pipe-separated Realtor.ca address.
        "5950 Boul. Cavendish|#105|Côte-Saint-Luc, Quebec H4W3H1"
        → ("5950 Boul. Cavendish, Côte-Saint-Luc", "Côte-Saint-Luc", "H4W3H1")
        """
        if not text:
            return None, None, None

        parts = [p.strip() for p in text.split("|")]

        # Last part: "City, Province PostalCode"
        city = postal_code = None
        if parts:
            last = parts[-1]
            # Postal code is 6 chars like H4W3H1
            pc_match = re.search(r"[A-Z]\d[A-Z]\s?\d[A-Z]\d", last)
            if pc_match:
                postal_code = pc_match.group().replace(" ", "")

            # City is before the comma
            city_match = re.match(r"^([^,]+),", last)
            if city_match:
                city = city_match.group(1).strip()

        # Street address = first part
        street = parts[0] if parts else None
        full_address = f"{street}, {city}" if street and city else street

        return full_address, city, postal_code

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
