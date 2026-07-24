"""
Import Montréal's citywide development-potential data into zoning_zones.

Source: Ville de Montréal — "Niveaux d'intensification urbaine, seuils minimaux
moyens de densité nette et affectation du sol" (Plan d'urbanisme et de mobilité
2050 / règlement 24-017, IN FORCE since 2025-06-16). This REPLACES the old Plan
d'urbanisme (04-047), which was abrogated the same day — we deliberately use
only the current plan.

Unlike Laval's form-based code (clean per-lot rules), Montréal's precise limits
live in 19 separate borough zoning bylaws. What IS available citywide, and
official, is the master-plan layer:
  • Affectatio  — land use (Résidentiel / Mixte / Conservation / …)
  • Niv_txt     — urban-intensification level (Douce / Intermédiaire / Élevée)
  • Densite     — minimum average NET density, in dwellings per hectare (5–400),
                  which the plan applies ONLY in residential & mixed areas.

So the Montréal estimate is planning-grade: units ≈ lot(ha) × density target.
It is framed in the UI as a city planning target, not a per-lot permit.

Geometry is EPSG:32188 (MTM zone 8); we reproject to 4326 in PostGIS via
ST_Transform (no local pyproj needed).

Run from backend/:  python scripts/import_montreal_pum.py [path/to/geojson]
Idempotent — clears existing city='montreal' zones first.
"""
import asyncio
import json
import logging
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_montreal_pum")

from sqlalchemy import text

from app.database import AsyncSessionLocal

SRID_SOURCE = 32188  # NAD83 / MTM zone 8 (Montréal open data)
DATASET_URL = ("https://www.donneesquebec.ca/recherche/dataset/"
               "vmtl-niveaux-intensification-urbaine-densite-affectation-sol-pum-2050")
DATA_VERSION = "PUM 2050 (rglt 24-017, en vigueur 2025-06-16)"
PLAN_NAME = "Plan d'urbanisme et de mobilité 2050"

RESIDENTIAL_AFFECTATIONS = {"Résidentiel", "Mixte"}

INSERT_SQL = text("""
    INSERT INTO zoning_zones
        (id, city, zone_code, geometry, rules, raw_data,
         bylaw_reference, source_url, data_version, is_active)
    VALUES
        (:id, 'montreal', :zone_code,
         ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom), :srid), 4326)),
         CAST(:rules AS jsonb), CAST(:raw AS jsonb),
         :bylaw, :src, :ver, true)
""")


def build_rules(props: dict) -> dict:
    affect = (props.get("Affectatio") or "").strip()
    is_res = affect in RESIDENTIAL_AFFECTATIONS
    niv_txt = (props.get("Niv_txt") or "").strip() or None
    if niv_txt == "Non applicable":
        niv_txt = None
    density = props.get("Densite")
    density = float(density) if density else None

    return {
        "method": "density_target",
        "affectation": affect or None,
        "is_residential": is_res,
        "intensification": niv_txt,
        "intensification_code": int(props.get("NiveauINT") or 0) or None,
        # density only meaningful in residential/mixed areas per the plan
        "density_per_ha": density if (is_res and density) else None,
        "confidence": "official",
        "plan_name": PLAN_NAME,
        "type_milieu": affect or None,
    }


async def main(path: str) -> None:
    data = json.loads(Path(path).read_text())
    feats = data.get("features", [])
    logger.info(f"Loaded {len(feats)} PUM 2050 features from {path}")

    async with AsyncSessionLocal() as session:
        deleted = (await session.execute(
            text("DELETE FROM zoning_zones WHERE city = 'montreal'")
        )).rowcount
        if deleted:
            logger.info(f"Cleared {deleted} existing Montréal zones")

        inserted = 0
        for i, f in enumerate(feats):
            geom = f.get("geometry")
            if not geom:
                continue
            rules = build_rules(f.get("properties") or {})
            await session.execute(INSERT_SQL, {
                "id": uuid.uuid4(),
                "zone_code": f"PUM{i:04d}",
                "geom": json.dumps(geom),
                "srid": SRID_SOURCE,
                "rules": json.dumps(rules),
                "raw": json.dumps(f.get("properties") or {}),
                "bylaw": "PUM 2050 — carte 2-11 (densité) / 5-1 (affectation)",
                "src": DATASET_URL,
                "ver": DATA_VERSION,
            })
            inserted += 1
            if inserted % 200 == 0:
                logger.info(f"  … {inserted} inserted")

        await session.commit()

        # sanity: distribution
        rows = (await session.execute(text("""
            SELECT rules->>'affectation' AS affect,
                   count(*) AS n,
                   count(*) FILTER (WHERE (rules->>'density_per_ha') IS NOT NULL) AS with_density
            FROM zoning_zones WHERE city='montreal'
            GROUP BY 1 ORDER BY n DESC
        """))).all()
        logger.info(f"Inserted {inserted} Montréal zones. By affectation:")
        for r in rows:
            logger.info(f"  {r.affect or '(none)':<24} {r.n:>4}  (with density: {r.with_density})")


if __name__ == "__main__":
    default = str(Path(__file__).parent.parent / "data" / "montreal" / "pum2050_intens_affect.geojson")
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else default))
