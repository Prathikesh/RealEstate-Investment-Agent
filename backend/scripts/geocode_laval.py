"""
Geocode un-located Laval listings from Laval's official "Géolocalisation des
adresses" open data (Données Québec). Laval publishes address points as WKT in
EPSG:32188 (MTM zone 8), so we reproject to 4326 in PostGIS.

Run from backend/:  python scripts/geocode_laval.py
"""
import asyncio
import json
import logging
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("geocode_laval")

from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.services.quebec_address import roll_match_key, full_address_match_key

RID = "d46d4a9e-aa71-45e2-b3ac-af701ab58582"  # Laval adresse-civique.csv datastore
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
_PT = re.compile(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")


def fetch_page(offset: int, limit: int = 20000) -> dict:
    api = (f"https://www.donneesquebec.ca/recherche/api/3/action/datastore_search"
           f"?resource_id={RID}&limit={limit}&offset={offset}")
    raw = urllib.request.urlopen(urllib.request.Request(api, headers={"User-Agent": UA}), timeout=90).read()
    return json.loads(raw)["result"]


def load_laval_index() -> dict[str, tuple[float, float]]:
    """match_key -> (x, y) in EPSG:32188 from Laval's address points."""
    idx: dict[str, tuple[float, float]] = {}
    off = 0
    while True:
        r = fetch_page(off)
        recs = r["records"]
        if not recs:
            break
        for rec in recs:
            key = roll_match_key(str(rec.get("NO_CIVIQUE") or "").strip(), rec.get("RUE") or "")
            m = _PT.search(rec.get("WKT") or "")
            if key and m and key not in idx:
                idx[key] = (float(m.group(1)), float(m.group(2)))
        off += 20000
        logger.info(f"  pulled {off} Laval addresses (index={len(idx)})")
        if off >= r["total"]:
            break
    return idx


async def main() -> None:
    idx = load_laval_index()
    logger.info(f"Loaded {len(idx):,} Laval address points")

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(text("""
            SELECT id, full_address FROM properties
            WHERE location IS NULL AND full_address IS NOT NULL AND lower(city) LIKE '%laval%'
        """))).all()
        logger.info(f"{len(rows)} un-located Laval listings to try")

        matched = 0
        for r in rows:
            key = full_address_match_key(r.full_address)
            hit = idx.get(key) if key else None
            if not hit:
                continue
            x, y = hit
            await session.execute(text("""
                UPDATE properties
                SET location = ST_Transform(ST_SetSRID(ST_MakePoint(:x, :y), 32188), 4326)
                WHERE id = :id
            """), {"x": x, "y": y, "id": str(r.id)})
            matched += 1
        await session.commit()
        pct = round(100 * matched / len(rows)) if rows else 0
        logger.info(f"Geocoded {matched}/{len(rows)} Laval listings ({pct}%)")


if __name__ == "__main__":
    asyncio.run(main())
