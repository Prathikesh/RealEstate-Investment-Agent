"""
Import Laval zoning zones into the zoning_zones table.

Data source (open data, CC-BY 4.0, Ville de Laval — verified live):
  https://www.donneesquebec.ca/recherche/dataset/4abee7cc-b3d9-436e-ab13-e3ea31b45b08
  ("Type de milieux du CDU" — Laval's Code de l'urbanisme zoning geometry)

Run from backend/ with:  python scripts/import_zoning_laval.py
Options:
  --geojson-path PATH   use a local GeoJSON file instead of downloading

WHAT THIS DOES NOT YET DO: Laval's actual buildable-rules grid lives behind
info-reglements.laval.ca, which returns HTTP 403 to any scripted request
(confirmed with browser-identical headers — this is deliberate bot
protection, not something to route around). So `rules` here only captures
what the open-data geometry file itself provides: the zone number
(NO_ZONE — this is the number an investor types on Laval's map, e.g. the
"328" style code) and the TYPE_MILIE transect classification (T1.1, T5.2,
CI.2, etc). TYPE_MILIE looks like a standardized category system (a small,
fixed set of classes with rules defined once per class in the bylaw text,
similar to Montreal's H.1-H.7), which is the more promising path to decode
buildable potential than scraping per-zone grid pages — but that decode
(reading the actual Code de l'urbanisme bylaw text) is a separate task,
not done by this script.
"""
import argparse
import asyncio
import json
import logging
import sys
from datetime import date
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_zoning_laval")

import httpx
from geoalchemy2.shape import from_shape
from shapely.geometry import shape, MultiPolygon
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models.zoning import ZoningZone

CITY = "laval"
GEOJSON_URL = (
    "https://www.donneesquebec.ca/recherche/dataset/4abee7cc-b3d9-436e-ab13-e3ea31b45b08/"
    "resource/34ce13f3-35bd-4b54-b980-c516ba107864/download/cdu-type-milieux.geojson"
)


async def _fetch_bytes(path_or_url: str) -> bytes:
    if path_or_url.startswith("http"):
        logger.info(f"Downloading {path_or_url} ...")
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(path_or_url)
            resp.raise_for_status()
            return resp.content
    return Path(path_or_url).read_bytes()


def _decode_rules(props: dict) -> dict:
    """
    Honest partial decode: captures the zone number and transect category,
    but NOT max-unit/density figures — those require the bylaw's
    type-de-milieu tables, not yet sourced. See module docstring.
    """
    return {
        "zone_number":       props.get("NO_ZONE"),
        "type_milieu":       props.get("TYPE_MILIE"),
        "heritage_area":     props.get("PI_TER_PAT") == "Oui",
        "confidence":        "geometry_only",   # no buildable-rules decode yet
    }


async def main(geojson_path: Optional[str]) -> None:
    raw = await _fetch_bytes(geojson_path or GEOJSON_URL)
    data = json.loads(raw)
    logger.info(f"Loaded {len(data['features'])} zone polygons")

    today = date.today().isoformat()
    batch: list[dict] = []
    total = 0

    async with AsyncSessionLocal() as session:
        for feat in data["features"]:
            props = feat["properties"]
            zone_code = str(props.get("TM_ZONE") or props.get("NO_ZONE"))
            geom = shape(feat["geometry"])
            if geom.geom_type == "Polygon":
                geom = MultiPolygon([geom])
            elif geom.geom_type != "MultiPolygon":
                continue

            batch.append({
                "city":            CITY,
                "zone_code":       zone_code,
                "geometry":        from_shape(geom, srid=4326),
                "rules":           _decode_rules(props),
                "raw_data":        {k: v for k, v in props.items()},
                "bylaw_reference": "Code de l'urbanisme (CDU) — Ville de Laval",
                "source_url":      GEOJSON_URL,
                "data_version":    today,
                "is_active":       True,
            })

            if len(batch) >= 200:
                await _flush(session, batch)
                total += len(batch)
                batch = []

        if batch:
            await _flush(session, batch)
            total += len(batch)

        await session.commit()

    logger.info(f"Done — upserted {total} Laval zones")

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(ZoningZone).where(ZoningZone.city == CITY)
        )).scalars().all()
        type_milieux = sorted({z.rules.get("type_milieu") for z in rows if z.rules.get("type_milieu")})
        logger.info(f"zoning_zones now has {len(rows)} rows for {CITY}")
        logger.info(f"Distinct TYPE_MILIE categories found ({len(type_milieux)}): {type_milieux}")


async def _flush(session, batch: list[dict]) -> None:
    stmt = pg_insert(ZoningZone).values(batch)
    stmt = stmt.on_conflict_do_update(
        index_elements=["city", "zone_code"],
        set_={
            "geometry":        stmt.excluded.geometry,
            "rules":           stmt.excluded.rules,
            "raw_data":        stmt.excluded.raw_data,
            "bylaw_reference": stmt.excluded.bylaw_reference,
            "data_version":    stmt.excluded.data_version,
            "is_active":       True,
        },
    )
    await session.execute(stmt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--geojson-path", default=None, help="Local GeoJSON file instead of downloading")
    args = parser.parse_args()

    asyncio.run(main(args.geojson_path))
