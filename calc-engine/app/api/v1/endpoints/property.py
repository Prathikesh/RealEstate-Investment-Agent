"""
POST /api/v1/property/analyze — Main endpoint.

Flow:
1. Resolve location (postal code / city → municipality + school board)
2. Scrape rates from official sources for that location (or use stored rates if fresh)
3. Persist rates to DB + detect changes
4. Run all calculators
5. Return full PropertyOutput
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.calculators.orchestrator import run_all
from app.location.resolver import LocationNotResolvedError, resolve_location
from app.rate_store.change_detector import process_scraped_rates
from app.rate_store.db import get_session
from app.rate_store.repository import get_active_rate
from app.scrapers.orchestrator import group_results, scrape_for_location
from app.scheduler.change_notifier import notify_all_changes
from app.schemas.property_input import PropertyInput
from app.schemas.property_output import PropertyOutput
from app.utils.audit_logger import audit_log

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=PropertyOutput)
def analyze_property(
    prop: PropertyInput,
    session: Session = Depends(get_session),
) -> PropertyOutput:
    """
    Analyze a Quebec property and return all calculated tax and financial values.

    - Location is resolved from postal code / city
    - Tax rates are scraped from official sources on first request, then stored
    - The 3-week scheduler re-checks rates automatically
    - All values include step-by-step breakdowns with source law references
    """
    audit_log("property_analyze_requested", {
        "address": prop.address,
        "city": prop.city,
        "postal_code": prop.postal_code,
        "purchase_price": str(prop.purchase_price),
    })

    # Step 1: Resolve location
    try:
        location = resolve_location(
            postal_code=prop.postal_code,
            city=prop.city,
            municipality_code_override=prop.municipality_code_override,
            school_board_code_override=prop.school_board_code_override,
        )
    except LocationNotResolvedError as e:
        raise HTTPException(status_code=422, detail=str(e))

    muni_code = location["municipality_code"]
    board_code = location["school_board_code"]

    # Step 2: Check if we have fresh rates or need to scrape
    # We always scrape on first request for a new location, or if rates are missing
    existing = get_active_rate(session, muni_code, "welcome_tax_brackets")
    existing_global = get_active_rate(session, "GLOBAL", "welcome_tax_brackets")

    needs_scrape = (existing is None and existing_global is None)

    if needs_scrape:
        logger.info(f"No rates found for {muni_code}. Scraping from official sources...")
        try:
            scraped = scrape_for_location(muni_code, board_code)
            grouped = group_results(scraped)

            # Store global rates under "GLOBAL" key
            global_types = {"welcome_tax_brackets", "gst", "qst", "new_housing_rebate", "cmhc_premiums"}
            global_rates = [r for r in scraped if r.rate_type in global_types]
            local_rates = [r for r in scraped if r.rate_type not in global_types]

            if global_rates:
                changes = process_scraped_rates(session, global_rates, "GLOBAL", "", job_id="on_demand")
                notify_all_changes(changes, "GLOBAL")

            if local_rates:
                changes = process_scraped_rates(session, local_rates, muni_code, board_code, job_id="on_demand")
                notify_all_changes(changes, muni_code)

        except Exception as e:
            logger.warning(f"Scrape failed for {muni_code}: {e}. Proceeding with available data.")

    # Step 3: Run all calculators
    try:
        result = run_all(session=session, prop=prop, location=location)
    except Exception as e:
        logger.error(f"Calculation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")

    audit_log("property_analyze_completed", {
        "municipality_code": muni_code,
        "grand_total_upfront": str(result.grand_total_upfront),
    })

    return result
