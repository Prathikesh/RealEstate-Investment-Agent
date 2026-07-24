"""
Import Montréal's property-assessment roll into assessment_parcels — the
authoritative lot area + current dwelling count, matched to listings by address.

Montréal doesn't publish the roll as the standard RL-format XML (that's how
Laval is imported); it publishes "Unités d'évaluation foncière" via its open-data
CKAN datastore. scripts/pull_montreal_roll (the sibling puller) pages that
datastore into a local JSONL; this script loads it, keys each record the SAME
way the matcher does (services.quebec_address), and bulk-COPYs into
assessment_parcels with city='montreal'.

Fields used (Montréal datastore columns):
  CIVIQUE_DEBUT       civic number        NOM_RUE            street (has a
  NOMBRE_LOGEMENT     dwellings                              "(MTL)" borough
  SUPERFICIE_TERRAIN  lot area (m²)                          suffix — stripped)
  ANNEE_CONSTRUCTION  year built

On collision (condos share a civic address, each a tiny land share) the record
with the LARGEST lot area is kept — that's the real land parcel — matching the
Laval importer's rule.

Run from backend/ (DATABASE_URL must allow INSERT on assessment_parcels):
  python scripts/import_montreal_assessment.py [path/to/assessment_roll.jsonl]
"""
import asyncio
import json
import logging
import os
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_montreal_assessment")

import asyncpg

from app.config import settings
from app.services.quebec_address import roll_match_key

CITY = "montreal"
ROLL_YEAR = "2024"
SOURCE_URL = "https://donnees.montreal.ca/dataset/unites-evaluation-fonciere"

_PAREN_SUFFIX = re.compile(r"\s*\([^)]*\)\s*$")  # trailing "(MTL)" / "(SLR)" / …


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_roll(path: str) -> dict[str, dict]:
    """match_key -> {lot_area_m2, num_dwellings, year_built}, largest-lot wins."""
    best: dict[str, dict] = {}
    rows = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            civic = str(rec.get("CIVIQUE_DEBUT") or "").strip()
            street = _PAREN_SUFFIX.sub("", str(rec.get("NOM_RUE") or "")).strip()
            key = roll_match_key(civic, street)
            if not key:
                continue
            rows += 1
            lot = _num(rec.get("SUPERFICIE_TERRAIN"))
            dwell = _num(rec.get("NOMBRE_LOGEMENT"))
            year = _num(rec.get("ANNEE_CONSTRUCTION"))
            cur = best.get(key)
            if cur is None or (lot or 0) > (cur["lot_area_m2"] or 0):
                best[key] = {
                    "lot_area_m2": lot,
                    "num_dwellings": int(dwell) if dwell else None,
                    "year_built": int(year) if year else None,
                }
    logger.info(f"Parsed {rows:,} addressable rows -> {len(best):,} unique parcels")
    return best


async def main(path: str) -> None:
    parcels = parse_roll(path)
    records = [
        (uuid.uuid4(), CITY, key, p["lot_area_m2"], p["num_dwellings"],
         None, p["year_built"], ROLL_YEAR, SOURCE_URL)
        for key, p in parcels.items()
    ]

    dsn = os.getenv("DATABASE_URL", settings.database_url).replace("+asyncpg", "")
    conn = await asyncpg.connect(dsn)
    try:
        deleted = await conn.execute("DELETE FROM assessment_parcels WHERE city = $1", CITY)
        logger.info(f"Cleared existing {CITY} rows ({deleted})")
        await conn.copy_records_to_table(
            "assessment_parcels",
            records=records,
            columns=["id", "city", "match_key", "lot_area_m2", "num_dwellings",
                     "frontage_m", "year_built", "roll_year", "source_url"],
        )
        total = await conn.fetchval("SELECT count(*) FROM assessment_parcels WHERE city = $1", CITY)
        logger.info(f"Imported — assessment_parcels now has {total:,} rows for {CITY}")
    finally:
        await conn.close()


if __name__ == "__main__":
    default = str(Path(__file__).parent.parent / "data" / "montreal" / "assessment_roll.jsonl")
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else default))
