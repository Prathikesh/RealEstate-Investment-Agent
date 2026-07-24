"""
Import a Quebec municipal property-assessment roll (rôle d'évaluation foncière)
into the assessment_parcels table — the authoritative source for lot area and
current dwelling count.

Source: donneesquebec.ca "Rôles d'évaluation foncière du Québec" (CC-BY 4.0).
Per-municipality XML files, e.g. RL65005_2026.xml = Laval 2026.
Index of all municipalities: https://donneesouvertes.affmunqc.net/role/indexRole2026.csv

Prescribed fields used (verified against the official Répertoire des
renseignements prescrits, v2.5):
  RL0101Ax civic number · RL0101Gx street name
  RL0302A  superficie du terrain (m²)   RL0311A nombre TOTAL de logements
  RL0301A  mesure frontale (m)          RL0307A année de construction
  RL0306A  nombre maximal d'étages      RL0305A superficie en zone agricole (>0 = ag zone)
NOTE: RL0310A is a construction-GENRE code, NOT a dwelling count — do not use it.

On collision (divided condos share an address), the record with the largest
lot area is kept — that's the real land parcel, not a unit share.

Run from backend/ with (DATABASE_URL must allow INSERT on assessment_parcels):
  DATABASE_URL=<privileged-url> python scripts/import_assessment_roll.py \
      --municipality-code 65005 --city laval [--xml-path /local/RL65005_2026.xml]
"""
import argparse
import asyncio
import logging
import os
import sys
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_assessment_roll")

import asyncpg
import httpx

from app.config import settings
from app.services.quebec_address import roll_match_key

ROLL_BASE = "https://donneesouvertes.affmunqc.net/role"
KEEP = {"RL0101Ax", "RL0101Gx", "RL0302A", "RL0311A", "RL0301A", "RL0307A"}


def _to_float(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def _to_int(v):
    try:
        return int(float(v)) if v not in (None, "") else None
    except ValueError:
        return None


def parse_roll(xml_path: str) -> dict:
    """Stream-parse the roll → {match_key: parcel dict}, keeping max-lot on collisions."""
    out: dict = {}
    cur: dict = {}
    ctx = ET.iterparse(xml_path, events=("end",))
    for _, el in ctx:
        tag = el.tag.split("}")[-1]
        if tag in KEEP:
            cur[tag] = (el.text or "").strip()
        elif tag == "RLUEx":
            key = roll_match_key(cur.get("RL0101Ax", ""), cur.get("RL0101Gx", ""))
            if key:
                lot = _to_float(cur.get("RL0302A")) or 0.0
                prev = out.get(key)
                if prev is None or lot > (prev["lot_area_m2"] or 0):
                    out[key] = {
                        "lot_area_m2":   _to_float(cur.get("RL0302A")),
                        "num_dwellings": _to_int(cur.get("RL0311A")),  # total logements (verified)
                        "frontage_m":    _to_float(cur.get("RL0301A")),
                        "year_built":    _to_int(cur.get("RL0307A")),
                    }
            cur = {}
            el.clear()
    return out


async def _download(url: str, dest: str) -> None:
    logger.info(f"Downloading {url} ...")
    async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in resp.aiter_bytes(1 << 20):
                    f.write(chunk)


async def main(municipality_code: str, city: str, roll_year: str, xml_path: str | None) -> None:
    source_url = f"{ROLL_BASE}/RL{municipality_code}_{roll_year}.xml"
    if not xml_path:
        xml_path = f"/tmp/RL{municipality_code}_{roll_year}.xml"
        await _download(source_url, xml_path)

    logger.info(f"Parsing {xml_path} ...")
    parcels = parse_roll(xml_path)
    logger.info(f"Parsed {len(parcels):,} unique parcels for {city}")

    records = [
        (uuid.uuid4(), city, key, p["lot_area_m2"], p["num_dwellings"],
         p["frontage_m"], p["year_built"], roll_year, source_url)
        for key, p in parcels.items()
    ]

    dsn = os.getenv("DATABASE_URL", settings.database_url).replace("+asyncpg", "")
    conn = await asyncpg.connect(dsn)
    try:
        deleted = await conn.execute("DELETE FROM assessment_parcels WHERE city = $1", city)
        logger.info(f"Cleared existing {city} rows ({deleted})")
        await conn.copy_records_to_table(
            "assessment_parcels",
            records=records,
            columns=["id", "city", "match_key", "lot_area_m2", "num_dwellings",
                     "frontage_m", "year_built", "roll_year", "source_url"],
        )
        total = await conn.fetchval("SELECT count(*) FROM assessment_parcels WHERE city = $1", city)
        logger.info(f"Imported — assessment_parcels now has {total:,} rows for {city}")
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--municipality-code", required=True, help="e.g. 65005 (Laval), 66023 (Montreal)")
    parser.add_argument("--city", required=True, help="our city key, e.g. laval")
    parser.add_argument("--roll-year", default="2026")
    parser.add_argument("--xml-path", default=None, help="local XML file (skips download)")
    args = parser.parse_args()
    asyncio.run(main(args.municipality_code, args.city, args.roll_year, args.xml_path))
