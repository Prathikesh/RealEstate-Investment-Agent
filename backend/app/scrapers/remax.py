"""
ReMax Quebec scraper — remax-quebec.com (English)

remax.ca has ZERO Quebec listings (national DDF pool only has Ontario/BC).
The Quebec-specific portal is remax-quebec.com (Nuxt.js SSR, no client-side JS needed).

Strategy:
  1. Fetch sitemap_properties.xml once → every URL in it is already a Quebec
     listing (all cities, all property types — the portal itself is Quebec-only)
  2. Scrape individual listing pages (no JS rendering — Nuxt SSR delivers full HTML)
  3. Parse data from JSON-LD RealEstateListing + presentation section + features section

Credits: ~1 per listing page (no JS), ~1 for sitemap.
"""
import json
import logging
import re
from typing import Optional

from bs4 import BeautifulSoup

from app.scrapers.base import BaseScraper, RawProperty


logger = logging.getLogger(__name__)

BASE_URL = "https://www.remax-quebec.com"
SITEMAP_URL = "https://www.remax-quebec.com/sitemap_properties.xml"


def hi_res_photo(url: str) -> str:
    """remax-quebec.com serves images under a size folder in the URL path
    (e.g. /img/www_medium/… ~180KB, soft). Rewrite to www_full — the largest
    variant (~850KB, true HD) which keeps the original aspect ratio (no cropping).
    Non-media URLs are returned unchanged.
    """
    if not url or "media.remax-quebec.com" not in url:
        return url
    return re.sub(r"/img/www_[a-z]+/", "/img/www_full/", url)

PROPERTY_TYPE_MAP: dict[str, str] = {
    "duplex":           "duplex",
    "triplex":          "triplex",
    "quadruplex":       "quadruplex",
    "multiplex":        "triplex",
    "multi-logement":   "triplex",
    "multilogement":    "triplex",
    "revenue":          "triplex",
    "revenu":           "triplex",
    "plex":             "triplex",
    "single family":    "single_family",
    "single-family":    "single_family",
    "detached":         "single_family",
    "house":            "single_family",
    "condo":            "condo",
    "condominium":      "condo",
    "apartment":        "condo",
    "townhouse":        "townhouse",
    "row house":        "townhouse",
}


class RemaxScraper(BaseScraper):
    SOURCE = "remax"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sitemap_urls: list[str] = []

    # ── Public API ────────────────────────────────────────────────────────────

    async def scrape_listings(
        self,
        page: int = 1,
        page_size: int = 10,
        known_source_urls: Optional[set] = None,
    ) -> list[RawProperty]:
        """
        Fetch one page of Quebec listings (all cities, all property types) from
        remax-quebec.com. Property type is determined per-listing from the
        actual page content, not filtered ahead of time.

        Loads the sitemap once, then scrapes individual listing pages in batches.

        known_source_urls: if provided (on the first call, when the sitemap is
        loaded), URLs already in this set are dropped from the walk — so we only
        pay to fetch listings we've never scraped from ReMax before. The sitemap
        itself is ~1 credit and lists every current Quebec listing, so diffing it
        against what's already in the DB is a complete, cheap "only new" filter —
        no sort/ordering assumptions needed, unlike the paginated sources.
        """
        if not self._sitemap_urls:
            await self._load_sitemap(known_source_urls=known_source_urls)

        if not self._sitemap_urls:
            self.logger.info("[remax] No new listings to scrape (sitemap empty or all already known)")
            return []

        start = (page - 1) * page_size
        end = start + page_size
        batch_urls = self._sitemap_urls[start:end]

        if not batch_urls:
            self.logger.info(f"[remax] Page {page} is out of range ({len(self._sitemap_urls)} total URLs)")
            return []

        self.logger.info(f"[remax] Scraping page {page}: {len(batch_urls)} listings (URLs {start+1}–{end})")

        results: list[RawProperty] = []
        for url in batch_urls:
            try:
                prop = await self.scrape_detail(url)
                if prop:
                    results.append(prop)
            except Exception as exc:
                self.logger.warning(f"[remax] Failed to scrape {url}: {exc}")

        return results

    async def scrape_detail(self, url: str) -> Optional[RawProperty]:
        """Fetch and parse a single remax-quebec.com listing page."""
        result = await self.fetch(url, asp=True, render_js=False)
        status = result.upstream_status_code
        body   = result.content or ""
        # Accept 200 or None-status if we got HTML content (Scrapfly may not forward status)
        if status not in (200, None) or len(body) < 500:
            self.logger.warning(f"[remax] HTTP {status} / len={len(body)} on {url}")
            return None
        return self._parse_qc_page(body, url)

    # ── Sitemap loading ───────────────────────────────────────────────────────

    async def _load_sitemap(self, known_source_urls: Optional[set] = None) -> None:
        """Fetch sitemap_properties.xml → the full list of current Quebec listing
        URLs. If known_source_urls is given, drop URLs we've already scraped so
        the walk only fetches genuinely-new listings."""
        content = ""

        # Try multiple strategies — sitemap is XML so no JS needed, but ASP helps bypass blocks
        for asp in (False, True):
            try:
                result = await self.fetch(SITEMAP_URL, asp=asp, render_js=False)
                status = result.upstream_status_code
                body   = result.content or ""
                self.logger.info(f"[remax] Sitemap attempt asp={asp} → HTTP {status} len={len(body)}")
                # Accept 200 or None-status if we got substantial XML content
                if body and len(body) > 500 and ("<loc>" in body or "remax-quebec.com" in body):
                    content = body
                    break
            except Exception as exc:
                self.logger.warning(f"[remax] Sitemap attempt asp={asp} failed: {exc}")

        if not content:
            self.logger.error("[remax] Sitemap could not be loaded — skipping ReMax")
            return

        # Get English-language property URLs (hreflang="en")
        all_urls = re.findall(
            r'<xhtml:link rel="alternate" hreflang="en" href="'
            r'(https://www\.remax-quebec\.com/en/properties/[^"]+)"',
            content,
        )
        # Fallback: <loc> tags if hreflang not present
        if not all_urls:
            all_urls = re.findall(
                r'<loc>(https://www\.remax-quebec\.com/en/properties/[^<]+)</loc>',
                content,
            )

        # remax-quebec.com is already Quebec-only (that's the whole point of using
        # this portal instead of remax.ca), so no further city/type filtering is
        # needed — every URL in the sitemap is a Quebec listing. Property type is
        # determined per-listing in _parse_presentation() from the actual page.
        if known_source_urls:
            new_urls = [u for u in all_urls if u not in known_source_urls]
            self.logger.info(
                f"[remax] Sitemap loaded: {len(all_urls)} listings → "
                f"{len(new_urls)} new after diff against {len(known_source_urls)} known"
            )
            self._sitemap_urls = new_urls
        else:
            self._sitemap_urls = all_urls
            self.logger.info(f"[remax] Sitemap loaded: {len(all_urls)} Quebec listings")

    # ── Parser ────────────────────────────────────────────────────────────────

    def _parse_qc_page(self, html: str, url: str) -> Optional[RawProperty]:
        """
        Parse a remax-quebec.com listing page.

        Primary data source: JSON-LD RealEstateListing block
        Secondary: .presentation-section (property type, address, ULS)
        Tertiary:  "Property features" section (bedrooms, bathrooms)
        """
        soup = BeautifulSoup(html, "html.parser")

        # ── 1. JSON-LD RealEstateListing ──────────────────────────────────────
        ld_data = self._extract_ld_listing(soup)

        # ── 2. Price ──────────────────────────────────────────────────────────
        asking_price: Optional[float] = None
        if ld_data:
            raw_price = (ld_data.get("offers") or {}).get("price")
            if raw_price is not None:
                try:
                    asking_price = float(raw_price)
                except (ValueError, TypeError):
                    pass

        if not asking_price:
            # Fallback: parse price from presentation section text
            price_el = soup.select_one(".presentation-section__price") or soup.select_one("[class*='price']")
            if price_el:
                asking_price = self._parse_price(price_el.get_text())

        # ── 3. Listing ID (ULS) ───────────────────────────────────────────────
        listing_id = self._extract_uls(url, soup)

        # ── 4. Property type & address from presentation section ───────────────
        property_type, full_address, city = self._parse_presentation(soup, url)

        # ── 5. Bedrooms & bathrooms ───────────────────────────────────────────
        bedrooms, bathrooms = self._parse_features(soup)

        # ── 6. Year built ──────────────────────────────────────────────────────
        year_built = self._parse_year_built(soup)

        # ── 7. Images ─────────────────────────────────────────────────────────
        photos: list[str] = []
        if ld_data:
            for img in ld_data.get("image") or []:
                if isinstance(img, dict):
                    src = img.get("url") or img.get("contentUrl") or ""
                elif isinstance(img, str):
                    src = img
                else:
                    continue
                if src.startswith("http"):
                    photos.append(hi_res_photo(src))

        # ── 8. Agent info ─────────────────────────────────────────────────────
        agent_name, agent_phone, agent_email, agency_name = self._parse_agent(ld_data)

        # Skip if essential data is missing
        if not asking_price and not full_address:
            self.logger.debug(f"[remax] Skipping page — no price or address: {url}")
            return None

        return RawProperty(
            source=self.SOURCE,
            source_url=url,
            source_listing_id=listing_id,
            mls_number=listing_id,
            full_address=full_address,
            city=city,
            property_type=property_type,
            asking_price=asking_price,
            bedrooms_total=bedrooms,
            bathrooms_total=bathrooms,
            year_built=year_built,
            photos=photos,
            agent_name=agent_name,
            agent_phone=agent_phone,
            agent_email=agent_email,
            agency_name=agency_name,
            raw_data={
                "source_url": url,
                "mls": listing_id,
                "lat": None,
                "lng": None,
            },
        )

    def _extract_ld_listing(self, soup: BeautifulSoup) -> Optional[dict]:
        """Find the RealEstateListing JSON-LD block."""
        for sc in soup.find_all("script", type="application/ld+json"):
            t = sc.string or ""
            if not t:
                continue
            try:
                data = json.loads(t)
            except (json.JSONDecodeError, ValueError):
                continue
            # Can be a single object or a list
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "RealEstateListing":
                        return item
            elif isinstance(data, dict) and data.get("@type") == "RealEstateListing":
                return data
        return None

    def _extract_uls(self, url: str, soup: BeautifulSoup) -> Optional[str]:
        """Extract ULS (listing ID) from URL slug or page text."""
        # URL always ends with the listing ID: /en/properties/...-9839850
        m = re.search(r'-(\d{7,10})$', url.rstrip('/'))
        if m:
            return m.group(1)
        # Fallback: presentation section has "ULS: 9839850"
        pres = soup.select_one(".presentation-section")
        if pres:
            m2 = re.search(r'ULS[:\s]+(\d+)', pres.get_text())
            if m2:
                return m2.group(1)
        return None

    def _parse_presentation(self, soup: BeautifulSoup, url: str) -> tuple[str, Optional[str], Optional[str]]:
        """
        Parse property type, address, and city from the presentation section.
        Section text example: "$849,900 +GST/QST|ULS: 9839850|Triplex|for sale|
                               7546 - 7550 Rue Centrale, Montréal (LaSalle)"
        """
        pres = soup.select_one(".presentation-section")
        pres_text = pres.get_text(separator="|", strip=True) if pres else ""

        # Property type from presentation text or URL
        property_type = "triplex"  # default for Montreal multi-family sitemap
        for raw_type, mapped in PROPERTY_TYPE_MAP.items():
            if raw_type in pres_text.lower() or raw_type in url.lower():
                property_type = mapped
                break

        # Try H1 for address: "Triplex for sale 7546 - 7550 Rue Centrale, Montréal (LaSalle)"
        h1 = soup.find("h1")
        h1_text = h1.get_text(strip=True) if h1 else ""

        # Address is the part after "for sale" in H1
        addr_match = re.search(r'(?:for sale|à vendre)\s*(.+)', h1_text, re.IGNORECASE)
        if addr_match:
            full_address: Optional[str] = addr_match.group(1).strip()
        elif pres:
            # Presentation section: find the address segment (contains numbers and commas)
            for segment in pres_text.split("|"):
                seg = segment.strip()
                if re.search(r'\d+', seg) and ("," in seg or "rue" in seg.lower() or "boul" in seg.lower() or "av." in seg.lower()):
                    if not seg.startswith("$") and "ULS" not in seg:
                        full_address = seg
                        break
            else:
                full_address = None
        else:
            full_address = None

        # Extract city from address: "7546 - 7550 Rue Centrale, Montréal (LaSalle)"
        city: Optional[str] = None
        if full_address:
            city_match = re.search(r',\s*([^,]+?)(?:\s*\([^)]+\))?$', full_address)
            if city_match:
                city = city_match.group(1).strip()
            elif "montreal" in (full_address or "").lower() or "montréal" in (full_address or "").lower():
                city = "Montréal"

        if not city and "montreal" in url.lower():
            city = "Montréal"

        return property_type, full_address, city

    def _parse_features(self, soup: BeautifulSoup) -> tuple[Optional[int], Optional[float]]:
        """
        Parse bedrooms and bathrooms from "Property features" section.
        Section text: "Property features|2|Bedrooms|1|Bathroom"
        """
        for h2 in soup.find_all("h2"):
            if "feature" in h2.get_text().lower():
                parent = h2.parent
                text = parent.get_text(separator="|", strip=True)
                # Pattern: number followed by "Bedrooms" or "Bedroom"
                bed_m = re.search(r'(\d+)\|Bedroom', text)
                bath_m = re.search(r'(\d+(?:\.\d+)?)\|Bathroom', text)
                bedrooms = self._to_int(bed_m.group(1)) if bed_m else None
                bathrooms = self._to_float(bath_m.group(1)) if bath_m else None
                return bedrooms, bathrooms
        return None, None

    def _parse_year_built(self, soup: BeautifulSoup) -> Optional[int]:
        """
        Extract year of construction.
        The characteristics section has text: "Year constructed|1967|Siding"
        """
        full_text = soup.get_text(separator="|", strip=True)
        m = re.search(r'(?:Year constructed|Année de construction)\|(\d{4})', full_text, re.IGNORECASE)
        if m:
            return self._to_int(m.group(1))
        return None

    def _parse_agent(self, ld_data: Optional[dict]) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        """Extract agent info from RealEstateListing JSON-LD reviewedBy array."""
        if not ld_data:
            return None, None, None, None

        reviewed_by = ld_data.get("reviewedBy") or []
        if isinstance(reviewed_by, dict):
            reviewed_by = [reviewed_by]

        agent_name = agent_phone = agent_email = agency_name = None
        if reviewed_by and isinstance(reviewed_by[0], dict):
            agent = reviewed_by[0]
            agent_name = agent.get("name")
            agent_phone = agent.get("telephone")
            agent_email = agent.get("email")
            org = agent.get("parentOrganization") or {}
            if isinstance(org, dict):
                agency_name = org.get("name")

        return agent_name, agent_phone, agent_email, agency_name

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_price(text: str) -> Optional[float]:
        if not text:
            return None
        digits = re.sub(r"[^\d]", "", text.split("+")[0].split("*")[0])
        val = float(digits) if digits else None
        if val and (val < 50_000 or val > 50_000_000):
            return None
        return val

    @staticmethod
    def _to_int(val) -> Optional[int]:
        if val is None:
            return None
        try:
            return int(str(val).strip())
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_float(val) -> Optional[float]:
        if val is None:
            return None
        try:
            return float(str(val).strip())
        except (ValueError, TypeError):
            return None
