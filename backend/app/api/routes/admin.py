"""
Admin endpoints — manual triggers for scrape + pipeline jobs.
Every route on this router requires an authenticated admin (see
app.auth.deps.require_admin) — applied once at the router level so new
routes added here are protected automatically.

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
from app.auth.deps import require_admin
from app.agent.pipeline import InvestmentPipeline
from app.models.property import Property

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


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


@router.post("/backfill-photos")
async def backfill_photos(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Fetch og:image / data-src photos for properties that have none.
    Uses direct httpx (no Scrapfly credits) — works for Centris og:image tags.
    """
    import asyncio
    import httpx
    from bs4 import BeautifulSoup
    from sqlalchemy import update

    stmt = (
        select(Property.id, Property.listing_url, Property.primary_source)
        .where(
            Property.listing_url.isnot(None),
            (Property.photos == None) | (Property.photos == []),  # noqa: E711
        )
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    _HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.centris.ca/",
    }

    updated = failed = 0

    async def fetch_photos(url: str) -> list[str]:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
                resp = await client.get(url, headers=_HEADERS)
            if resp.status_code != 200:
                return []
            soup = BeautifulSoup(resp.text, "html.parser")
            photos: list[str] = []

            # 1. og:image (always in static HTML, no JS needed)
            og = soup.find("meta", property="og:image")
            if og and og.get("content", "").startswith("http"):
                photos.append(og["content"])

            # 2. JSON-LD images
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    import json as _json
                    data = _json.loads(script.string or "")
                    imgs = data.get("image") or []
                    if isinstance(imgs, str):
                        imgs = [imgs]
                    for img in imgs:
                        src = img if isinstance(img, str) else (img.get("url") or img.get("contentUrl") or "")
                        if src.startswith("http") and src not in photos:
                            photos.append(src)
                except Exception:
                    pass

            # 3. data-src / data-lazy-src on img tags (lazy loading)
            for img in soup.select("img[data-src], img[data-lazy-src]"):
                src = img.get("data-src") or img.get("data-lazy-src") or ""
                if src.startswith("http") and not src.endswith(".svg") and src not in photos:
                    photos.append(src)

            return photos[:20]  # cap at 20
        except Exception:
            return []

    tasks = [fetch_photos(row.listing_url) for row in rows]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for row, result in zip(rows, results):
        if isinstance(result, list) and result:
            await db.execute(
                update(Property)
                .where(Property.id == row.id)
                .values(photos=result)
            )
            updated += 1
        else:
            failed += 1

    await db.commit()
    return {
        "checked": len(rows),
        "updated": updated,
        "no_photos_found": failed,
    }
