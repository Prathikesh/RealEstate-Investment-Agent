"""
Geocode un-located properties using Montréal's official "Adresses ponctuelles"
open data (data/montreal/address_points.jsonl — see pull_montreal_addresses.py).

Zoning is matched by point-in-polygon, so a property with no coordinates gets no
zone. Realtor.ca ships coordinates in its API, but Centris/ReMax don't — this
fills that gap accurately and for free, by matching each listing's address to
the city's official address point (same civic+street key as the assessment
matcher) and writing its LON/LAT to properties.location.

Run from backend/:  python scripts/geocode_from_addresses.py [city]
  city (optional) — only geocode listings whose city matches (default: montreal-ish)
"""
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("geocode_from_addresses")

from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.services.quebec_address import roll_match_key, full_address_match_key

ADDR_FILE = Path(__file__).parent.parent / "data" / "montreal" / "address_points.jsonl"


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_address_index(path: Path) -> dict[str, tuple[float, float]]:
    """match_key -> (lat, lng) from the official address points."""
    idx: dict[str, tuple[float, float]] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            civic = str(r.get("ADDR_DE") or "").strip()
            ori = (r.get("ORIENTATION") or "").strip()
            if ori.upper() == "X":
                ori = ""
            street = " ".join(x for x in [r.get("GENERIQUE"), r.get("SPECIFIQUE"), ori] if x).strip()
            key = roll_match_key(civic, street)
            lat, lng = _num(r.get("LATITUDE")), _num(r.get("LONGITUDE"))
            if key and lat is not None and lng is not None and key not in idx:
                idx[key] = (lat, lng)
    return idx


async def main(city_like: str) -> None:
    if not ADDR_FILE.exists():
        logger.error(f"Missing {ADDR_FILE} — run scripts/pull_montreal_addresses.py first.")
        return
    idx = load_address_index(ADDR_FILE)
    logger.info(f"Loaded {len(idx):,} official address points")

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(text("""
            SELECT id, full_address FROM properties
            WHERE location IS NULL AND full_address IS NOT NULL
              AND lower(city) LIKE :c
        """), {"c": f"%{city_like}%"})).all()
        logger.info(f"{len(rows)} un-located listings to try (city ~ '{city_like}')")

        matched = 0
        for r in rows:
            key = full_address_match_key(r.full_address)
            hit = idx.get(key) if key else None
            if not hit:
                continue
            lat, lng = hit
            await session.execute(text(
                "UPDATE properties SET location = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) WHERE id = :id"
            ), {"lng": lng, "lat": lat, "id": str(r.id)})
            matched += 1
        await session.commit()
        pct = round(100 * matched / len(rows)) if rows else 0
        logger.info(f"Geocoded {matched}/{len(rows)} listings ({pct}%) from official address points")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "montr"))
