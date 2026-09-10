"""
Quebec property geocoder — converts address strings to (lat, lng).

Priority chain:
  1. Nominatim (OpenStreetMap) — address-level, free, 1 req/sec
  2. City centroid fallback    — approximate but instant, no API needed
"""
import asyncio
import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Quebec city centroids (approximate centres) ───────────────────────────────

CITY_CENTROIDS: dict[str, tuple[float, float]] = {
    "montréal":                  (45.5017, -73.5673),
    "montreal":                  (45.5017, -73.5673),
    "laval":                     (45.6066, -73.7124),
    "longueuil":                 (45.5315, -73.5181),
    "brossard":                  (45.4581, -73.4706),
    "saint-lambert":             (45.4978, -73.5103),
    "boucherville":              (45.5984, -73.4358),
    "saint-hubert":              (45.4808, -73.4199),
    "greenfield park":           (45.4783, -73.4670),
    "lévis":                     (46.8032, -71.1784),
    "levis":                     (46.8032, -71.1784),
    "québec":                    (46.8139, -71.2080),
    "quebec city":               (46.8139, -71.2080),
    "sainte-foy":                (46.7757, -71.2930),
    "sherbrooke":                (45.4042, -71.8929),
    "gatineau":                  (45.4765, -75.7013),
    "hull":                      (45.4271, -75.7160),
    "trois-rivières":            (46.3482, -72.5397),
    "trois-rivieres":            (46.3482, -72.5397),
    "saint-jean-sur-richelieu":  (45.3069, -73.2615),
    "saint-jean":                (45.3069, -73.2615),
    "drummondville":             (45.8772, -72.4832),
    "saguenay":                  (48.4279, -71.0665),
    "chicoutimi":                (48.4279, -71.0665),
    "repentigny":                (45.7444, -73.4519),
    "saint-jérôme":              (45.7774, -74.0038),
    "saint-jerome":              (45.7774, -74.0038),
    "terrebonne":                (45.7048, -73.6474),
    "joliette":                  (46.0220, -73.4505),
    "sorel-tracy":               (46.0433, -73.1038),
    "granby":                    (45.4015, -72.7362),
    "saint-hyacinthe":           (45.6295, -72.9533),
    "vaudreuil-dorion":          (45.3979, -74.0301),
    "mont-laurier":              (46.5504, -75.5001),
    "rouyn-noranda":             (48.2390, -79.0123),
    "brownsburg-chatham":        (45.6893, -74.4029),
    "east angus":                (45.4919, -71.6635),
    "nicolet":                   (46.2267, -72.6153),
    "magog":                     (45.2680, -72.1488),
    "sutton":                    (45.1075, -72.6133),
    "labelle":                   (46.2849, -74.7256),
    "otter lake":                (45.8667, -76.9333),
}

# ── In-memory cache to avoid redundant geocoding ─────────────────────────────

_cache: dict[str, Optional[tuple[float, float]]] = {}
_cache_muni: dict[str, tuple[Optional[str], Optional[str]]] = {}
_lock = asyncio.Lock()
_last_call: float = 0.0


# ── Nominatim geocoder ────────────────────────────────────────────────────────

async def _nominatim(query: str) -> Optional[tuple[float, float]]:
    """Single Nominatim call, rate-limited to 1 req/sec."""
    global _last_call

    if query in _cache:
        return _cache[query]

    async with _lock:
        if query in _cache:          # double-check after acquiring lock
            return _cache[query]

        wait = 1.1 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)

        result: Optional[tuple[float, float]] = None
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": query, "format": "json", "limit": 1, "countrycodes": "ca"},
                    headers={"User-Agent": "quebec-realestate-investment-platform/1.0"},
                )
                data = resp.json()
                if data:
                    result = (float(data[0]["lat"]), float(data[0]["lon"]))
                    logger.debug(f"Geocoded '{query[:60]}' → {result}")
        except Exception as exc:
            logger.warning(f"Nominatim error for '{query[:60]}': {exc}")
        finally:
            _last_call = time.monotonic()

        _cache[query] = result
        return result


async def geocode_area(address: str) -> tuple[Optional[str], Optional[str]]:
    """
    Resolve a free-text address to (municipality, borough) for building the
    Centris geography slug used by address search.

    e.g. "8333 Rue Courval, Montréal" -> ("Montréal", "Saint-Léonard"),
         "123 ch. du Lac, Saint-Sixte" -> ("Saint-Sixte", None).
    The borough (OSM `suburb`/`city_district`/`borough`) is what makes a
    big-city search tractable — a bare "Montréal" scope is far too large.
    Returns (None, None) if Nominatim can't place it. Rate-limited/cached via
    the shared _nominatim throttle.
    """
    global _last_call
    if not address or not address.strip():
        return None, None
    cache_key = f"area::{address.strip().lower()}"
    if cache_key in _cache_muni:
        return _cache_muni[cache_key]

    async with _lock:
        if cache_key in _cache_muni:
            return _cache_muni[cache_key]
        wait = 1.1 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)

        muni: Optional[str] = None
        borough: Optional[str] = None
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": f"{address.strip()}, Quebec, Canada",
                        "format": "json", "limit": 1, "countrycodes": "ca",
                        "addressdetails": 1,
                    },
                    headers={"User-Agent": "quebec-realestate-investment-platform/1.0"},
                )
                data = resp.json()
                if data:
                    addr = data[0].get("address", {})
                    muni = (
                        addr.get("city") or addr.get("town") or addr.get("village")
                        or addr.get("municipality") or addr.get("county")
                    )
                    borough = (
                        addr.get("suburb") or addr.get("city_district")
                        or addr.get("borough") or addr.get("quarter")
                    )
        except Exception as exc:
            logger.warning(f"Nominatim area lookup failed for '{address[:60]}': {exc}")
        finally:
            _last_call = time.monotonic()

        _cache_muni[cache_key] = (muni, borough)
        return muni, borough


def city_centroid(city: str) -> Optional[tuple[float, float]]:
    """Return known approximate city centre, or None if unknown."""
    if not city:
        return None
    key = city.lower().strip()
    if key in CITY_CENTROIDS:
        return CITY_CENTROIDS[key]
    # Partial match — e.g. "Montréal (Le Sud-Ouest)" contains "montréal"
    for city_key, coords in CITY_CENTROIDS.items():
        if city_key in key:
            return coords
    return None


async def geocode(
    address: Optional[str],
    city: Optional[str] = None,
) -> Optional[tuple[float, float]]:
    """
    Geocode a property address to (lat, lng).

    1. Nominatim with full address + city
    2. Nominatim with address only
    3. City centroid fallback (approximate)
    """
    if address and city:
        clean_addr = address.replace("Unknown", "").strip().rstrip(",")
        if clean_addr:
            coords = await _nominatim(f"{clean_addr}, {city}, Quebec, Canada")
            if coords:
                return coords

    if address:
        clean_addr = address.replace("Unknown", "").strip().rstrip(",")
        if clean_addr:
            coords = await _nominatim(f"{clean_addr}, Quebec, Canada")
            if coords:
                return coords

    return city_centroid(city or "")
