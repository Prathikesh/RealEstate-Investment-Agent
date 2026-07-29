"""
Offline geocoder backed by official Quebec address points.

Zoning is matched by point-in-polygon, so a listing needs coordinates. Realtor.ca
ships them; Centris/ReMax don't. This looks a listing's address up in a compact,
prebuilt index of official municipal address points (civic+street -> lat/lng) —
free, accurate, no rate limits, and available to the scheduled pipeline on the
server (unlike a rate-limited web geocoder).

Index file: data/geocode/mtl_address_index.tsv.gz  (built by
scripts/build_address_index or the geocode pull scripts). Keyed with the same
quebec_address.roll_match_key used everywhere else.
"""
import gzip
import logging
from pathlib import Path
from typing import Optional

from app.services.quebec_address import full_address_match_key

logger = logging.getLogger(__name__)

_INDEX_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "geocode" / "mtl_address_index.tsv.gz"

_index: Optional[dict[str, tuple[float, float]]] = None


def _load() -> dict[str, tuple[float, float]]:
    global _index
    if _index is not None:
        return _index
    idx: dict[str, tuple[float, float]] = {}
    try:
        with gzip.open(_INDEX_PATH, "rt", encoding="utf-8") as fh:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) != 3:
                    continue
                key, lat, lng = parts
                try:
                    idx[key] = (float(lat), float(lng))
                except ValueError:
                    continue
        logger.info(f"address_index: loaded {len(idx):,} points from {_INDEX_PATH.name}")
    except FileNotFoundError:
        logger.warning(f"address_index: {_INDEX_PATH} not found — offline geocoding disabled")
    _index = idx
    return idx


def geocode_address(full_address: Optional[str]) -> Optional[tuple[float, float]]:
    """Return (lat, lng) for a free-text address via the official address index, or None."""
    key = full_address_match_key(full_address or "")
    if not key:
        return None
    return _load().get(key)
