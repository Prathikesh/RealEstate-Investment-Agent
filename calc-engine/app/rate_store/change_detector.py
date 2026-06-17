"""
Change Detector — compares newly scraped rates to what's stored in the DB.

For each scraped rate:
  1. Load the current active RateRecord for that type + location
  2. Normalize both values (parse as Decimal, compare)
  3. If different:
     a. Deactivate old record
     b. Insert new record (version bumped)
     c. Write ChangeLog entry
     d. Return change description for webhook
  4. Always insert a ScrapeLog entry
"""
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlmodel import Session

from app.scrapers.base import ScrapedRate
from .models import ChangeLog, RateRecord, ScrapeLog
from .repository import (
    deactivate_rate,
    get_active_rate,
    insert_rate,
    log_change,
    log_scrape,
)


def _normalize_value(value: str) -> str:
    """
    Normalize a rate value for comparison.
    For JSON bracket values: sort keys and reserialize.
    For numeric values: parse as Decimal and convert to string.
    """
    stripped = value.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            parsed = json.loads(stripped)
            # Remove version/timestamp fields that change every scrape
            if isinstance(parsed, dict):
                for key in ["source_version", "scraped_at", "note"]:
                    parsed.pop(key, None)
            return json.dumps(parsed, sort_keys=True)
        except Exception:
            return stripped
    try:
        return str(Decimal(stripped))
    except InvalidOperation:
        return stripped


def _bump_version(current_version: str) -> str:
    """Bump patch version: "2025.1" → "2025.2", "2025-fallback" → "2025.1" """
    if "-" in current_version:
        year = current_version.split("-")[0]
        return f"{year}.1"
    try:
        parts = current_version.split(".")
        year = parts[0]
        patch = int(parts[1]) + 1 if len(parts) > 1 else 1
        return f"{year}.{patch}"
    except Exception:
        return f"{current_version}.2"


def process_scraped_rates(
    session: Session,
    scraped_rates: list[ScrapedRate],
    municipality_code: str,
    school_board_code: str,
    job_id: str = "manual",
) -> list[dict]:
    """
    Process a list of scraped rates:
    - Persist each rate (new or updated) to the DB
    - Return a list of change descriptions for any rates that changed

    Returns: list of dicts with {rate_type, old_value, new_value, source_url}
    """
    changes: list[dict] = []
    now = datetime.now(timezone.utc)

    for scraped in scraped_rates:
        t0 = now
        success = scraped.success

        # Log the scrape attempt
        log_scrape(session, ScrapeLog(
            run_at=now,
            municipality_code=municipality_code,
            rate_type=scraped.rate_type,
            source_url=scraped.source_url,
            success=success,
            error_message=scraped.error,
            duration_ms=0,
            job_id=job_id,
        ))

        if not success:
            continue

        # Load existing active record
        existing = get_active_rate(
            session, municipality_code, scraped.rate_type, school_board_code
        )

        new_normalized = _normalize_value(scraped.value)

        if existing is None:
            # First time this rate is recorded — just insert
            insert_rate(session, RateRecord(
                municipality_code=municipality_code,
                school_board_code=school_board_code,
                rate_type=scraped.rate_type,
                value=scraped.value,
                unit=scraped.unit,
                source_url=scraped.source_url,
                source_law=scraped.source_law,
                scraped_at=now,
                data_version=scraped.data_version or "2025.1",
                is_active=True,
            ))
            continue

        old_normalized = _normalize_value(existing.value)

        if old_normalized == new_normalized:
            # No change — just update scraped_at timestamp
            existing.scraped_at = now
            session.add(existing)
            session.commit()
            continue

        # Value changed — deactivate old, insert new
        old_version = existing.data_version
        new_version = _bump_version(old_version)

        deactivate_rate(session, existing)

        insert_rate(session, RateRecord(
            municipality_code=municipality_code,
            school_board_code=school_board_code,
            rate_type=scraped.rate_type,
            value=scraped.value,
            unit=scraped.unit,
            source_url=scraped.source_url,
            source_law=scraped.source_law,
            scraped_at=now,
            data_version=new_version,
            is_active=True,
        ))

        log_change(session, ChangeLog(
            detected_at=now,
            municipality_code=municipality_code,
            rate_type=scraped.rate_type,
            old_value=existing.value,
            new_value=scraped.value,
            old_version=old_version,
            new_version=new_version,
            source_url=scraped.source_url,
            webhook_sent=False,
        ))

        changes.append({
            "rate_type": scraped.rate_type,
            "old_value": existing.value,
            "new_value": scraped.value,
            "old_version": old_version,
            "new_version": new_version,
            "source_url": scraped.source_url,
            "municipality_code": municipality_code,
        })

    return changes
