"""
Centris.ca scraper — Quebec's primary MLS platform.
Uses French URLs (/fr/) — English equivalents return 404.

Session strategy:
  - Search pages use ASP+JS + Scrapfly session to establish cookies.
  - Detail pages first try cheap (session-only, no ASP/JS).
  - If cheap fails, fall back to full ASP+JS with same session.
  - This saves ~75 credits per detail page when cheap works.

Card structure (confirmed from live HTML):
  div.property-thumbnail-item
    meta[itemprop="sku"]          ← MLS number
    meta[itemprop="name"]         ← full descriptive name (address + type + city)
    a.property-thumbnail-summary-link[href]  ← /fr/triplex~a-vendre~area/MLS
    div.price                     ← "874 900 $"

Detail page key patterns:
  .carac-container > .carac-title + .carac-value   ← most specs
  table rows in #divRevenuDepense                   ← income/expense financials
  script[type="application/ld+json"]               ← coordinates (GeoCoordinates)
"""
import asyncio
import json as _json
import re
import uuid
from pathlib import Path
from typing import Optional

from bs4 import BeautifulSoup, Tag
from scrapfly import ScrapeConfig

from app.scrapers.base import BaseScraper, RawProperty, SCRAPFLY_CALL_TIMEOUT


def hi_res_photo(url: str) -> str:
    """Centris serves images through media.ashx with the size baked into the URL
    (thumbnails come at w=320&h=240 — blurry). Rewrite to full HD so we store
    sharp photos. Non-Centris/media URLs are returned unchanged.

    NB: media.ashx only serves a fixed set of preset sizes — 320x240, 640x480
    and 1024x1024 return real images; any other size (800x600, 1024x768…) returns
    an EMPTY body. We use 1024x1024 — the largest Centris offers (~300KB, true
    HD). It's square rather than 4:3, but the UI displays photos with
    object-cover so the square source fills each container cleanly with no
    distortion.
    """
    if not url or "media.ashx" not in url:
        return url
    url = re.sub(r"([?&]w=)\d+", r"\g<1>1024", url)
    url = re.sub(r"([?&]h=)\d+", r"\g<1>1024", url)
    return url


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

    # Scrapfly session name — shared across search + detail pages so cookies persist.
    # This allows detail pages to pass Centris's session-validation checks.
    _SESSION = "centris-session"

    # ── Public API ────────────────────────────────────────────────────────────

    async def _set_sort_newest(self, session_id: Optional[str] = None) -> None:
        """
        Ask Centris to sort search results newest-first (by publication date,
        descending) for this session.

        Centris randomizes its DEFAULT result order per request (note the
        `sortSeed` param on default search URLs) — an anti-scraping measure that
        scatters newly-listed properties across every page, forcing a full
        re-scan each cycle to be sure of catching them. Setting the sort to
        "DateDesc" clusters new listings toward the front instead, so the
        scheduler can stop paginating soon after it starts hitting listings it
        already has.

        Mechanism: a JSON POST to /property/UpdateSort with sort=3
        ("Publication récente"), which sets session state honoured by
        subsequent search-page fetches on the same Scrapfly session.

        Best-effort: ordering still jitters somewhat through Scrapfly's rotating
        proxies, so this is "mostly" newest-first, not guaranteed. Callers keep
        a page-scan margin rather than trusting page 1 to be exhaustively newest.
        """
        try:
            config = ScrapeConfig(
                url=f"{self.BASE_URL}/property/UpdateSort",
                method="POST",
                data={"sort": 3, "mode": "Result"},
                headers={"Content-Type": "application/json"},
                asp=True, country="ca", session=session_id or self._SESSION,
            )
            result = await asyncio.wait_for(self.client.async_scrape(config), timeout=SCRAPFLY_CALL_TIMEOUT)
            self.logger.info(f"[centris] sort→newest: {(result.content or '')[:80]}")
        except Exception as exc:
            self.logger.warning(f"[centris] could not set newest-first sort: {exc}")

    async def scrape_listings(
        self,
        category: str = "plex",
        city: Optional[str] = None,
        page: int = 1,
        session_id: Optional[str] = None,
    ) -> list[RawProperty]:
        """
        Fetch one page of search results (~20 properties).
        Uses a named Scrapfly session so cookies are available for detail pages.
        city examples: "montreal", "laval", "longueuil"

        On page 1 we (re)assert newest-first sort for the session so new
        listings cluster toward the front — see _set_sort_newest().

        session_id overrides the shared self._SESSION (used by the main
        scrape_job's long multi-page walk) — required for any caller that
        might run concurrently with other scrape_listings calls, since
        Scrapfly rejects concurrent access to the same named session with a
        429 (confirmed live: CentrisScraper.search_by_address() collided
        with itself across concurrent verification-pipeline properties
        before this param existed). Sort order doesn't matter for a bounded
        address search, so callers passing session_id can skip needing it
        set at all — only the main scrape_job cares about newest-first.
        """
        base = SEARCH_URLS.get(category, SEARCH_URLS["plex"])
        if city:
            base = f"{base}~{city.lower().replace(' ', '-')}"
        url = base if page == 1 else f"{base}?view=Thumbnail&uc={page}"

        effective_session = session_id or self._SESSION
        if page == 1 and session_id is None:
            await self._set_sort_newest()

        config = ScrapeConfig(
            url=url, asp=True, render_js=True, country="ca",
            session=effective_session,
        )
        result = await asyncio.wait_for(self.client.async_scrape(config), timeout=SCRAPFLY_CALL_TIMEOUT)
        cost = result.context.get("cost", {})
        self.logger.info(
            f"[centris] {result.upstream_status_code} "
            f"| credits={cost.get('total', '?')} | {url[-70:]}"
        )

        if result.upstream_status_code != 200:
            self.logger.error(f"Search page returned {result.upstream_status_code}")
            return []

        return self._parse_search_page(result.content, page_url=url)

    async def scrape_detail(self, url: str) -> Optional[RawProperty]:
        """
        Fetch a single property detail page.

        Always uses full ASP+JS rendering (~45 credits) with a JS scenario:
        the page embeds Centris's own transfer-tax calculator, but #taxe stays
        at "0,00 $" until the "Calculer" button is actually clicked — a passive
        rendering_wait alone never triggers it (confirmed by inspection: both
        #propriete and #evalMunicipale are server-rendered with the correct
        values already, only the click computes #taxe).

        Uses a fresh, one-off session per call rather than the shared
        self._SESSION used for search-page scraping: a session that has
        already loaded this (or another) Centris page stops re-rendering the
        calculator widget on subsequent loads — confirmed by testing, and the
        likely reason this never worked at all before, independent of the
        click. Detail fetches are one-shot lookups, so they don't need
        continuity with the multi-page search session.

        Not every listing has the calculator — Centris only renders it when
        it has municipal assessment data for that property (confirmed: some
        listings' pages have no #CalculTaxe div at all). ignore_if_not_visible
        makes the click a no-op in that case rather than failing the whole
        detail scrape (and losing sqft/rent/tax data along with it).

        wait_for_selector on .carac-container: confirmed live (verification
        pipeline investigation) that the "Taxes municipales (2026)" row in
        this section renders measurably later than its sibling "Taxes
        scolaires (2025)" row — a fixed rendering_wait alone caught school
        tax ~98% of the time but municipal tax only ~10% of the time on the
        exact same page, across ~9,800 properties. Gating the wait on this
        selector (rather than just a flat timer starting from page-load)
        shifts the whole countdown window later, giving slow-to-populate
        rows like this one enough margin to actually appear before capture.
        """
        # The post-click wait is a race against Scrapfly's rendering, not a
        # fixed cost — confirmed live (verification pipeline testing) that
        # 1500ms alone leaves welcome_tax null on a real minority of fetches
        # of the exact same page that succeed on a later attempt. Bumped
        # from 2 to 3 attempts after live testing at scale showed a
        # meaningful share of properties still needed a third try — the
        # first two attempts are far more common failures than a genuine
        # "no calculator on this page" case.
        for attempt, post_click_wait in enumerate((1500, 3000, 5000), start=1):
            try:
                full = ScrapeConfig(
                    url=url, asp=True, render_js=True, country="ca",
                    session=f"centris-detail-{uuid.uuid4().hex[:8]}",
                    wait_for_selector=".carac-container",
                    rendering_wait=4000,
                    js_scenario=[
                        {"click": {"selector": "#Calcul_btTotalMutation", "ignore_if_not_visible": True}},
                        {"wait": post_click_wait},
                    ],
                )
                result = await asyncio.wait_for(self.client.async_scrape(full), timeout=SCRAPFLY_CALL_TIMEOUT)
                cost = result.context.get("cost", {}).get("total", 0)
                final_url = result.context.get("url", "") or ""
                self.logger.info(
                    f"[centris] detail-full (attempt {attempt}): {result.upstream_status_code} "
                    f"| credits={cost} | {url[-55:]}"
                )

                # Centris redirects to "...?listingnotfound=<mls>" when a listing has
                # been sold/removed since we last scraped it — the resulting page has
                # no real listing content (no price, no calculator, nothing to parse).
                # Signal this back rather than returning None, so the caller can mark
                # the existing property delisted instead of silently retrying forever.
                if "listingnotfound=" in final_url:
                    mls = url.rstrip("/").rsplit("/", 1)[-1]
                    self.logger.info(f"[centris] listing delisted: {mls}")
                    return RawProperty(
                        source=self.SOURCE, source_url=url, mls_number=mls, is_delisted=True,
                    )

                if result.upstream_status_code == 200:
                    prop = self._parse_detail_page(result.content, source_url=url)
                    if prop and (prop.welcome_tax or "#Calcul_btTotalMutation" not in result.content):
                        # Got a real value, or the calculator genuinely isn't on
                        # this page at all — either way, no retry needed.
                        if prop:
                            await self._geocode_prop(prop)
                        return prop
                    if prop and attempt < 3:
                        self.logger.info(f"[centris] welcome_tax still null after attempt {attempt}, retrying with longer wait: {url[-55:]}")
                        continue
                    if prop:
                        await self._geocode_prop(prop)
                    return prop
            except Exception as exc:
                self.logger.error(f"Full detail failed (attempt {attempt}): {url} — {exc}")

        # Both full-render attempts failed outright (not just a parse issue —
        # an exception, most often ERR::SCRAPE::DOM_SELECTOR_NOT_FOUND). That
        # error fires when .carac-container never appears, which is exactly
        # what happens on Centris's "listingnotfound=" redirect page for a
        # delisted/sold property — wait_for_selector throws before we ever
        # get a response to inspect. Without render_js's page requirements,
        # a cheap plain fetch can still see the final redirect URL, so check
        # for that specifically before giving up — otherwise every delisted
        # listing (common in an old backlog) gets misreported as a fetch
        # failure instead of being cleanly marked delisted.
        try:
            cheap = ScrapeConfig(url=url, asp=True, country="ca")
            result = await asyncio.wait_for(self.client.async_scrape(cheap), timeout=SCRAPFLY_CALL_TIMEOUT)
            final_url = result.context.get("url", "") or ""
            if "listingnotfound=" in final_url:
                mls = url.rstrip("/").rsplit("/", 1)[-1]
                self.logger.info(f"[centris] listing delisted (confirmed via cheap fallback): {mls}")
                return RawProperty(
                    source=self.SOURCE, source_url=url, mls_number=mls, is_delisted=True,
                )
        except Exception as exc:
            self.logger.error(f"Delisted-check fallback also failed: {url} — {exc}")

        return None

    async def search_by_address(
        self, full_address: str, city: Optional[str], property_type: Optional[str] = None,
        max_pages: int = 3,
    ) -> Optional[RawProperty]:
        """
        Best-effort search for a property on Centris by address, for
        properties scraped from a source with no built-in transfer-tax
        calculator (Realtor) — used by the verification pipeline to still get
        an authoritative welcome-tax figure by cross-checking Centris when the
        same property is listed there too, even though it isn't our primary
        source for it.

        Centris has no public address-search API to call directly (confirmed
        by testing — no autocomplete/search endpoint responds), so this reuses
        the same category+city listing walk the general scraper already uses
        and matches on the normalized civic+street key (same helper used to
        match scraped listings to the assessment roll). Bounded to
        `max_pages` per category to keep cost predictable — this is a
        best-effort cross-check, not an exhaustive search, so a miss here
        just means "not found on Centris," not "verification failed."
        """
        import unicodedata
        from app.services.quebec_address import full_address_match_key

        target_key = full_address_match_key(full_address)
        if not target_key or not city:
            return None

        # Centris city slugs are unaccented, lowercase, hyphenated, and use
        # only the base city (a borough like "Montréal (Saint-Laurent)"
        # becomes "montreal" here, not "montreal-saint-laurent") — scoping to
        # the base city still narrows the search far more than city=None
        # (province-wide) without needing Centris's exact borough-slug list.
        base_city = city.split("(")[0].strip()
        normalized = unicodedata.normalize("NFKD", base_city).encode("ascii", "ignore").decode()
        city_slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")

        # A dedicated per-call session, not self._SESSION — search_by_address
        # can run concurrently (multiple properties verified in parallel),
        # and Scrapfly 429s on any concurrent access to the same named
        # session. Still shared across this one call's own pages/categories
        # so cookies persist within a single search.
        search_session = f"centris-search-{uuid.uuid4().hex[:8]}"

        categories = [property_type] if property_type in ("condo", "house") else ["plex", "condo", "house"]
        for category in categories:
            for page in range(1, max_pages + 1):
                try:
                    candidates = await self.scrape_listings(
                        category=category, city=city_slug, page=page, session_id=search_session,
                    )
                except Exception as exc:
                    self.logger.warning(f"[centris] address search failed ({category} p{page}): {exc}")
                    break
                if not candidates:
                    break
                for cand in candidates:
                    if cand.full_address and full_address_match_key(cand.full_address) == target_key:
                        self.logger.info(f"[centris] address search matched: {cand.full_address} -> {cand.source_url}")
                        return cand
        return None

    async def scrape_photos(self, url: str) -> list[str]:
        """
        Fetch only the photo gallery for a listing — skips the tax-calculator
        click/wait that scrape_detail() needs, since we don't touch price/tax/
        income here. Used to backfill photos on properties scraped before
        hi_res_photo() existed, without re-running the full (slower) detail
        parse or touching any other field.
        """
        try:
            config = ScrapeConfig(
                url=url, asp=True, render_js=True, country="ca",
                session=f"centris-photos-{uuid.uuid4().hex[:8]}",
                rendering_wait=1500,
            )
            result = await asyncio.wait_for(self.client.async_scrape(config), timeout=SCRAPFLY_CALL_TIMEOUT)
            cost = result.context.get("cost", {}).get("total", 0)
            self.logger.info(
                f"[centris] photos: {result.upstream_status_code} "
                f"| credits={cost} | {url[-55:]}"
            )
            if result.upstream_status_code != 200:
                return []
            soup = BeautifulSoup(result.content, "html.parser")
            return self._extract_photos(soup)
        except Exception as exc:
            self.logger.error(f"Photo fetch failed: {url} — {exc}")
            return []

    async def _geocode_prop(self, prop: RawProperty) -> None:
        """Populate raw_data['lat'/'lng'] via geocoder if not already extracted from page."""
        if prop.raw_data.get("lat"):
            return
        try:
            from app.scrapers.geocoder import geocode
            coords = await geocode(prop.full_address, prop.city)
            if coords:
                prop.raw_data["lat"], prop.raw_data["lng"] = coords
                self.logger.debug(
                    f"Geocoded {prop.full_address} → {coords}"
                )
        except Exception as exc:
            self.logger.warning(f"Geocoding failed for {prop.full_address}: {exc}")

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
        name_meta = card.select_one("meta[itemprop='name']")
        name_content = name_meta["content"] if name_meta else ""
        full_address, city, neighborhood, _, _ = self._parse_name_meta(name_content)

        # ── Price ─────────────────────────────────────────────────────────────
        price_tag = card.select_one(".price") or card.select_one(".price-section")
        asking_price = self._parse_price(price_tag.get_text() if price_tag else "")

        # ── Photos ────────────────────────────────────────────────────────────
        photos = [
            hi_res_photo(img["src"]) for img in card.select("img[src]")
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

        # Property type from URL slug
        type_match = re.search(r"/fr/([^~]+)~a-vendre", source_url)
        slug = type_match.group(1).lower() if type_match else "plex"
        property_type = PROPERTY_TYPE_MAP.get(slug, "triplex")

        # ── Build comprehensive key-value dict from the whole page ────────────
        carac = self._build_carac_dict(soup)

        # ── Coordinates from JSON-LD / data attributes ────────────────────────
        lat, lng = self._extract_coordinates(soup)

        # ── Price ─────────────────────────────────────────────────────────────
        # meta[itemprop='price'] is the current site's reliable numeric source
        # (plain digits, no formatting to strip) — the old class selectors
        # below (.price/.price-section/[class*='asking-price']) no longer
        # match anything on the current page and are kept only as a last-ditch
        # fallback in case the meta tag is ever missing.
        price_meta = soup.select_one("meta[itemprop='price']")
        if price_meta and price_meta.get("content"):
            asking_price = self._parse_price(price_meta["content"])
        else:
            price_tag = (
                soup.select_one(".property-summary-header__price-value") or
                soup.select_one(".price") or
                soup.select_one(".price-section") or
                soup.select_one("[class*='asking-price']")
            )
            asking_price = self._parse_price(price_tag.get_text() if price_tag else "")

        # ── Address ───────────────────────────────────────────────────────────
        name_meta = (
            soup.select_one("meta[itemprop='name']") or
            soup.select_one("meta[property='og:title']")
        )
        name_content = name_meta.get("content", "") if name_meta else ""
        full_address, city, neighborhood, street_number, street_name = self._parse_name_meta(name_content)

        # Postal code — look in address elements or structured data
        postal_code = self._extract_postal_code(soup)

        # ── Physical specs ────────────────────────────────────────────────────
        # Unit count — "nombre d'unités" = "Résidentiel (2)" or "Résidentiel (2), Commercial (1)"
        unit_raw = (
            carac.get("nombre d'unités") or carac.get("nombre d'unites") or
            carac.get("logements") or carac.get("unités") or ""
        )
        unit_count = self._parse_unit_count(unit_raw)

        # Fallback: derive unit count from URL slug (duplex→2, triplex→3, etc.)
        if not unit_count:
            unit_count = {"duplex": 2, "triplex": 3, "quadruplex": 4, "quintuplex": 5}.get(slug)

        # sqft — "superficie habitable" in pc (pieds carrés = sqft, no conversion)
        sqft = (
            self._extract_microdata_int(soup, "floorSize", "floorspace") or
            self._lookup_sqft(carac,
                "superficie habitable", "superficie du bâtiment",
                "superficie", "pi²", "sq. ft", "living area")
        )

        lot_sqft = self._lookup_sqft(carac,
            "superficie du terrain", "lot", "land size", "superficie totale du terrain")

        year_built = self._lookup_int(carac,
            "année de construction", "year built", "construit en", "construction")

        floors = self._lookup_int(carac,
            "étage", "niveaux", "floors", "niveau", "nombre d'étages", "nombre d'etages")

        parking = self._lookup_int(carac,
            "stationnement total", "stationnement", "parking", "garage")

        # Bedrooms/bathrooms — check schema.org microdata first (most reliable
        # on plex pages, via the "Unité principale" carac row), then the
        # dedicated .cac/.sdb summary tags condo/house pages use instead
        # (e.g. "1 chambre" / "1 salle de bain", no "Unité principale" row
        # exists on those page types at all).
        cac_tag = soup.select_one(".cac")
        sdb_tag = soup.select_one(".sdb")
        bedrooms  = self._extract_microdata_int(soup, "numberOfBedrooms", "numberOfRooms") or \
                    self._parse_bedrooms(
                        carac.get("unité principale") or carac.get("unite principale") or
                        carac.get("chambre", "") or carac.get("chambres", "") or ""
                    ) or \
                    self._parse_bedrooms(cac_tag.get_text() if cac_tag else "") or \
                    self._lookup_int(carac, "chambres", "chambre", "bedrooms", "bedroom")
        bathrooms = self._extract_microdata_float(soup, "numberOfBathroomsTotal", "numberOfBathrooms") or \
                    self._parse_bathrooms(
                        carac.get("unité principale") or carac.get("unite principale") or
                        carac.get("salle de bain", "") or ""
                    ) or \
                    self._parse_bathrooms(sdb_tag.get_text() if sdb_tag else "") or \
                    self._lookup_int(carac, "salles de bain", "salle de bain", "bathrooms", "bathroom")

        # ── Financial fields ──────────────────────────────────────────────────
        # Annual rental income — Centris labels it "revenus bruts potentiels"
        rental_annual = self._lookup_money(carac,
            "revenus bruts potentiels", "revenus locatifs", "revenu locatif",
            "revenus bruts", "rental income", "loyers")
        rental_income = round(rental_annual / 12, 2) if rental_annual else None

        # Monthly rental fallback
        if not rental_income:
            rental_income = self._lookup_money(carac,
                "loyer mensuel", "monthly rent", "revenu mensuel")

        # Taxes — Centris labels them "municipales (2026)" and "scolaires (2025)"
        # Use partial key match: "municipales" matches "municipales (2026)" etc.
        municipal_tax = self._lookup_money(carac, "municipales")
        school_tax    = self._lookup_money(carac, "scolaires")
        condo_fees    = self._lookup_money(carac,
            "frais de condo", "condo fee", "frais mensuels", "charges mensuelles")

        # Évaluation foncière = land value ("terrain") + building value ("bâtiment")
        # Centris shows these separately — total assessed value = sum of both
        terrain  = self._lookup_money(carac, "terrain")
        batiment = self._lookup_money(carac, "bâtiment", "batiment")
        evaluation = None
        if terrain and batiment:
            evaluation = terrain + batiment
        elif terrain or batiment:
            evaluation = terrain or batiment

        # Insurance — real amount from listing (better than our 0.2% estimate)
        insurance_annual = self._lookup_money(carac, "assurances", "insurance")

        # Welcome tax — Centris embeds its transfer-tax calculator on the page
        # and pre-populates #taxe via JS (requires render_js fetch)
        welcome_tax = self._extract_welcome_tax(soup)

        # ── Days on market / listing date ─────────────────────────────────────
        days_on_market = self._extract_days_on_market(soup, carac)
        listed_at      = self._extract_listed_date(soup, carac)

        # ── Description ───────────────────────────────────────────────────────
        desc_tag = (
            soup.select_one(".description") or
            soup.select_one("[class*='description']") or
            soup.select_one("#description") or
            soup.select_one("[itemprop='description']")
        )
        description = desc_tag.get_text(separator="\n", strip=True) if desc_tag else None

        # ── Agent / broker contact ────────────────────────────────────────────
        agent_name, agent_phone, agent_email, agency_name = self._extract_agent(soup)

        # ── Photos — gallery (detail page has full-size) ─────────────────────
        photos = self._extract_photos(soup)

        # ── Per-unit data for plexes (store in raw_data for future use) ───────
        units_data = self._extract_units_data(soup, carac)

        # Store full carac dict + coordinates in raw_data
        raw_data: dict = {
            "source_url": source_url,
            "mls": mls_number,
            "carac": carac,
        }
        if lat and lng:
            raw_data["lat"] = lat
            raw_data["lng"] = lng
        if units_data:
            raw_data["units"] = units_data
        if insurance_annual:
            raw_data["insurance_annual"] = insurance_annual
        if welcome_tax:
            raw_data["welcome_tax_centris"] = welcome_tax

        return RawProperty(
            source=self.SOURCE,
            source_url=source_url,
            source_listing_id=mls_number,
            mls_number=mls_number,
            full_address=full_address,
            street_number=street_number,
            street_name=street_name,
            city=city,
            neighborhood=neighborhood,
            postal_code=postal_code,
            property_type=property_type,
            asking_price=asking_price,
            sqft_total=sqft,
            lot_sqft=lot_sqft,
            year_built=year_built,
            floors=floors,
            bedrooms_total=bedrooms,
            bathrooms_total=bathrooms,
            parking_spaces=parking,
            unit_count=unit_count,
            rental_income_monthly=rental_income,
            municipal_taxes_annual=municipal_tax,
            school_taxes_annual=school_tax,
            condo_fees_monthly=condo_fees,
            evaluation_fonciere=evaluation,
            welcome_tax=welcome_tax,
            description=description,
            photos=photos,
            days_on_market=days_on_market,
            listed_at=listed_at,
            agent_name=agent_name,
            agent_phone=agent_phone,
            agent_email=agent_email,
            agency_name=agency_name,
            raw_data=raw_data,
        )

    # ── Coordinate extractor ──────────────────────────────────────────────────

    @staticmethod
    def _extract_coordinates(soup: BeautifulSoup) -> tuple[Optional[float], Optional[float]]:
        """
        Extract lat/lng from the detail page HTML.
        Checks in order: JSON-LD GeoCoordinates → data-lat/lng attrs → JS variables.
        Returns (lat, lng) or (None, None).
        """
        # Pattern 1 — JSON-LD schema.org
        for script in soup.select("script[type='application/ld+json']"):
            try:
                text = script.string or ""
                if not text.strip():
                    continue
                data = _json.loads(text)
                items = data if isinstance(data, list) else [data]
                for item in items:
                    geo = item.get("geo") or {}
                    if not geo:
                        for sub in item.get("@graph", []):
                            geo = sub.get("geo", {})
                            if geo:
                                break
                    if geo.get("latitude") and geo.get("longitude"):
                        return float(geo["latitude"]), float(geo["longitude"])
            except (ValueError, TypeError, AttributeError):
                pass

        # Pattern 2 — data-lat / data-lng HTML attributes
        for el in soup.select("[data-lat][data-lng]"):
            try:
                lat, lng = float(el["data-lat"]), float(el["data-lng"])
                if 44 <= lat <= 63 and -80 <= lng <= -57:
                    return lat, lng
            except (ValueError, TypeError, KeyError):
                pass

        for el in soup.select("[data-latitude][data-longitude]"):
            try:
                lat, lng = float(el["data-latitude"]), float(el["data-longitude"])
                if 44 <= lat <= 63 and -80 <= lng <= -57:
                    return lat, lng
            except (ValueError, TypeError, KeyError):
                pass

        # Pattern 3 — inline JS variable ("lat": 45.xxx, "lng": -73.xxx)
        for script in soup.find_all("script"):
            text = script.string or ""
            if not text or "lat" not in text.lower():
                continue
            m_lat = re.search(r'"lat(?:itude)?"\s*:\s*(-?\d{2}\.\d{4,})', text)
            m_lng = re.search(r'"l(?:ng|ong(?:itude)?)?"\s*:\s*(-?\d{2,3}\.\d{4,})', text)
            if m_lat and m_lng:
                try:
                    lat, lng = float(m_lat.group(1)), float(m_lng.group(1))
                    if 44 <= lat <= 63 and -80 <= lng <= -57:
                        return lat, lng
                except (ValueError, TypeError):
                    pass

        return None, None

    # ── Carac dict builder ────────────────────────────────────────────────────

    @staticmethod
    def _build_carac_dict(soup: BeautifulSoup) -> dict[str, str]:
        """
        Build a {label_lower: value_text} dict from all structured key-value
        pairs on the page. Handles every HTML pattern Centris uses:
          1. .carac-container with .carac-title + .carac-value siblings
          2. dt/dd definition lists
          3. Table rows (income/expense section)
          4. li with two child spans
          5. Generic two-child div containers
        Storing ALL pairs means we never miss a field even if Centris changes layout.
        """
        result: dict[str, str] = {}

        # Pattern 1 — .carac-container (main specs section)
        for container in soup.select(
            ".carac-container, [class*='carac-container'], "
            "[class*='spec-item'], [class*='feature-item']"
        ):
            title_el = (
                container.select_one(".carac-title") or
                container.select_one("[class*='carac-title']") or
                container.select_one("[class*='spec-label']") or
                container.select_one("[class*='label']")
            )
            value_el = (
                container.select_one(".carac-value") or
                container.select_one("[class*='carac-value']") or
                container.select_one("[class*='spec-value']") or
                container.select_one("[class*='value']")
            )
            if title_el and value_el and title_el is not value_el:
                label = title_el.get_text(strip=True).lower()
                value = value_el.get_text(strip=True)
                if label and value:
                    result[label] = value

        # Pattern 2 — dl/dt/dd (some Centris sections use definition lists)
        for dl in soup.select("dl"):
            dts = dl.select("dt")
            dds = dl.select("dd")
            for dt, dd in zip(dts, dds):
                label = dt.get_text(strip=True).lower()
                value = dd.get_text(strip=True)
                if label and value:
                    result[label] = value

        # Pattern 3 — table rows (revenus et dépenses, évaluation)
        for table in soup.select("table"):
            for row in table.select("tr"):
                cells = row.select("td, th")
                if len(cells) >= 2:
                    label = cells[0].get_text(strip=True).lower()
                    value = cells[-1].get_text(strip=True)
                    if label and value and label != value:
                        result[label] = value

        # Pattern 4 — li elements with two spans (teaser / summary bar)
        for li in soup.select("li"):
            spans = li.select("span")
            if len(spans) >= 2:
                label = spans[0].get_text(strip=True).lower()
                value = spans[-1].get_text(strip=True)
                if label and value and label != value and len(label) < 80:
                    result.setdefault(label, value)  # don't overwrite Pattern 1/2/3

        # Pattern 5 — labeled sections with header + value in sibling divs
        for section in soup.select(
            "[class*='info-row'], [class*='detail-row'], [class*='data-row']"
        ):
            children = [c for c in section.children if getattr(c, "name", None)]
            if len(children) == 2:
                label = children[0].get_text(strip=True).lower()
                value = children[1].get_text(strip=True)
                if label and value and len(label) < 80:
                    result.setdefault(label, value)

        # Pattern 6 — financial-details-table (taxes / assessment). On the
        # server-rendered (non-JS) page these live in label/value cells that
        # aren't wrapped in a <table>, so Pattern 3 misses them — pair each
        # label with its following value cell directly. This is what lets a
        # plain-HTTP fetch (no headless browser) still pick up municipal /
        # school taxes and the assessment breakdown.
        for label_el in soup.select("[class*='financial-details-table__label']"):
            value_el = label_el.find_next(
                class_=re.compile(r"financial-details-table__value")
            )
            if value_el:
                label = label_el.get_text(strip=True).lower()
                value = value_el.get_text(strip=True)
                if label and value:
                    result.setdefault(label, value)

        return result

    # ── Carac dict lookup helpers ─────────────────────────────────────────────

    @staticmethod
    def _lookup_money(carac: dict[str, str], *keys: str) -> Optional[float]:
        for key in keys:
            for label, val in carac.items():
                if key in label:
                    digits = re.sub(r"[^\d]", "", val)
                    if digits and int(digits) > 0:
                        return float(digits)
        return None

    @staticmethod
    def _extract_welcome_tax(soup: BeautifulSoup) -> Optional[float]:
        """
        Read the welcome tax from Centris's embedded transfer-tax calculator.
        The page JS pre-populates #taxe for this property (city + price preset),
        so this is Centris's own authoritative number — only present when the
        page was fetched with render_js.

        Handles French formatting: "23 581,25 $" (spaces = thousands, comma = decimals).
        """
        for selector in ("#taxe", "[id*='taxe']", ".calcul-mutation", "[class*='mutation']"):
            el = soup.select_one(selector)
            if not el:
                continue
            text = el.get_text(" ", strip=True)
            # Keep digits, comma, dot; drop currency symbols and spaces (incl. \xa0)
            cleaned = re.sub(r"[^\d,.]", "", text)
            if not cleaned:
                continue
            # French decimals: comma is the decimal separator ("23581,25")
            if "," in cleaned and "." not in cleaned:
                cleaned = cleaned.replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
            try:
                value = float(cleaned)
            except ValueError:
                continue
            # Sanity bounds — welcome tax on a listing is between $100 and $500k
            if 100 <= value <= 500_000:
                return round(value, 2)
        return None

    @staticmethod
    def _lookup_int(carac: dict[str, str], *keys: str) -> Optional[int]:
        for key in keys:
            for label, val in carac.items():
                if key in label:
                    nums = re.findall(r"\d+", val)
                    if nums:
                        return int(nums[0])
        return None

    @staticmethod
    def _lookup_float(carac: dict[str, str], *keys: str) -> Optional[float]:
        for key in keys:
            for label, val in carac.items():
                if key in label:
                    nums = re.findall(r"\d+\.?\d*", val)
                    if nums:
                        return float(nums[0])
        return None

    @staticmethod
    def _lookup_sqft(carac: dict[str, str], *keys: str) -> Optional[int]:
        """Extract sqft, converting m² to sqft if needed."""
        for key in keys:
            for label, val in carac.items():
                if key in label:
                    nums = re.findall(r"[\d\s,]+\.?\d*", val)
                    if nums:
                        raw = float(re.sub(r"[^\d.]", "", nums[0].replace(" ", "").replace(",", "")))
                        # Convert m² to sqft if unit is metric
                        if re.search(r"m2|m²|mètre|metre", val, re.IGNORECASE):
                            raw = raw * 10.764
                        if 50 < raw < 50_000:
                            return int(raw)
        return None

    # ── Specialised extractors ────────────────────────────────────────────────

    @staticmethod
    def _extract_postal_code(soup: BeautifulSoup) -> Optional[str]:
        """Find a Canadian postal code (A1A 1A1) anywhere on the page."""
        # Check structured data first
        for el in soup.select("[itemprop='postalCode'], [class*='postal'], [class*='zip']"):
            text = el.get_text(strip=True)
            m = re.search(r"[A-Z]\d[A-Z]\s?\d[A-Z]\d", text.upper())
            if m:
                return m.group().replace(" ", "")
        # Fallback: scan whole page text
        page_text = soup.get_text()
        m = re.search(r"\b([A-Z]\d[A-Z])\s*(\d[A-Z]\d)\b", page_text.upper())
        if m:
            return m.group(1) + m.group(2)
        return None

    @staticmethod
    def _extract_days_on_market(soup: BeautifulSoup, carac: dict[str, str]) -> Optional[int]:
        # Try carac dict first
        for key in ("temps sur le marché", "days on market", "jours sur le marché", "sur le marché"):
            for label, val in carac.items():
                if key in label:
                    nums = re.findall(r"\d+", val)
                    if nums:
                        n = int(nums[0])
                        if "semaine" in val.lower() or "week" in val.lower():
                            return n * 7
                        if "mois" in val.lower() or "month" in val.lower():
                            return n * 30
                        return n
        # Fallback: look for "X jours" anywhere
        text = soup.get_text()
        m = re.search(r"(\d+)\s*jours?", text, re.IGNORECASE)
        if m:
            return int(m.group(1))
        return None

    @staticmethod
    def _extract_listed_date(soup: BeautifulSoup, carac: dict[str, str]) -> Optional[str]:
        """Return ISO date string (YYYY-MM-DD) if listing date is found."""
        for key in ("date d'inscription", "listed", "date de mise en marché", "inscrit le"):
            for label, val in carac.items():
                if key in label:
                    m = re.search(r"(\d{4}[-/]\d{2}[-/]\d{2})", val)
                    if m:
                        return m.group(1).replace("/", "-")
                    # French date: "15 janvier 2025"
                    m2 = re.search(r"(\d{1,2})\s+(\w+)\s+(\d{4})", val)
                    if m2:
                        return f"{m2.group(3)}-01-01"  # rough fallback
        # Check meta tags
        for meta in soup.select("meta[property='article:published_time'], meta[name='date']"):
            content = meta.get("content", "")
            m = re.search(r"(\d{4}-\d{2}-\d{2})", content)
            if m:
                return m.group(1)
        return None

    def _extract_agent(self, soup: BeautifulSoup) -> tuple[
        Optional[str], Optional[str], Optional[str], Optional[str]
    ]:
        """Extract broker/agent contact from the broker card on the detail page."""
        broker_card = (
            soup.select_one(".broker-info") or
            soup.select_one("[class*='broker']") or
            soup.select_one("[class*='courtier']") or
            soup.select_one("[class*='agent']")
        )
        if not broker_card:
            return None, None, None, None

        name_tag   = broker_card.select_one("[class*='name']") or broker_card.select_one("strong")
        phone_tag  = (
            broker_card.select_one("[href^='tel:']") or
            broker_card.select_one("[class*='phone']") or
            broker_card.select_one("[class*='telephone']")
        )
        email_tag  = broker_card.select_one("[href^='mailto:']")
        agency_tag = (
            broker_card.select_one("[class*='agency']") or
            broker_card.select_one("[class*='agence']") or
            broker_card.select_one("[class*='firm']")
        )

        agent_name   = name_tag.get_text(strip=True) if name_tag else None
        agent_phone  = (
            phone_tag.get("href", "").replace("tel:", "").strip()
            if phone_tag else None
        )
        agent_email  = (
            email_tag.get("href", "").replace("mailto:", "").strip()
            if email_tag else None
        )
        agency_name  = agency_tag.get_text(strip=True) if agency_tag else None

        return agent_name, agent_phone, agent_email, agency_name

    @staticmethod
    def _extract_photos(soup: BeautifulSoup) -> list[str]:
        """Extract all full-size photos, preferring gallery/slideshow images."""
        seen: set[str] = set()
        photos: list[str] = []

        # Priority 0: window.MosaicPhotoUrls — Centris inlines the FULL, ordered
        # gallery as a JS array in the page source (present even without JS
        # rendering). This is the authoritative list; the DOM <img> fallbacks
        # below only surface the first photo plus unrelated agent/related-listing
        # thumbnails on a non-rendered page, so when this is present we use it
        # exclusively.
        html = str(soup)
        m = re.search(r"window\.MosaicPhotoUrls\s*=\s*(\[[^\]]*\])", html)
        if m:
            raw = m.group(1)
            for url in re.findall(r'"(https?://[^"]*media\.ashx[^"]*)"', raw):
                # Un-escape the JS/HTML-encoded ampersands.
                url = url.replace("\\u0026", "&").replace("&amp;", "&").replace("\\/", "/")
                if url not in seen:
                    seen.add(url)
                    photos.append(hi_res_photo(url))
            if photos:
                return photos

        # Priority 1: gallery / carousel images
        for img in soup.select(
            "[class*='gallery'] img, [class*='carousel'] img, "
            "[class*='slider'] img, [class*='photo'] img"
        ):
            src = img.get("src") or img.get("data-src") or img.get("data-lazy-src", "")
            if src and src.startswith("http") and not src.endswith(".svg") and src not in seen:
                seen.add(src)
                photos.append(hi_res_photo(src))

        # Priority 2: all other images (skip icons/logos)
        for img in soup.select("img[src], img[data-src]"):
            src = img.get("src") or img.get("data-src", "")
            if (src and src.startswith("http") and not src.endswith(".svg")
                    and src not in seen
                    and not any(skip in src for skip in ["logo", "icon", "placeholder", "blank"])):
                seen.add(src)
                photos.append(hi_res_photo(src))

        return photos

    @staticmethod
    def _extract_units_data(soup: BeautifulSoup, carac: dict[str, str]) -> list[dict]:
        """
        Extract per-unit details for plex listings.
        Centris shows a table like:
          Logement 1 | 3.5 pièces | 850 pi² | 950 $/mois | Occupé
          Logement 2 | 4.5 pièces | 1050 pi² | 1100 $/mois | Vacant

        Returns list of dicts: [{unit: 1, rooms: "3.5", sqft: 850, rent: 950, occupied: True}, ...]
        """
        units = []

        # Look for unit tables
        for table in soup.select("table"):
            header_text = table.get_text().lower()
            if not any(kw in header_text for kw in ["logement", "unit", "loyer", "appartement"]):
                continue
            rows = table.select("tr")
            for row in rows[1:]:  # skip header row
                cells = [c.get_text(strip=True) for c in row.select("td")]
                if not cells:
                    continue
                unit_data: dict = {}
                row_text = " ".join(cells).lower()

                # Unit number
                m = re.search(r"logement\s*(\d+)|unit\s*(\d+)|appart\w*\s*(\d+)", row_text)
                if m:
                    unit_data["unit"] = int(next(g for g in m.groups() if g))

                # Room type (3.5, 4.5 pièces)
                m = re.search(r"(\d+\.?\d*)\s*pièces?", row_text)
                if m:
                    unit_data["rooms"] = m.group(1)

                # sqft
                m = re.search(r"(\d[\d\s,]*)\s*pi²", row_text)
                if m:
                    unit_data["sqft"] = int(re.sub(r"[^\d]", "", m.group(1)))

                # Monthly rent
                for cell in cells:
                    m = re.search(r"(\d[\d\s,]*)\s*\$/?\s*mois", cell, re.IGNORECASE)
                    if not m:
                        m = re.search(r"\$\s*(\d[\d\s,]+)", cell)
                    if m:
                        unit_data["rent_monthly"] = float(re.sub(r"[^\d]", "", m.group(1)))
                        break

                # Occupancy
                if "vacant" in row_text:
                    unit_data["occupied"] = False
                elif any(kw in row_text for kw in ["occupé", "occupied", "locataire"]):
                    unit_data["occupied"] = True

                if unit_data:
                    units.append(unit_data)

        # Also look in carac dict for individual unit entries
        for label, val in carac.items():
            m = re.match(r"logement\s*(\d+)", label)
            if m:
                unit_num = int(m.group(1))
                rent_m = re.search(r"(\d[\d\s,]*)\s*\$", val)
                rent = float(re.sub(r"[^\d]", "", rent_m.group(1))) if rent_m else None
                units.append({"unit": unit_num, "rent_monthly": rent, "raw": val})

        return units

    # ── Address parser ────────────────────────────────────────────────────────

    @staticmethod
    def _parse_name_meta(content: str) -> tuple[
        Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]
    ]:
        """
        Parse Centris schema.org name → (full_address, city, neighborhood, street_number, street_name).
        Input: "Triplex à vendre à Montréal (Mercier/Hochelaga), Montréal (Île), 3115 - 3119, Rue De Cadillac, MLS - Centris.ca"
        """
        if not content:
            return None, None, None, None, None

        # Strip trailing MLS and branding
        content = re.sub(r",?\s*\d{7,9}\s*-\s*Centris\.ca$", "", content, flags=re.IGNORECASE).strip()

        # City: match "à vendre à CITY"
        city_match = re.search(r"à vendre à\s+([A-ZÀ-Ÿ][^(,]+)", content)
        city = city_match.group(1).strip() if city_match else None

        # Neighborhood: first parenthesized value
        neighborhood_match = re.search(r"\(([^)]+)\)", content)
        neighborhood = neighborhood_match.group(1).strip() if neighborhood_match else None

        # Street address: find numeric street-number segment
        parts = [p.strip() for p in content.split(",")]
        street_num_idx = None
        for i, part in enumerate(parts):
            # Civic number, optionally a range and/or a letter suffix:
            # "3115", "3115 - 3119", "8870 - 8876A", "8876A".
            if re.match(r"^\d+[A-Za-z]?[\s\-–]*\d*[A-Za-z]?$", part.strip()):
                street_num_idx = i
                break

        street_number = street_name = full_address = None
        if street_num_idx is not None and street_num_idx + 1 < len(parts):
            street_number = parts[street_num_idx].strip()
            street_name   = parts[street_num_idx + 1].strip()
            full_address  = f"{street_number}, {street_name}, {city}" if city else f"{street_number}, {street_name}"

        return full_address, city, neighborhood, street_number, street_name

    # ── Shared helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _extract_microdata_int(soup: BeautifulSoup, *props: str) -> Optional[int]:
        """Extract integer from schema.org itemprop microdata attributes."""
        for prop in props:
            el = soup.select_one(f"[itemprop='{prop}']")
            if el:
                val = el.get("content") or el.get_text(strip=True)
                nums = re.findall(r"\d+", str(val))
                if nums:
                    return int(nums[0])
        return None

    @staticmethod
    def _extract_microdata_float(soup: BeautifulSoup, *props: str) -> Optional[float]:
        """Extract float from schema.org itemprop microdata attributes."""
        for prop in props:
            el = soup.select_one(f"[itemprop='{prop}']")
            if el:
                val = el.get("content") or el.get_text(strip=True)
                nums = re.findall(r"\d+\.?\d*", str(val))
                if nums:
                    return float(nums[0])
        return None

    @staticmethod
    def _parse_unit_count(text: str) -> Optional[int]:
        """
        Parse "Résidentiel (2)" or "Résidentiel (2), Commercial (1)" → 2.
        Returns only the residential unit count.
        """
        if not text:
            return None
        m = re.search(r"r[ée]sidentiel\s*\((\d+)\)", text, re.IGNORECASE)
        if m:
            return int(m.group(1))
        # Fallback: first parenthesised number
        m = re.search(r"\((\d+)\)", text)
        if m:
            return int(m.group(1))
        # Plain number
        nums = re.findall(r"\d+", text)
        return int(nums[0]) if nums else None

    @staticmethod
    def _parse_bedrooms(text: str) -> Optional[int]:
        """Parse "4 pièces, 2 chambres, 1 salle de bain" → 2 bedrooms."""
        if not text:
            return None
        m = re.search(r"(\d+)\s*chambre", text, re.IGNORECASE)
        return int(m.group(1)) if m else None

    @staticmethod
    def _parse_bathrooms(text: str) -> Optional[float]:
        """Parse "4 pièces, 2 chambres, 1 salle de bain" → 1.0 bathrooms."""
        if not text:
            return None
        m = re.search(r"(\d+\.?\d*)\s*salle", text, re.IGNORECASE)
        return float(m.group(1)) if m else None

    @staticmethod
    def _parse_price(text: str) -> Optional[float]:
        if not text:
            return None
        digits = re.sub(r"[^\d]", "", text)
        return float(digits) if digits else None
