"""
Admin endpoints — manual triggers for scrape + pipeline jobs.
Not protected by auth (internal use only, no external exposure).

POST /api/admin/pipeline  — run AI pipeline on all needs_reanalysis=True properties
POST /api/admin/scrape    — run one scrape cycle immediately
GET  /api/admin/status    — pending count + last analyzed stats
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.agent.pipeline import InvestmentPipeline
from app.models.property import Property

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/status")
async def pipeline_status(db: AsyncSession = Depends(get_db)) -> dict:
    """How many properties are waiting for analysis."""
    pending = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.needs_reanalysis == True)  # noqa: E712
        .where(Property.asking_price.isnot(None))
    ) or 0

    scored = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.score.isnot(None))
    ) or 0

    total = await db.scalar(select(func.count()).select_from(Property)) or 0

    with_brief = await db.scalar(
        select(func.count()).select_from(Property)
        .where(Property.ai_brief_en.isnot(None))
    ) or 0

    return {
        "total_properties": total,
        "pending_analysis": pending,
        "scored": scored,
        "with_ai_brief": with_brief,
        "unscored": total - scored,
    }


@router.post("/pipeline")
async def run_pipeline(
    batch_size: int = 50,
    strategy: str = "both",
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Run the AI pipeline on all properties with needs_reanalysis=True.
    Processes in batches of `batch_size` (default 50).

    This is the same job APScheduler runs automatically — use this to
    trigger it manually without waiting for the scheduler.
    """
    start = datetime.now(timezone.utc)
    logger.info(f"Manual pipeline trigger: batch_size={batch_size} strategy={strategy}")

    total_processed = total_errors = 0
    batches = 0

    pipeline = InvestmentPipeline(db, generate_brief=True)

    while True:
        stats = await pipeline.run_pending(limit=batch_size, strategy=strategy)
        await db.commit()

        total_processed += stats["processed"]
        total_errors    += stats.get("errors", 0)
        batches         += 1

        if stats["processed"] < batch_size:
            break  # no more pending

    elapsed = round((datetime.now(timezone.utc) - start).total_seconds(), 1)
    avg_score = None
    if stats.get("scores"):
        valid = [s for s in stats["scores"] if s is not None]
        if valid:
            avg_score = round(sum(valid) / len(valid), 1)

    return {
        "status": "done",
        "processed": total_processed,
        "errors": total_errors,
        "batches": batches,
        "elapsed_seconds": elapsed,
        "avg_score": avg_score,
    }


@router.post("/scrape")
async def run_scrape() -> dict:
    """Trigger one scrape cycle immediately (runs in background)."""
    import asyncio
    from app.scheduler import scrape_job
    from app.scrape_state import scrape_progress
    if scrape_progress.running:
        return {"status": "already running"}
    asyncio.create_task(scrape_job())
    return {"status": "scrape job started in background"}


@router.get("/scrape-status")
async def scrape_status() -> dict:
    """Live scrape progress — polled every 2s by the frontend status bar."""
    from app.scrape_state import scrape_progress
    return scrape_progress.to_dict()
