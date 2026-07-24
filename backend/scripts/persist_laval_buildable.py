"""
Persist the HONEST buildable model into zoning_zones.rules for Laval zones.

Combines two reliable, verified sources:
  1. Dwelling-permission tiers (decoded per category) — but using ONLY the
     unambiguous "N logement(s)" rows, ignoring the "Habitation (Hx)" rows that
     previously caused an over-count. This yields tier_cap:
        only "1 logement"        -> 1  (single-family zone)
        + "2 ou 3 logements"     -> 3  (up to triplex)
        + "4 logements ou plus"  -> open-ended (envelope governs)
  2. Max lot coverage % and max storeys (clean single-value CDU fields).

For open-ended zones, the actual unit count is estimated per-property from the
official lot area × coverage × storeys (done in the pipeline, not here).

Run from backend/:
  python scripts/persist_laval_buildable.py --tiers PATH --envelope PATH
"""
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("persist_laval_buildable")

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.zoning import ZoningZone


def tier_model(permitted_tiers: dict) -> dict:
    """Derive tier_cap / is_open_ended from ONLY the 'N logement' rows."""
    keys = list(permitted_tiers or {})
    has_1   = any(k.strip().startswith("1 logement") for k in keys)
    has_2_3 = any(k.strip().startswith("2 ou 3") for k in keys)
    has_4   = any(k.strip().startswith("4 logement") for k in keys)
    if has_4:
        return {"tier_cap": None, "is_open_ended": True,  "permits_multiunit": True}
    if has_2_3:
        return {"tier_cap": 3,    "is_open_ended": False, "permits_multiunit": True}
    if has_1:
        return {"tier_cap": 1,    "is_open_ended": False, "permits_multiunit": False}
    return {"tier_cap": 0, "is_open_ended": False, "permits_multiunit": False}  # non-residential


async def main(tiers_path: str, envelope_path: str) -> None:
    tiers = json.load(open(tiers_path))       # {cat: {permitted_tiers, ...}}
    env   = json.load(open(envelope_path))    # {cat: {max_coverage_pct, max_storeys}}

    cat_rules: dict[str, dict] = {}
    for cat, t in tiers.items():
        if t.get("confidence") != "verified":
            continue
        m = tier_model(t.get("permitted_tiers", {}))
        e = env.get(cat, {})
        cat_rules[cat] = {
            **m,
            "max_coverage_pct": e.get("max_coverage_pct"),
            "max_storeys":      e.get("max_storeys"),
            "confidence":       "verified",
        }
    logger.info(f"Built honest rules for {len(cat_rules)} categories")

    async with AsyncSessionLocal() as session:
        zones = (await session.execute(
            select(ZoningZone).where(ZoningZone.city == "laval")
        )).scalars().all()

        updated = 0
        for z in zones:
            cat = (z.rules or {}).get("type_milieu")
            if cat not in cat_rules:
                continue
            new_rules = dict(z.rules or {})
            new_rules.update(cat_rules[cat])
            # remove the old, unreliable direct max_units; the honest number is
            # computed per-property in the pipeline (tier_cap or envelope estimate).
            new_rules.pop("max_units", None)
            z.rules = new_rules
            updated += 1

        await session.commit()
        logger.info(f"Updated {updated} Laval zones with honest buildable rules")

        # quick summary
        by_cat: dict = {}
        for z in zones:
            r = z.rules or {}
            if r.get("type_milieu") in cat_rules:
                c = r["type_milieu"]
                by_cat[c] = (r.get("tier_cap"), r.get("max_coverage_pct"), r.get("max_storeys"))
        for c in sorted(by_cat):
            cap, cov, st = by_cat[c]
            cap_s = "open (envelope)" if cap is None else str(cap)
            logger.info(f"  {c}: cap={cap_s}  coverage={cov}%  storeys={st}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tiers", required=True)
    parser.add_argument("--envelope", required=True)
    args = parser.parse_args()
    asyncio.run(main(args.tiers, args.envelope))
