"""
Geocode un-located Longueuil listings from the city's official address points.

Source (public, no key): Ville de Longueuil ArcGIS
  …/RechercheAdresse/FeatureServer/0  ("Recherche d'adresses - Longueuil",
  ~80k civic points covering the three boroughs Vieux-Longueuil / Saint-Hubert /
  Greenfield Park). Requested as GeoJSON, so points come back in WGS84 already —
  no reprojection needed.

Why this matters: zoning is matched by ST_Contains on a property's coordinates,
and Longueuil listings currently have none — so this is the prerequisite that
makes the Longueuil zoning load actually show up on listings.

Layer 1 ("Agglomération", ~135k points) additionally covers Brossard /
Boucherville / Saint-Lambert / Saint-Bruno — swap LAYER=1 + widen the city
filter to geocode those once their zoning parsers exist.

Run from backend/ (DRY-RUN by default — reports match rate, writes nothing):
    python scripts/geocode_longueuil.py            # dry-run
    python scripts/geocode_longueuil.py --commit   # write location to DB
"""
import argparse
import asyncio
import logging
import sys
import urllib.parse
import urllib.request
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("geocode_longueuil")

from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.services.quebec_address import roll_match_key, full_address_match_key

SVC = "https://geomatique.longueuil.quebec/public/rest/services/RechercheAdresse/FeatureServer"
LAYER = 0                         # 0 = Longueuil · 1 = whole agglomeration
CITY_LIKE = "%longueuil%"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"


def fetch_page(offset: int, limit: int = 1000) -> list[dict]:
    params = urllib.parse.urlencode({
        "where": "1=1",
        "outFields": "NO_CIVIQUE,NOMRUECOMPLET",
        "returnGeometry": "true", "outSR": 4326, "f": "geojson",
        "resultOffset": offset, "resultRecordCount": limit,
    })
    url = f"{SVC}/{LAYER}/query?{params}"
    raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90).read()
    return json.loads(raw).get("features", [])


def load_address_index() -> dict[str, tuple[float, float]]:
    """match_key -> (lon, lat) in WGS84 from Longueuil's official address points."""
    idx: dict[str, tuple[float, float]] = {}
    off = 0
    while True:
        feats = fetch_page(off)
        if not feats:
            break
        for f in feats:
            p = f.get("properties", {})
            g = f.get("geometry") or {}
            key = roll_match_key(str(p.get("NO_CIVIQUE") or "").strip(), p.get("NOMRUECOMPLET") or "")
            coords = g.get("coordinates")
            if key and coords and key not in idx:      # keep first (per-city, collisions negligible)
                idx[key] = (float(coords[0]), float(coords[1]))
        off += len(feats)
        logger.info(f"  pulled {off} Longueuil addresses (index={len(idx)})")
        if len(feats) < 1000:
            break
    return idx


async def main(commit: bool) -> None:
    idx = load_address_index()
    logger.info(f"Loaded {len(idx):,} Longueuil address points")

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(text("""
            SELECT id, full_address FROM properties
            WHERE location IS NULL AND full_address IS NOT NULL AND lower(city) LIKE :c
        """), {"c": CITY_LIKE})).all()
        logger.info(f"{len(rows)} un-located Longueuil listings to try")

        matched = 0
        for r in rows:
            key = full_address_match_key(r.full_address)
            hit = idx.get(key) if key else None
            if not hit:
                continue
            matched += 1
            if commit:
                lon, lat = hit
                await session.execute(text("""
                    UPDATE properties
                    SET location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                        needs_reanalysis = true
                    WHERE id = :id
                """), {"lon": lon, "lat": lat, "id": str(r.id)})
        if commit:
            await session.commit()

        pct = round(100 * matched / len(rows)) if rows else 0
        verb = "Geocoded" if commit else "MATCHED (dry-run, not written)"
        logger.info(f"{verb} {matched}/{len(rows)} Longueuil listings ({pct}%)")
        if not commit:
            logger.info("Re-run with --commit to write location + flag needs_reanalysis.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="write location to DB (default: dry-run)")
    args = ap.parse_args()
    asyncio.run(main(args.commit))
