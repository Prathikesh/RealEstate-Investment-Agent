"""
Build the compact offline geocoder index (data/geocode/mtl_address_index.tsv.gz)
that app/services/address_index.py ships and the pipeline uses to geocode
Centris/ReMax listings. Reads the raw address-point dump pulled by
scripts/pull_montreal_addresses.py and reduces it to `match_key\tlat\tlng`.

Run from backend/:  python scripts/build_address_index.py
"""
import gzip
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.quebec_address import roll_match_key

ROOT = Path(__file__).parent.parent
SRC = ROOT / "data" / "montreal" / "address_points.jsonl"
OUT = ROOT / "data" / "geocode" / "mtl_address_index.tsv.gz"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    idx: dict[str, tuple[float, float]] = {}
    with open(SRC, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            ori = (r.get("ORIENTATION") or "").strip()
            if ori.upper() == "X":
                ori = ""
            street = " ".join(x for x in [r.get("GENERIQUE"), r.get("SPECIFIQUE"), ori] if x).strip()
            key = roll_match_key(str(r.get("ADDR_DE") or "").strip(), street)
            try:
                lat, lng = float(r["LATITUDE"]), float(r["LONGITUDE"])
            except (TypeError, ValueError, KeyError):
                continue
            if key and key not in idx:
                idx[key] = (lat, lng)
    with gzip.open(OUT, "wt", encoding="utf-8") as w:
        for k, (la, ln) in idx.items():
            w.write(f"{k}\t{la:.6f}\t{ln:.6f}\n")
    print(f"Wrote {len(idx):,} address points -> {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
