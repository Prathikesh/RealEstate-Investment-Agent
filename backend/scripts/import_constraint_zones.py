"""
Import a development-constraint overlay (agricultural / flood / heritage) from a
GeoJSON polygon layer into constraint_zones. Generic — works for any official
overlay dataset that publishes polygons in WGS84.

Examples:
  # Laval agricultural zone (CPTAQ, via Ville de Laval open data)
  python scripts/import_constraint_zones.py --type agricultural --city laval \
      --geojson-path /local/laval_ag.geojson \
      --source-url https://www.donneesquebec.ca/.../sad-zone-agricole.geojson \
      --name-field NOM

Run with a DATABASE_URL that can INSERT on constraint_zones.
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_constraint_zones")

import httpx
from geoalchemy2.shape import from_shape
from shapely.geometry import shape, MultiPolygon
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.constraint import ConstraintZone


async def _fetch(path_or_url: str) -> bytes:
    if path_or_url.startswith("http"):
        logger.info(f"Downloading {path_or_url} ...")
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as c:
            r = await c.get(path_or_url)
            r.raise_for_status()
            return r.content
    return Path(path_or_url).read_bytes()


async def main(ctype: str, city: str, geojson: str, source_url: Optional[str], name_field: Optional[str]) -> None:
    data = json.loads(await _fetch(geojson))
    feats = data.get("features", [])
    logger.info(f"{len(feats)} features in source")

    rows = []
    for f in feats:
        geom = shape(f["geometry"])
        if geom.geom_type == "Polygon":
            geom = MultiPolygon([geom])
        elif geom.geom_type != "MultiPolygon":
            continue
        name = (f.get("properties") or {}).get(name_field) if name_field else None
        rows.append({
            "id": uuid.uuid4(),
            "constraint_type": ctype,
            "city": city,
            "name": name or None,
            "geometry": from_shape(geom, srid=4326),
            "source_url": source_url or (geojson if geojson.startswith("http") else None),
            "data_version": date.today().isoformat(),
            "is_active": True,
        })

    dsn = os.getenv("DATABASE_URL", settings.database_url)
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("DELETE FROM constraint_zones WHERE constraint_type=:t AND city=:c"),
            {"t": ctype, "c": city},
        )
        if rows:
            await session.execute(pg_insert(ConstraintZone), rows)
        await session.commit()
        total = await session.scalar(
            text("SELECT count(*) FROM constraint_zones WHERE constraint_type=:t AND city=:c"),
            {"t": ctype, "c": city},
        )
        logger.info(f"Imported — constraint_zones now has {total} '{ctype}' polygons for {city}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--type", required=True, choices=["agricultural", "flood", "heritage"])
    p.add_argument("--city", required=True)
    p.add_argument("--geojson-path", dest="geojson", required=True, help="local file or http URL")
    p.add_argument("--source-url", default=None)
    p.add_argument("--name-field", default=None)
    args = p.parse_args()
    asyncio.run(main(args.type, args.city, args.geojson, args.source_url, args.name_field))
