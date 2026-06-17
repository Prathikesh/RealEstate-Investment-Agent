"""
POST /api/v1/admin/refresh — Trigger a manual rate refresh job.
Useful for testing or forcing an immediate re-scrape without waiting 3 weeks.
"""
from fastapi import APIRouter

from app.scheduler.jobs import run_rate_refresh_job

router = APIRouter()


@router.post("/refresh")
def trigger_refresh():
    """Manually trigger the rate refresh job. Returns job summary."""
    result = run_rate_refresh_job(job_id=f"manual-{__import__('uuid').uuid4().hex[:8]}")
    return result
