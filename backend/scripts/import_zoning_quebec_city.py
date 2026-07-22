"""
Import Quebec City zoning zones + rules into the zoning_zones table.

Data sources (open data, CC-BY 4.0, Ville de Quebec — verified live):
  Polygons: https://www.donneesquebec.ca/recherche/dataset/vque_56           (GeoJSON)
  Rules:    https://www.donneesquebec.ca/recherche/dataset/grille-de-specifications-du-zonage  (XLSX)

Run from backend/ with:  python scripts/import_zoning_quebec_city.py
Options:
  --geojson-path PATH   use a local GeoJSON file instead of downloading
  --grille-path PATH    use a local XLSX file instead of downloading

NOTE ON CONFIDENCE: this importer decodes what Quebec City's own grid makes
unambiguous (bylaw reference, amendment date, which housing-use classes
H1-H4 are listed for a zone). It does NOT yet claim exact max-unit numbers —
the full column legend needs to be confirmed against the city's own grid
documentation before we surface a specific "up to N units" figure. Every
raw column value is preserved in raw_data so rules can be re-decoded later
without re-downloading.
"""
import argparse
import asyncio
import io
import json
import logging
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_zoning_quebec_city")

import httpx
import openpyxl
from geoalchemy2.shape import from_shape
from shapely.geometry import shape, MultiPolygon
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models.zoning import ZoningZone

CITY = "quebec_city"
GEOJSON_URL = (
    "https://www.donneesquebec.ca/recherche/dataset/a56dfef1-ad07-4b21-9ef7-24a0c553a085/"
    "resource/8108e324-503f-4a10-9107-ea556fdc883d/download/vdq-zonagemunicipalzones.geojson"
)
GRILLE_URL = "https://carte.ville.quebec.qc.ca/DonneesOuvertes/vdq-zonage-grille.xlsx"

# Column layout of the "Modifications" sheet in the grille XLSX.
# Confirmed by inspecting real rows — see module docstring for confidence caveat.
USE_BLOCK_COLUMNS = {
    "H1": slice(4, 17),   # single-household
    "H2": slice(17, 26),  # duplex
    "H3": slice(26, 34),  # triplex
    "H4": slice(34, 35),  # multi-unit
}


def _json_safe(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


async def _fetch_bytes(path_or_url: str) -> bytes:
    if path_or_url.startswith("http"):
        logger.info(f"Downloading {path_or_url} ...")
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(path_or_url)
            resp.raise_for_status()
            return resp.content
    return Path(path_or_url).read_bytes()


def _load_grille(raw: bytes) -> dict[str, tuple]:
    """zone_code -> raw row tuple, from the 'Modifications' sheet."""
    wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True)
    ws = wb["Modifications"]
    rows: dict[str, tuple] = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < 5:
            continue  # header rows
        zone_code = row[0]
        if zone_code:
            rows[str(zone_code)] = row
    return rows


def _decode_rules(row: Optional[tuple]) -> dict:
    if not row:
        return {"confidence": "no_grid_row"}
    allowed_uses = [
        name for name, sl in USE_BLOCK_COLUMNS.items()
        if any(v is not None for v in row[sl])
    ]
    return {
        "bylaw_reference": row[1],
        "last_amended":    _json_safe(row[2]),
        "dominant_class":  row[3],
        "allowed_uses":    allowed_uses,
        # Honest: raw values are captured but not yet mapped to a specific
        # "max_units" figure — see module docstring.
        "confidence":      "partial_decode",
    }


async def main(geojson_path: Optional[str], grille_path: Optional[str]) -> None:
    geojson_raw = await _fetch_bytes(geojson_path or GEOJSON_URL)
    grille_raw  = await _fetch_bytes(grille_path or GRILLE_URL)

    zones_data  = json.loads(geojson_raw)
    grille_rows = _load_grille(grille_raw)
    logger.info(f"Loaded {len(zones_data['features'])} zone polygons, {len(grille_rows)} grid rows")

    today = date.today().isoformat()
    inserted = updated = skipped = 0
    batch: list[dict] = []

    async with AsyncSessionLocal() as session:
        for feat in zones_data["features"]:
            zone_code = str(feat["properties"]["ID"])
            geom = shape(feat["geometry"])
            if geom.geom_type == "Polygon":
                geom = MultiPolygon([geom])
            elif geom.geom_type != "MultiPolygon":
                skipped += 1
                continue

            grid_row = grille_rows.get(zone_code)
            rules = _decode_rules(grid_row)
            raw_data = {"columns": [_json_safe(v) for v in grid_row]} if grid_row else None

            batch.append({
                "city":            CITY,
                "zone_code":       zone_code,
                "geometry":        from_shape(geom, srid=4326),
                "rules":           rules,
                "raw_data":        raw_data,
                "bylaw_reference": rules.get("bylaw_reference"),
                "source_url":      GEOJSON_URL,
                "data_version":    today,
                "is_active":       True,
            })

            if len(batch) >= 200:
                inserted, updated = await _flush(session, batch, inserted, updated)
                batch = []

        if batch:
            inserted, updated = await _flush(session, batch, inserted, updated)

        await session.commit()

    logger.info(f"Done — inserted={inserted} updated={updated} skipped={skipped}")

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(ZoningZone).where(ZoningZone.city == CITY)
        )).scalars().all()
        with_housing = sum(1 for z in rows if z.rules.get("allowed_uses"))
        logger.info(f"zoning_zones now has {len(rows)} rows for {CITY}, {with_housing} with a decoded housing use")


async def _flush(session, batch: list[dict], inserted: int, updated: int) -> tuple[int, int]:
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
    return inserted + len(batch), updated  # exact insert/update split not tracked at batch level


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--geojson-path", default=None, help="Local GeoJSON file instead of downloading")
    parser.add_argument("--grille-path",  default=None, help="Local XLSX file instead of downloading")
    args = parser.parse_args()

    asyncio.run(main(args.geojson_path, args.grille_path))
