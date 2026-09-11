"""
Address -> exact Centris listing resolver (for the on-demand analyzer's
"type an address" path, when the user doesn't paste a URL).

Centris has no address-search API. Its search is *geography*-scoped, not
street-scoped, so the reliable path is:

  1. resolve the free-text address to its municipality (comma-parse, else
     Nominatim) -> Centris city slug,
  2. walk that municipality's category result pages (plex / condo / house),
     fetching each via Scrapfly if available and falling back to headless
     Chromium (Playwright) when Scrapfly is down — exactly like the detail-page
     fetch in property_lookup,
  3. deterministically match each result card's address against the query using
     the SAME civic+street key the assessment-roll matcher uses
     (full_address_match_key) — an exact key match is THE property, not a fuzzy
     guess.

This mirrors CentrisScraper.search_by_address (which is Scrapfly-only and used
by the verification pipeline) but adds the Playwright fallback and the
address->city resolution needed for free-text user input.

Bounded to `max_pages` per category to keep on-demand cost/latency predictable;
a miss just means "not found in the pages we scanned" -> the caller falls back
to needs_url (paste the link).
"""
from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from dataclasses import dataclass

from app.services.quebec_address import full_address_match_key

logger = logging.getLogger(__name__)


@dataclass
class AddressCandidate:
    url: str
    full_address: str | None
    city: str | None
    asking_price: float | None


@dataclass
class ResolveResult:
    url: str | None                       # exact match, if exactly one
    candidates: list[AddressCandidate]    # all cards whose address key matched
    city_slug: str | None                 # what we searched (for diagnostics)


def _slugify_city(name: str) -> str:
    """Centris city slugs: unaccented, lowercase, hyphenated base city."""
    base = name.split("(")[0].strip()
    normalized = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


# Big cities where a bare-city search is too large to walk — scope to the
# borough (Centris slug "<city>-<borough>") instead.
_BIG_CITIES = {"montreal", "quebec", "laval", "longueuil", "gatineau", "sherbrooke"}


def _city_from_text(text: str) -> str | None:
    """
    Best-effort municipality from a free-text address: the LAST comma-separated
    segment, with province / postal-code noise stripped. Handles both
    "32 Rue X, Ville" and Centris's "8333 - 8339A, Rue X, Ville" (comma after
    the civic range). Returns None if there's no usable segment (caller geocodes).
    """
    if "," not in text:
        return None
    segs = [s.strip() for s in text.split(",") if s.strip()]
    for seg in reversed(segs):
        cleaned = re.sub(r"\b(qc|qu[eé]bec|quebec|canada)\b", "", seg, flags=re.I)
        cleaned = re.sub(r"[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d", "", cleaned)  # postal
        cleaned = cleaned.strip(" ,")
        # Skip a segment that is just a street (starts with a civic number).
        if cleaned and not re.match(r"^\d", cleaned):
            return cleaned
    return None


async def _resolve_city_slugs(address: str) -> list[str]:
    """
    Ordered list of Centris geography slugs to try, most specific first.
    For big cities this puts the borough-scoped slug ("montreal-saint-leonard")
    ahead of the bare city, so the walk stays small and actually reaches the
    listing.
    """
    city = borough = None
    # Strip a civic range ("8333 - 8339A" -> "8333") before geocoding — the
    # range confuses Nominatim and it fails to place the street (and so returns
    # no borough), which is exactly what we need for big-city scoping.
    geo_query = re.sub(r"(\d+)\s*[-–]\s*\d+[A-Za-z]?", r"\1", address)
    try:
        from app.scrapers.geocoder import geocode_area
        city, borough = await geocode_area(geo_query)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[addr-lookup] area geocode failed: {exc}")
    if not city:
        city = _city_from_text(address)
    if not city:
        return []

    city_slug = _slugify_city(city)
    slugs: list[str] = []
    if borough and city_slug in _BIG_CITIES:
        slugs.append(f"{city_slug}-{_slugify_city(borough)}")
    slugs.append(city_slug)
    return slugs


def _search_url(category: str, city_slug: str, page: int) -> str:
    from app.scrapers.centris import SEARCH_URLS
    base = SEARCH_URLS.get(category, SEARCH_URLS["plex"])
    url = f"{base}~{city_slug}"
    if page > 1:
        url = f"{url}?view=Thumbnail&uc={page}"
    return url


async def _candidates_for_page(parser, category: str, city_slug: str, page: int, keys: list[str]):
    """
    One result page's candidate cards. Centris search pages are server-rendered,
    so a plain-HTTP GET (fast_http, ~1-2s) is the primary path; a headless
    browser (Playwright) is only used if that GET is blocked/challenged.
    """
    url = _search_url(category, city_slug, page)

    from app.scrapers.http_fetch import fetch_html_fast
    html = await fetch_html_fast(url)
    if not html:
        # Blocked/challenged — fall back to the (slow) headless browser.
        from app.scrapers.playwright_fetch import fetch_html
        html = await fetch_html(url)
    if not html:
        return []
    return parser._parse_search_page(html, page_url=url)


async def resolve_centris_address(
    address: str, keys: list[str], *, max_pages: int = 3,
) -> ResolveResult:
    """
    Resolve a free-text address to the exact Centris listing URL (or a short
    candidate list). Deterministic — matches on civic+street key, not fuzzy text.
    """
    target_key = full_address_match_key(address)
    if not target_key:
        logger.info(f"[addr-lookup] could not build match key from '{address[:60]}'")
        return ResolveResult(url=None, candidates=[], city_slug=None)

    slugs = await _resolve_city_slugs(address)
    if not slugs:
        logger.info(f"[addr-lookup] could not resolve a municipality from '{address[:60]}'")
        return ResolveResult(url=None, candidates=[], city_slug=None)

    logger.info(f"[addr-lookup] searching slugs={slugs} key='{target_key}'")

    from app.scrapers.centris import CentrisScraper
    parser = CentrisScraper(api_keys=keys or ["dummy"])
    matched: list[AddressCandidate] = []
    seen_urls: set[str] = set()
    used_slug: str | None = None

    # Cap concurrent fetches so we stay polite to Centris on a single lookup.
    sem = asyncio.Semaphore(6)

    async def fetch(category: str, page: int):
        async with sem:
            return await _candidates_for_page(parser, category, slug, page, keys)

    try:
        # "plex" aggregates all multi-unit subtypes on Centris, so it plus
        # condo + house covers every listing type. Try the most specific
        # geography slug first (borough), falling back to the bare city. Within
        # a slug, fetch all category/page combos concurrently (fast HTTP) — the
        # whole walk is a few seconds, not minutes.
        for slug in slugs:
            tasks = [
                fetch(category, page)
                for category in ("plex", "condo", "house")
                for page in range(1, max_pages + 1)
            ]
            pages = await asyncio.gather(*tasks, return_exceptions=True)
            for cands in pages:
                if isinstance(cands, Exception) or not cands:
                    continue
                for c in cands:
                    if not c.full_address or not c.source_url:
                        continue
                    if full_address_match_key(c.full_address) == target_key:
                        if c.source_url in seen_urls:
                            continue
                        seen_urls.add(c.source_url)
                        matched.append(AddressCandidate(
                            url=c.source_url, full_address=c.full_address,
                            city=c.city, asking_price=c.asking_price,
                        ))
            if matched:
                used_slug = slug
                break  # found in this (more specific) geography; don't widen
    finally:
        try:
            await parser.close()
        except Exception:  # noqa: BLE001
            pass

    url = matched[0].url if len(matched) == 1 else None
    logger.info(f"[addr-lookup] matched {len(matched)} candidate(s) for '{address[:60]}' via '{used_slug}'")
    return ResolveResult(url=url, candidates=matched, city_slug=used_slug)
