"""
Quebec address normalisation for matching scraped listings to the official
property assessment roll (rôle d'évaluation foncière).

The roll stores addresses as separate fields (civic number, street type, street
name, direction); our scraped listings store a single free-text full_address.
Both sides are reduced to the SAME match key: "<civic>|<street core>", where the
street core is the distinctive part of the name with street-type words, French
articles, and direction tokens removed, deaccented and uppercased.

Both the importer and the matcher MUST use these functions so the keys agree.
"""
import re
import unicodedata
from typing import Optional

# Street-type words + French articles, stripped from the core.
_STREET_TYPES = {
    "rue", "ru", "avenue", "av", "ave", "boulevard", "boul", "bo",
    "montee", "mtee", "mt", "chemin", "ch", "place", "pl", "croissant", "crois",
    "terrasse", "terr", "tsse", "impasse", "imp", "cote", "rang", "allee", "all",
    "cours", "carre", "promenade", "prom", "cercle", "voie", "ile", "domaine",
    "des", "du", "de", "la", "le", "les", "d", "l", "aux", "a",
}
_DIRS = {"e", "o", "n", "s", "est", "ouest", "nord", "sud", "w"}
# Normalise saint / sainte spellings so "Ste-Rose" == "Sainte-Rose".
_SAINT_MAP = {"saint": "ST", "st": "ST", "sainte": "STE", "ste": "STE"}


def deaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def street_core(street: str) -> str:
    """Reduce a street name to its distinctive core token(s), uppercased."""
    s = deaccent(street or "").upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    core: list[str] = []
    for tok in s.split():
        low = tok.lower()
        if low in _SAINT_MAP:
            core.append(_SAINT_MAP[low])
        elif low in _STREET_TYPES or low in _DIRS:
            continue
        else:
            core.append(tok)
    return "".join(core)


def roll_match_key(civic: str, street_name: str) -> Optional[str]:
    """Build the key from the roll's separate civic + street-name fields."""
    civic = (civic or "").strip()
    core = street_core(street_name)
    if not civic or not core:
        return None
    return f"{civic}|{core}"


def full_address_match_key(full_address: str) -> Optional[str]:
    """Build the key from a scraped free-text address ('2100 Rue de Castellane, ...').

    Handles plex civic ranges common in Montréal listings — '4300 - 4302 Av.
    Carlton' or '2305 - 2309, Rue Wurtele' — by keeping the FIRST civic (which
    matches the roll's CIVIQUE_DEBUT) and dropping the '- 4302' so the second
    number doesn't leak into the street core.
    """
    if not full_address:
        return None
    # civic (optionally a '- civic2' range, each civic may carry a letter
    # suffix like '8876A'), optional comma, then street up to next comma.
    m = re.match(r"^\s*(\d+)[A-Za-z]?\s*(?:[-–]\s*\d+[A-Za-z]?)?\s*,?\s+([^,]+)", full_address)
    if not m:
        return None
    civic, street = m.group(1), m.group(2)
    core = street_core(street)
    if not core:
        return None
    return f"{civic}|{core}"
