"""
APScheduler job — re-scrapes all known locations every 3 weeks (21 days).

The job:
1. Loads all distinct (municipality_code, school_board_code) pairs from the DB
2. For each location, runs all scrapers
3. Runs change detection
4. Sends webhook notifications for any changes
5. Logs everything to the audit log

A failure for one location never stops the job — it continues with the next.
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.rate_store.db import engine
from app.rate_store.repository import get_all_active_locations
from app.scrapers.orchestrator import scrape_for_location
from app.rate_store.change_detector import process_scraped_rates
from app.scheduler.change_notifier import notify_all_changes
from app.utils.audit_logger import audit_log
from sqlmodel import Session

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def run_rate_refresh_job(job_id: str = "scheduler") -> dict:
    """
    Main rate refresh job. Can also be triggered manually via API.
    Returns summary of what was checked and what changed.
    """
    started_at = datetime.now(timezone.utc).isoformat()
    logger.info(f"Rate refresh job started [{job_id}]")
    audit_log("job_started", {"job_id": job_id, "started_at": started_at})

    summary = {
        "job_id": job_id,
        "started_at": started_at,
        "locations_checked": 0,
        "locations_failed": 0,
        "total_changes": 0,
        "changes": [],
    }

    with Session(engine) as session:
        locations = get_all_active_locations(session)

    if not locations:
        logger.info("No locations to refresh (empty rate store).")
        summary["message"] = "No locations stored yet. Rates are populated on first property analysis."
        return summary

    for loc in locations:
        muni = loc["municipality_code"]
        board = loc["school_board_code"]
        try:
            scraped = scrape_for_location(muni, board)
            with Session(engine) as session:
                changes = process_scraped_rates(
                    session, scraped, muni, board, job_id=job_id
                )
            notify_all_changes(changes, muni)
            summary["locations_checked"] += 1
            summary["total_changes"] += len(changes)
            summary["changes"].extend(changes)
            logger.info(f"Location {muni}/{board}: {len(changes)} change(s) detected")
        except Exception as e:
            logger.error(f"Job failed for location {muni}/{board}: {e}")
            audit_log("job_location_error", {"municipality_code": muni, "error": str(e)})
            summary["locations_failed"] += 1

    finished_at = datetime.now(timezone.utc).isoformat()
    summary["finished_at"] = finished_at
    audit_log("job_finished", summary)
    logger.info(f"Rate refresh job finished [{job_id}]: {summary['total_changes']} total change(s)")
    return summary


def start_scheduler() -> None:
    """Start the APScheduler with the 3-week interval job."""
    interval_weeks = settings.rate_check_interval_weeks

    scheduler.add_job(
        func=run_rate_refresh_job,
        trigger="interval",
        weeks=interval_weeks,
        id="rate_refresh",
        replace_existing=True,
        kwargs={"job_id": "scheduler"},
    )
    scheduler.start()
    logger.info(f"Scheduler started. Rate refresh every {interval_weeks} week(s).")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")
