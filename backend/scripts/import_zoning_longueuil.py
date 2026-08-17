"""
Import Longueuil-agglomeration zoning into the zoning_zones table.

Unlike Laval (whose buildable grid is 403-blocked) this is fully open:

  1. GEOMETRY + zone code — Ville de Longueuil ArcGIS REST (public, no key):
       …/Urbanisme/Urbanisme_et_Amenagement/MapServer/21  ("Zonage")
     One service covers the WHOLE agglomeration via GROUPEUSAGE:
       VLO Vieux-Longueuil · STH Saint-Hubert · GPK Greenfield Park  → city "longueuil"
       BRO Brossard · BOU Boucherville · STL Saint-Lambert · STB Saint-Bruno
     → so this single importer lights up Longueuil AND Brossard (two of the
       client's requested cities) plus five bonus South-Shore suburbs.

  2. BUILDABLE RULES — per-zone "grille des usages et normes" PDF, linked from
     each polygon (DISPOSITIONSPECIALE). These are TEXT PDFs on one consistent
     template (règlement VL-2025-839 for Longueuil), so `pdftotext -layout` +
     a single parser decodes every zone into our normalized rules schema:
       max_units  ← "Nombre de logements par bâtiment" (max)
       max_storeys ← "Hauteur en étage" (max)
       max_coverage_pct ← "Coefficient d'emprise au sol" (max)
       allowed_uses ← checked usage classes (H1…, C1…, I1…, P1…, A1…)
     Which feeds agent/buildable.py exactly like Laval/Montréal:
       non-residential            → tier_cap 0
       residential + explicit max → tier_cap = max units (use_permission)
       residential, open-ended    → tier_cap None → envelope (coverage × storeys)

Run from backend/ (DRY-RUN by default — prints, never writes):
    python scripts/import_zoning_longueuil.py --limit 30        # sample-decode 30 zones
    python scripts/import_zoning_longueuil.py --commit          # full load into zoning_zones

Requires `pdftotext` (poppler) on PATH.
"""
import argparse
import asyncio
import json
import logging
import re
import subprocess
import sys
import tempfile
import unicodedata
from datetime import date
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("import_zoning_longueuil")

import httpx
from geoalchemy2.shape import from_shape
from shapely.geometry import shape, MultiPolygon
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models.zoning import ZoningZone

ARC_BASE = ("https://gociteweb.longueuil.quebec/arcgis/rest/services/"
            "Urbanisme/Urbanisme_et_Amenagement/MapServer/21")
GRILLE_URL = "https://gociteweb.longueuil.quebec/hotlink/Logo/Zonage/{groupe}/{zone}.pdf"

GROUPE_TO_CITY = {
    "VLO": "longueuil", "STH": "longueuil", "GPK": "longueuil",
    "BRO": "brossard", "BOU": "boucherville", "STL": "saint-lambert",
    "STB": "saint-bruno-de-montarville",
}

# The agglomeration shares ONE geometry service, but each city's grille PDF uses
# its own template. parse_grille() is validated ONLY against Longueuil's template
# (VL-2025-839 — boroughs VLO/STH/GPK). Others (Brossard uses "7b. Nombre de
# logements max." numbered fields, etc.) each need their own parser before load,
# so we don't silently write mis-decoded rules. Add a groupe here once its
# template is supported.
TEMPLATE_A_GROUPES = {"VLO", "STH", "GPK"}   # → city "longueuil"

# Usage-class rows we look for in the grille (group prefix → residential?)
USE_CLASSES = (
    [f"H{i}" for i in range(1, 8)] + [f"C{i}" for i in range(1, 7)] +
    [f"I{i}" for i in range(1, 6)] + [f"P{i}" for i in range(1, 8)] +
    [f"A{i}" for i in range(1, 5)]
)
CHECK_RE = re.compile(r"[✔✓☑√]")


def _norm(s: str) -> str:
    """lower + strip accents, for tolerant label matching."""
    return "".join(c for c in unicodedata.normalize("NFD", s.lower())
                   if unicodedata.category(c) != "Mn")


def _line_max(line: str) -> Optional[float]:
    """Grille rows carry SEVERAL columns (one per permitted usage group), each an
    independent 'min/max' pair — e.g. logements '1/2 1/2 3/3 3/3 4/8' means the
    zone permits up to 8 units under its multifamilial group. Development
    potential = the LEAST restrictive column, so we take the max of every 'max'.
    Ignores the '(min/max)' label. French comma decimals."""
    body = re.sub(r"\(min\s*/\s*max\)", "", line)
    maxes = [float(m.group(2).replace(",", "."))
             for m in re.finditer(r"(\d+(?:[.,]\d+)?)?\s*/\s*(\d+(?:[.,]\d+)?)?", body)
             if m.group(2)]
    return max(maxes) if maxes else None


def parse_grille(text: str) -> dict:
    """Decode one grille-des-usages-et-normes PDF (as -layout text)."""
    lines = text.splitlines()
    out: dict = {"allowed_uses": [], "reglement": None, "structure": None,
                 "max_units": None, "max_storeys": None, "max_coverage_pct": None,
                 "max_density_per_ha": None}

    for raw in lines:
        line = raw.rstrip()
        n = _norm(line)

        if "numero de reglement" in n:
            mm = re.search(r":\s*([A-Za-z0-9\-]+)", line)
            if mm:
                out["reglement"] = mm.group(1)

        # permitted usage classes — a class row bearing a check mark
        for code in USE_CLASSES:
            if re.search(rf"\b{code}\s*:", line) and CHECK_RE.search(line):
                if code not in out["allowed_uses"]:
                    out["allowed_uses"].append(code)

        if n.strip().startswith("structure"):
            tail = line.split("Structure", 1)[-1].strip()
            out["structure"] = tail or out["structure"]
        if "hauteur en etage" in n:
            out["max_storeys"] = _line_max(line)
        if "nombre de logements par batiment" in n:
            out["max_units"] = _line_max(line)
        if "coefficient d'emprise au sol" in n or "coefficient d emprise au sol" in n:
            cov = _line_max(line)
            out["max_coverage_pct"] = round(cov * 100, 1) if cov is not None else None
        if "densite residentielle nette" in n:
            out["max_density_per_ha"] = _line_max(line)

    return out


def decode_rules(zone: str, groupe: str, parsed: dict, pdf_url: str) -> dict:
    """Map a parsed grille into the normalized rules schema buildable.py reads."""
    uses = parsed["allowed_uses"]
    is_residential = any(u.startswith("H") for u in uses)
    structure = parsed.get("structure") or ""

    if not is_residential:
        tier_cap: Optional[int] = 0                 # non_residential
    elif parsed["max_units"] is not None:
        tier_cap = int(parsed["max_units"])         # use_permission (explicit cap)
    else:
        tier_cap = None                             # open-ended → envelope

    return {
        "zone_code":        zone,
        "groupe_usage":     groupe,
        "tier_cap":         tier_cap,
        "max_units":        parsed["max_units"],
        "max_storeys":      parsed["max_storeys"],
        "max_coverage_pct": parsed["max_coverage_pct"],
        "density_per_ha":   parsed["max_density_per_ha"],
        "allowed_uses":     uses,
        "is_residential":   is_residential,
        "is_open_ended":    is_residential and parsed["max_units"] is None,
        "structure":        structure or None,
        "contigu_permitted": "contigu" in _norm(structure),
        "type_milieu":      uses[0] if uses else None,
        "confidence":       "official" if uses or tier_cap == 0 else "geometry_only",
        "grille_reglement": parsed.get("reglement"),
        "source_pdf":       pdf_url,
    }


async def fetch_features(client: httpx.AsyncClient, limit: Optional[int]) -> list[dict]:
    """Paginated GeoJSON pull of layer 21 (zone code + groupe + geometry, WGS84)."""
    feats: list[dict] = []
    offset, page = 0, 1000
    while True:
        r = await client.get(f"{ARC_BASE}/query", params={
            "where": "1=1",
            "outFields": "ZONAGEMUNICIPALID,GROUPEUSAGE,DISPOSITIONSPECIALE",
            "outSR": 4326, "f": "geojson",
            "resultOffset": offset, "resultRecordCount": page,
        })
        r.raise_for_status()
        chunk = r.json().get("features", [])
        feats.extend(chunk)
        logger.info(f"  fetched {len(feats)} polygons…")
        if len(chunk) < page or (limit and len(feats) >= limit):
            break
        offset += page
    return feats[:limit] if limit else feats


async def fetch_grille_text(client: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        r = await client.get(url)
        if r.status_code != 200 or not r.content:
            return None
        with tempfile.NamedTemporaryFile(suffix=".pdf") as tf:
            tf.write(r.content); tf.flush()
            res = subprocess.run(["pdftotext", "-layout", tf.name, "-"],
                                 capture_output=True, text=True, timeout=30)
            return res.stdout if res.returncode == 0 else None
    except Exception as exc:
        logger.warning(f"  grille fetch/parse failed for {url}: {exc}")
        return None


async def main(limit: Optional[int], commit: bool) -> None:
    today = date.today().isoformat()
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        logger.info("Fetching zoning polygons from Longueuil ArcGIS REST…")
        features = await fetch_features(client, limit)
        logger.info(f"Got {len(features)} polygons; decoding grilles…")

        rows: list[dict] = []
        stats = {"residential": 0, "non_res": 0, "open_ended": 0,
                 "grille_ok": 0, "grille_missing": 0, "deferred_other_template": 0,
                 "by_city": {}}
        seen: set[tuple[str, str]] = set()

        for i, feat in enumerate(features, 1):
            props = feat.get("properties", {})
            zone = props.get("ZONAGEMUNICIPALID")
            groupe = props.get("GROUPEUSAGE")
            geom = feat.get("geometry")
            if not zone or not groupe or not geom:
                continue
            # Only load cities whose grille template parse_grille() is validated;
            # others are counted and skipped until their parser exists.
            if groupe not in TEMPLATE_A_GROUPES:
                stats["deferred_other_template"] += 1
                continue
            city = GROUPE_TO_CITY.get(groupe, "longueuil")
            if (city, zone) in seen:      # a zone can be several polygons
                continue
            seen.add((city, zone))

            pdf_url = GRILLE_URL.format(groupe=groupe, zone=zone)
            text = await fetch_grille_text(client, pdf_url)
            if text:
                stats["grille_ok"] += 1
                rules = decode_rules(zone, groupe, parse_grille(text), pdf_url)
            else:
                stats["grille_missing"] += 1
                rules = {"zone_code": zone, "groupe_usage": groupe,
                         "confidence": "geometry_only", "source_pdf": pdf_url}

            stats["by_city"][city] = stats["by_city"].get(city, 0) + 1
            if rules.get("is_residential"): stats["residential"] += 1
            elif rules.get("tier_cap") == 0: stats["non_res"] += 1
            if rules.get("is_open_ended"): stats["open_ended"] += 1

            g = shape(geom)
            if g.geom_type == "Polygon":
                g = MultiPolygon([g])
            elif g.geom_type != "MultiPolygon":
                continue

            rows.append({
                "city": city, "zone_code": zone,
                "geometry": from_shape(g, srid=4326),
                "rules": rules, "raw_data": props,
                "bylaw_reference": (f"Règlement de zonage {rules.get('grille_reglement')}"
                                    if rules.get("grille_reglement") else "Règlement de zonage (agglomération de Longueuil)"),
                "source_url": pdf_url, "data_version": today, "is_active": True,
            })
            if i % 25 == 0:
                logger.info(f"  decoded {i}/{len(features)}")

    # ---- report (always) ----
    logger.info("── decode summary ──")
    logger.info(f"  zones: {len(rows)} | grille decoded: {stats['grille_ok']} | "
                f"grille missing: {stats['grille_missing']} | "
                f"deferred (other city template): {stats['deferred_other_template']}")
    logger.info(f"  residential: {stats['residential']} | non-residential: {stats['non_res']} "
                f"| open-ended: {stats['open_ended']}")
    logger.info(f"  by city: {stats['by_city']}")
    for r in rows[:8]:
        rr = r["rules"]
        logger.info(f"  e.g. {r['city']}/{rr['zone_code']}: uses={rr.get('allowed_uses')} "
                    f"tier_cap={rr.get('tier_cap')} storeys={rr.get('max_storeys')} "
                    f"cov={rr.get('max_coverage_pct')} units={rr.get('max_units')}")

    if not commit:
        logger.info("DRY-RUN — nothing written. Re-run with --commit to load zoning_zones.")
        return

    async with AsyncSessionLocal() as session:
        for j in range(0, len(rows), 200):
            batch = rows[j:j + 200]
            stmt = pg_insert(ZoningZone).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["city", "zone_code"],
                set_={"geometry": stmt.excluded.geometry, "rules": stmt.excluded.rules,
                      "raw_data": stmt.excluded.raw_data, "bylaw_reference": stmt.excluded.bylaw_reference,
                      "source_url": stmt.excluded.source_url, "data_version": stmt.excluded.data_version,
                      "is_active": True},
            )
            await session.execute(stmt)
        await session.commit()
    logger.info(f"COMMITTED {len(rows)} zones into zoning_zones.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="only process the first N zones (sampling)")
    ap.add_argument("--commit", action="store_true", help="actually write to zoning_zones (default: dry-run)")
    args = ap.parse_args()
    asyncio.run(main(args.limit, args.commit))
