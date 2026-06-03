"""
Centris.ca scraper — Quebec's primary MLS platform.
Uses French URLs (/fr/) — English equivalents return 404.
Requires Scrapfly ASP + JS rendering (16 credits/page).

Card structure (confirmed from live HTML):
  div.property-thumbnail-item
    meta[itemprop="sku"]          ← MLS number
    meta[itemprop="name"]         ← full descriptive name (address + type + city)
    a.property-thumbnail-summary-link[href]  ← /fr/triplex~a-vendre~area/MLS
    div.price                     ← "874 900 $"
"""
import re
from pathlib import Path
from typing import Optional

from bs4 import BeautifulSoup, Tag

from app.scrapers.base import BaseScraper, RawProperty


# URL slug (French) → PropertyType enum value
PROPERTY_TYPE_MAP: dict[str, str] = {
    "plex":          "triplex",        # generic plex fallback
    "duplex":        "duplex",
    "triplex":       "triplex",
    "quadruplex":    "quadruplex",
    "quintuplex":    "quintuplex_plus",
    "condo":         "condo",
    "maison":        "single_family",
    "cottage":       "single_family",
    "townhouse":     "townhouse",
    "chalet":        "single_family",
}

# French search URLs (English /en/ returns 404 on Centris)
SEARCH_URLS: dict[str, str] = {
    "plex":  "https://www.centris.ca/fr/plex~a-vendre",
    "condo": "https://www.centris.ca/fr/condo~a-vendre",
    "house": "https://www.centris.ca/fr/maison~a-vendre",
}


class CentrisScraper(BaseScraper):
    SOURCE = "centris"
    BASE_URL = "https://www.centris.ca"

    # ── Public API ────────────────────────────────────────────────────────────

    async def scrape_listings(
        self,
        category: str = "plex",
        city: Optional[str] = None,
        page: int = 1,
    ) -> list[RawProperty]:
        """
        Fetch one page of search results (~20 properties).
        city examples: "montreal", "laval", "longueuil"
        """
        base = SEARCH_URLS.get(category, SEARCH_URLS["plex"])
        if city:
            base = f"{base}~{city.lower().replace(' ', '-')}"
        url = base if page == 1 else f"{base}?view=Thumbnail&uc={page}"

        result = await self.fetch(url, asp=True, render_js=True)

        if result.upstream_status_code != 200:
            self.logger.error(f"Search page returned {result.upstream_status_code}")
            return []

        return self._parse_search_page(result.content, page_url=url)

    async def scrape_detail(self, url: str) -> Optional[RawProperty]:
        """Fetch a single property detail page for full financial data."""
        result = await self.fetch(url, asp=True, render_js=True)
        if result.upstream_status_code != 200:
            self.logger.error(f"Detail page {result.upstream_status_code}: {url}")
            return None
        return self._parse_detail_page(result.content, source_url=url)

    async def probe(self, save_to: str = "centris_raw.html") -> str:
        """Save raw HTML to disk for parser development."""
        result = await self.fetch(SEARCH_URLS["plex"], asp=True, render_js=True)
        html = result.content
        Path(save_to).write_text(html, encoding="utf-8")
        self.logger.info(f"Saved {len(html):,} bytes → {save_to}")
        return html

    # ── Search page parser ────────────────────────────────────────────────────

    def _parse_search_page(self, html: str, page_url: str) -> list[RawProperty]:
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select(".property-thumbnail-item")
        self.logger.info(f"Found {len(cards)} cards on {page_url}")

        results: list[RawProperty] = []
        for card in cards:
            try:
                prop = self._parse_card(card)
                if prop:
                    results.append(prop)
            except Exception as exc:  # noqa: BLE001
                self.logger.warning(f"Skipped card: {exc}")
        return results

    def _parse_card(self, card: Tag) -> Optional[RawProperty]:
        # ── MLS number — from schema.org SKU meta tag ─────────────────────────
        sku_meta = card.select_one("meta[itemprop='sku']")
        mls_number = sku_meta["content"].strip() if sku_meta else None

        # ── Listing URL ───────────────────────────────────────────────────────
        link = card.select_one("a.property-thumbnail-summary-link")
        if not link:
            link = card.select_one("a[href*='a-vendre']")
        if not link:
            return None

        href: str = link.get("href", "")
        source_url = f"{self.BASE_URL}{href}" if href.startswith("/") else href

        # ── Property type from URL slug (/fr/triplex~a-vendre~...) ────────────
        type_match = re.search(r"/fr/([^~]+)~a-vendre", href)
        slug = type_match.group(1).lower() if type_match else "plex"
        property_type = PROPERTY_TYPE_MAP.get(slug, "triplex")

        # ── Address & city from schema.org name meta ──────────────────────────
        # Format: "Triplex à vendre à Montréal (Mercier/...), Montréal (Île), 3115 - 3119, Rue De Cadillac, MLS - Centris.ca"
        name_meta = card.select_one("meta[itemprop='name']")
        name_content = name_meta["content"] if name_meta else ""
        full_address, city, neighborhood = self._parse_name_meta(name_content)

        # ── Price ─────────────────────────────────────────────────────────────
        price_tag = card.select_one(".price") or card.select_one(".price-section")
        asking_price = self._parse_price(price_tag.get_text() if price_tag else "")

        # ── Photos ────────────────────────────────────────────────────────────
        photos = [
            img["src"] for img in card.select("img[src]")
            if img.get("src") and not img["src"].endswith(".svg")
            and img["src"].startswith("http")
        ]

        return RawProperty(
            source=self.SOURCE,
            source_url=source_url,
            source_listing_id=mls_number,
            mls_number=mls_number,
            full_address=full_address,
            city=city,
            neighborhood=neighborhood,
            property_type=property_type,
            asking_price=asking_price,
            photos=photos,
            raw_data={
                "href": href,
                "slug": slug,
                "name_meta": name_content,
            },
        )

    # ── Detail page parser ────────────────────────────────────────────────────

    def _parse_detail_page(self, html: str, source_url: str) -> Optional[RawProperty]:
        soup = BeautifulSoup(html, "html.parser")

        # MLS from URL
        mls_match = re.search(r"/(\d{7,9})(?:[/?]|$)", source_url)
        mls_number = mls_match.group(1) if mls_match else None

        # Property type
        type_match = re.search(r"/fr/([^~]+)~a-vendre", source_url)
        slug = type_match.group(1).lower() if type_match else "plex"
        property_type = PROPERTY_TYPE_MAP.get(slug, "triplex")

        # Price
        price_tag = soup.select_one(".price") or soup.select_one(".price-section")
        asking_price = self._parse_price(price_tag.get_text() if price_tag else "")

        # Address from page title or meta
        name_meta = soup.select_one("meta[itemprop='name']") or soup.select_one("meta[property='og:title']")
        name_content = name_meta.get("content", "") if name_meta else ""
        full_address, city, neighborhood = self._parse_name_meta(name_content)

        # Specs
        sqft      = self._extract_int_by_label(soup, ["pi²", "sq. ft", "sqft", "superficie"])
        year_built = self._extract_int_by_label(soup, ["année de construction", "year built", "construit en"])
        unit_count = self._extract_int_by_label(soup, ["logements", "unités", "units"])

        # Quebec taxes & income (present on most plex listings)
        muni_tax      = self._extract_money_by_label(soup, ["taxe municipal", "municipal tax", "taxes municipal"])
        school_tax    = self._extract_money_by_label(soup, ["taxe scolaire", "school tax"])
        rental_income = self._extract_money_by_label(soup, ["revenus locatifs", "revenu locatif", "rental income", "loyers"])

        # Description
        desc_tag = soup.select_one(".description") or soup.select_one("[class*='description']")
        description = desc_tag.get_text(separator="\n", strip=True) if desc_tag else None

        # Full-size photos from detail page
        photos = list({
            img.get("src") or img.get("data-src", "")
            for img in soup.select("img[src], img[data-src]")
            if (img.get("src") or img.get("data-src", "")).startswith("http")
            and not (img.get("src") or "").endswith(".svg")
        } - {""})

        return RawProperty(
            source=self.SOURCE,
            source_url=source_url,
            source_listing_id=mls_number,
            mls_number=mls_number,
            full_address=full_address,
            city=city,
            neighborhood=neighborhood,
            property_type=property_type,
            asking_price=asking_price,
            sqft_total=sqft,
            year_built=year_built,
            unit_count=unit_count,
            rental_income_monthly=rental_income,
            municipal_taxes_annual=muni_tax,
            school_taxes_annual=school_tax,
            description=description,
            photos=photos,
            raw_data={"source_url": source_url, "mls": mls_number},
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_name_meta(content: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Parse Centris schema.org name content into (full_address, city, neighborhood).
        Input: "Triplex à vendre à Montréal (Mercier/Hochelaga), Montréal (Île), 3115 - 3119, Rue Cadillac, 16288482 - Centris.ca"
        """
        if not content:
            return None, None, None

        # Strip trailing MLS and branding
        content = re.sub(r",?\s*\d{7,9}\s*-\s*Centris\.ca$", "", content, flags=re.IGNORECASE).strip()

        # City: specifically match "à vendre à CITY" — avoids capturing "vendre" from "à vendre"
        city_match = re.search(r"à vendre à\s+([A-ZÀ-Ÿ][^(,]+)", content)
        city = city_match.group(1).strip() if city_match else None

        # Neighborhood: first parenthesized value (e.g. "Mercier/Hochelaga-Maisonneuve")
        neighborhood_match = re.search(r"\(([^)]+)\)", content)
        neighborhood = neighborhood_match.group(1).strip() if neighborhood_match else None

        # Street address: find the numeric street-number segment, take it + the next segment
        parts = [p.strip() for p in content.split(",")]
        street_num_idx = None
        for i, part in enumerate(parts):
            # Street number looks like "3115" or "3115 - 3119" or "10650 - 10652"
            if re.match(r"^\d+[\s\-–]*\d*$", part.strip()):
                street_num_idx = i
                break

        if street_num_idx is not None and street_num_idx + 1 < len(parts):
            street_num  = parts[street_num_idx]
            street_name = parts[street_num_idx + 1]
            full_address = f"{street_num}, {street_name}, {city}" if city else f"{street_num}, {street_name}"
        else:
            full_address = None

        return full_address, city, neighborhood

    @staticmethod
    def _parse_price(text: str) -> Optional[float]:
        if not text:
            return None
        digits = re.sub(r"[^\d]", "", text)
        return float(digits) if digits else None

    @staticmethod
    def _extract_int_by_label(soup: BeautifulSoup, labels: list[str]) -> Optional[int]:
        for label in labels:
            for el in soup.find_all(string=re.compile(label, re.IGNORECASE)):
                nums = re.findall(r"\d[\d\s,]*", el.parent.get_text() if el.parent else "")
                if nums:
                    return int(re.sub(r"[^\d]", "", nums[0]))
        return None

    @staticmethod
    def _extract_money_by_label(soup: BeautifulSoup, labels: list[str]) -> Optional[float]:
        for label in labels:
            for el in soup.find_all(string=re.compile(label, re.IGNORECASE)):
                nums = re.findall(r"[\d\s,]+", el.parent.get_text() if el.parent else "")
                if nums:
                    val = re.sub(r"[^\d]", "", nums[0])
                    if val:
                        return float(val)
        return None
