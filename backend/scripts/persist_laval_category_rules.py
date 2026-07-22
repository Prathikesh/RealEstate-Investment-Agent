"""
Merge coordinate-verified per-category rules (from Laval's Code de l'urbanisme,
Titre 7) into zoning_zones.rules for every Laval zone.

Source: laval_decoded_categories.json — produced by a coordinate-based table
parser that maps each "●" permitted-use marker to its exact column (Isolé /
Jumelé / Contigu) and row (dwelling-count tier) using PDF character positions,
not text flow order. Covers all 19 residential categories (T3.1-T6.5).

"4 logements ou plus" is a floor, not a hard ceiling — the true maximum is
governed by separate density norms not yet extracted, so is_open_ended=True
signals that max_units is a minimum, not a cap, wherever it's set.

Run from backend/ with:  python scripts/persist_laval_category_rules.py --input PATH
"""
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("persist_laval_category_rules")

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.zoning import ZoningZone


def _build_rule_update(decoded: dict) -> dict:
    top_tier = None
    if decoded.get("permitted_tiers"):
        # Highest dwelling-count tier that has at least one column permitted
        top_tier = max(decoded["permitted_tiers"].keys(), key=len)
    return {
        "max_units":       decoded.get("max_units", 0),
        "is_open_ended":   "4 logements ou plus" in (top_tier or ""),
        "contigu_permitted": decoded.get("contigu_permitted", False),
        "permitted_tiers": decoded.get("permitted_tiers", {}),
        "decode_table_page": decoded.get("table_page"),
        "confidence":      "verified",
    }


async def main(input_path: str) -> None:
    with open(input_path) as f:
        decoded_categories: dict = json.load(f)

    verified = {k: v for k, v in decoded_categories.items() if v.get("confidence") == "verified"}
    logger.info(f"Loaded {len(verified)} verified categories: {sorted(verified.keys())}")

    async with AsyncSessionLocal() as session:
        zones = (await session.execute(
            select(ZoningZone).where(ZoningZone.city == "laval")
        )).scalars().all()
        logger.info(f"{len(zones)} Laval zones in DB")

        updated = skipped = 0
        for zone in zones:
            category = (zone.rules or {}).get("type_milieu")
            if not category or category not in verified:
                skipped += 1
                continue

            new_rules = dict(zone.rules or {})
            new_rules.update(_build_rule_update(verified[category]))
            zone.rules = new_rules
            updated += 1

        await session.commit()
        logger.info(f"Updated {updated} zones with verified category rules, skipped {skipped} (no matching category)")

        # Summary by category
        rows = (await session.execute(
            select(ZoningZone).where(ZoningZone.city == "laval")
        )).scalars().all()
        by_cat: dict[str, int] = {}
        for z in rows:
            if z.rules.get("confidence") == "verified":
                cat = z.rules.get("type_milieu", "?")
                by_cat[cat] = by_cat.get(cat, 0) + 1
        for cat in sorted(by_cat):
            logger.info(f"  {cat}: {by_cat[cat]} zones now verified")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to laval_decoded_categories.json")
    args = parser.parse_args()
    asyncio.run(main(args.input))
