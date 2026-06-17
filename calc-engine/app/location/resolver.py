"""
Location Resolver — converts a property address/postal code into
municipality_code and school_board_code used by all scrapers and calculators.

Resolution strategy:
1. Use municipality_code_override / school_board_code_override if provided
2. Match on city name (normalized) → municipality registry
3. Match on postal code FSA (first 3 chars) → postal code table
4. Raise LocationNotResolvedError with helpful message
"""
import json
import re
from functools import lru_cache
from pathlib import Path


DATA_DIR = Path(__file__).parent.parent.parent / "data"


class LocationNotResolvedError(Exception):
    pass


@lru_cache(maxsize=1)
def _load_postal_codes() -> dict:
    path = DATA_DIR / "postal_codes_quebec.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_city_index() -> dict:
    """Build a normalized city-name → location dict from the postal code data."""
    data = _load_postal_codes()
    index: dict[str, dict] = {}
    for _fsa, entry in data.items():
        city_key = _normalize(entry.get("city", ""))
        if city_key and city_key not in index:
            index[city_key] = entry
    return index


def _normalize(s: str) -> str:
    """Lowercase, strip accents-adjacent chars, collapse spaces."""
    s = s.lower().strip()
    # Basic accent folding (good enough for Quebec city names)
    replacements = {"é": "e", "è": "e", "ê": "e", "à": "a", "â": "a",
                    "î": "i", "ô": "o", "û": "u", "ç": "c", "ù": "u"}
    for src, dst in replacements.items():
        s = s.replace(src, dst)
    s = re.sub(r"\s+", " ", s)
    return s


def resolve_location(
    postal_code: str,
    city: str,
    municipality_code_override: str | None = None,
    school_board_code_override: str | None = None,
) -> dict:
    """
    Returns:
        {
            "municipality_code": "MTL",
            "municipality_name": "Ville de Montréal",
            "school_board_code": "CSDM",
            "school_board_name": "Commission scolaire de Montréal",
        }

    Raises LocationNotResolvedError if resolution fails.
    """
    # Step 1: Use overrides if both are provided
    if municipality_code_override and school_board_code_override:
        postal_data = _load_postal_codes()
        # Try to get names from data, fall back to codes as names
        names = _find_names(postal_data, municipality_code_override, school_board_code_override)
        return {
            "municipality_code": municipality_code_override.upper(),
            "municipality_name": names.get("municipality_name", municipality_code_override),
            "school_board_code": school_board_code_override.upper(),
            "school_board_name": names.get("school_board_name", school_board_code_override),
        }

    postal_data = _load_postal_codes()

    # Step 2: Postal code FSA lookup (first 3 chars, uppercase)
    fsa = postal_code.replace(" ", "").upper()[:3]
    if fsa in postal_data:
        entry = postal_data[fsa]
        return {
            "municipality_code": entry["municipality_code"],
            "municipality_name": entry["municipality_name"],
            "school_board_code": school_board_code_override or entry["school_board_code"],
            "school_board_name": entry["school_board_name"],
        }

    # Step 3: City name fallback
    city_index = _load_city_index()
    city_key = _normalize(city)
    if city_key in city_index:
        entry = city_index[city_key]
        return {
            "municipality_code": municipality_code_override or entry["municipality_code"],
            "municipality_name": entry["municipality_name"],
            "school_board_code": school_board_code_override or entry["school_board_code"],
            "school_board_name": entry["school_board_name"],
        }

    raise LocationNotResolvedError(
        f"Could not resolve location for postal code '{postal_code}' / city '{city}'. "
        "Please provide 'municipality_code_override' and 'school_board_code_override' in your request."
    )


def _find_names(postal_data: dict, muni_code: str, board_code: str) -> dict:
    """Search postal data for display names matching the given codes."""
    for entry in postal_data.values():
        if entry.get("municipality_code") == muni_code:
            return {
                "municipality_name": entry.get("municipality_name", muni_code),
                "school_board_name": entry.get("school_board_name", board_code),
            }
    return {}
