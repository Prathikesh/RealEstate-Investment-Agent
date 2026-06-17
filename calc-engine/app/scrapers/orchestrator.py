"""
Scraper Orchestrator — decides which scrapers to run for a given location
and assembles all results into a list[ScrapedRate].

Runs global scrapers (Welcome Tax, GST, QST, CMHC) once per process lifetime
and municipality/school board scrapers per location.

All scrapers are run synchronously (ScrapFly SDK is sync).
Failures in one scraper never stop the others.
"""
import json
from datetime import datetime, timezone

from app.scrapers.base import ScrapedRate
from app.scrapers.sources.cmhc import CMHCScraper
from app.scrapers.sources.cra import CRAScraper
from app.scrapers.sources.generic_municipality import GenericMunicipalityScraper
from app.scrapers.sources.laval import LavalScraper
from app.scrapers.sources.legisquebec import LegisquebecScraper
from app.scrapers.sources.longueuil import LongueuilScraper
from app.scrapers.sources.montreal import MontrealScraper
from app.scrapers.sources.quebec_city import QuebecCityScraper
from app.scrapers.sources.revenu_quebec import RevenuQuebecScraper
from app.scrapers.sources.school_boards.csdm import CSDMScraper
from app.scrapers.sources.school_boards.emsb import EMSBScraper
from app.scrapers.sources.school_boards.generic_board import GenericBoardScraper

# Map municipality_code → scraper class (dedicated scrapers)
MUNICIPALITY_SCRAPERS: dict = {
    "MTL": MontrealScraper,
    "QC": QuebecCityScraper,
    "LAV": LavalScraper,
    "LNG": LongueuilScraper,
}

# Map school_board_code → scraper class
SCHOOL_BOARD_SCRAPERS: dict = {
    "CSDM": CSDMScraper,
    "EMSB": EMSBScraper,
}


def scrape_for_location(municipality_code: str, school_board_code: str) -> list[ScrapedRate]:
    """
    Runs all relevant scrapers for the given location.
    Returns all ScrapedRate objects (successes and failures mixed).
    Failed scrapers return ScrapedRate with fallback values, never raise.
    """
    results: list[ScrapedRate] = []

    # 1. Global rates (same for all Quebec properties)
    for ScraperClass in [LegisquebecScraper, CRAScraper, RevenuQuebecScraper, CMHCScraper]:
        try:
            scraper = ScraperClass()
            results.extend(scraper.scrape())
        except Exception as e:
            results.append(ScrapedRate.failure("global", "", str(e)))

    # 2. Municipal mill rate
    muni_code = municipality_code.upper()
    if muni_code in MUNICIPALITY_SCRAPERS:
        try:
            scraper = MUNICIPALITY_SCRAPERS[muni_code]()
            rates = scraper.scrape()
            # Tag with municipality code
            for r in rates:
                r.rate_type = "municipal_mill"
            results.extend(rates)
        except Exception as e:
            results.append(ScrapedRate.failure("municipal_mill", "", str(e)))
    else:
        # Use generic scraper with registry entry
        try:
            scraper = GenericMunicipalityScraper(muni_code)
            results.extend(scraper.scrape())
        except Exception as e:
            results.append(ScrapedRate.failure("municipal_mill", "", str(e)))

    # 3. School board rate
    board_code = school_board_code.upper()
    if board_code in SCHOOL_BOARD_SCRAPERS:
        try:
            scraper = SCHOOL_BOARD_SCRAPERS[board_code]()
            results.extend(scraper.scrape())
        except Exception as e:
            results.append(ScrapedRate.failure("school_tax", "", str(e)))
    else:
        # Generic board — try to find URL in municipality_sources.json
        try:
            import json
            from pathlib import Path
            sources_path = Path(__file__).parent.parent.parent / "data" / "municipality_sources.json"
            with open(sources_path) as f:
                registry = json.load(f)
            board_entry = registry.get("school_boards", {}).get(board_code, {})
            url = board_entry.get("school_tax_url", "")
            scraper = GenericBoardScraper(board_code, url)
            results.extend(scraper.scrape())
        except Exception as e:
            results.append(ScrapedRate.failure("school_tax", "", str(e)))

    return results


def group_results(rates: list[ScrapedRate]) -> dict[str, ScrapedRate]:
    """
    Return dict keyed by rate_type with the best (non-error) result per type.
    If only errored results exist for a type, return the last one anyway.
    """
    grouped: dict[str, ScrapedRate] = {}
    for rate in rates:
        key = rate.rate_type
        if key not in grouped or (not rate.error and grouped[key].error):
            grouped[key] = rate
    return grouped
