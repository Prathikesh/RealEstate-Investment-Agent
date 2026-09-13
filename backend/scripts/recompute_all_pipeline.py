"""
PRODUCTION ONE-OFF — re-runs the full InvestmentPipeline (comparables,
FinancialCalculator, scorer, zoning/assessment/constraint matchers, market
benchmark) on EVERY production property, regardless of whether it already
has a score. Purpose: recompute municipal_taxes_annual/welcome_tax (and
everything downstream of them — cap_rate, cash_flow, score) now that
calc_client.py forwards the real assessed value to the calc-engine instead
of silently letting it default to asking_price. Not committed to dev;
deployed as a temporary one-off Railway service pointed at production's
real DATABASE_URL, then torn down once done.

Unlike run_pipeline_production_bulk.py (which only selects score IS NULL —
correct for analyzing newly-scraped properties), this selects ALL
properties ordered by id, paginated with keyset pagination (id > last_seen)
so a property already processed this run is never re-selected even though
its score is no longer NULL afterward.

Same proven patterns as every other bulk script this session: one
long-lived DB session per worker, sentinel-based shutdown, safe to
stop/resume anytime (keyset position is just wherever it's re-run from —
pass RECOMPUTE_RESUME_AFTER as the last-seen id's string form to skip
ahead, otherwise starts from the beginning each run, which is idempotent
so re-running from scratch is only wasted time, not incorrect data).

Usage (set via Railway service variables, not committed anywhere):
    DATABASE_URL=<production private URL>
    PYTHONUNBUFFERED=1
    EXPERIMENT_CONCURRENCY=16   # higher than scrape jobs — no geocoding/HTTP
                                # bottleneck for properties that already have
                                # a location; mostly calc-engine + DB round trips
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from datetime import datetime, timezone

_DB_URL = os.environ.get("DATABASE_URL", "")
if not _DB_URL:
    print("REFUSING TO RUN: DATABASE_URL is not set.")
    sys.exit(1)

from sqlalchemy import select  # noqa: E402

from app.agent.pipeline import InvestmentPipeline  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.property import Property  # noqa: E402

CONCURRENCY = int(os.environ.get("EXPERIMENT_CONCURRENCY", "16"))
BATCH_RELOAD_SIZE = int(os.environ.get("EXPERIMENT_BATCH_SIZE", "500"))
RESUME_AFTER = os.environ.get("RECOMPUTE_RESUME_AFTER", "")


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


async def load_next_batch(after_id, limit: int) -> list:
    async with AsyncSessionLocal() as session:
        stmt = select(Property.id).order_by(Property.id).limit(limit)
        if after_id is not None:
            stmt = stmt.where(Property.id > after_id)
        rows = (await session.execute(stmt)).scalars().all()
        return list(rows)


async def worker(worker_id: int, queue: asyncio.Queue, stats: dict, lock: asyncio.Lock) -> None:
    session = AsyncSessionLocal()
    try:
        while True:
            prop_id = await queue.get()
            if prop_id is None:
                break

            try:
                t0 = time.monotonic()
                prop = await session.get(Property, prop_id)
                if prop is None:
                    continue

                old_muni_tax = prop.municipal_taxes_annual
                old_welcome_tax = prop.welcome_tax

                pipeline = InvestmentPipeline(session, generate_brief=False)
                await pipeline.run(prop, strategy="both", language="en")
                await session.commit()
                elapsed = time.monotonic() - t0

                async with lock:
                    stats["done"] += 1
                    done = stats["done"]
                    if old_muni_tax != prop.municipal_taxes_annual or old_welcome_tax != prop.welcome_tax:
                        stats["tax_changed"] += 1
                if done <= 10 or done % 200 == 0:
                    print(f"  [{_ts()}] [w{worker_id}] ... {done} recomputed "
                          f"(this item: {elapsed:.2f}s, score={prop.score}, "
                          f"muni_tax {old_muni_tax}->{prop.municipal_taxes_annual})")

            except Exception as exc:
                try:
                    await session.rollback()
                except Exception:
                    pass
                async with lock:
                    stats["errors"] += 1
                print(f"  [worker {worker_id}] error for property {prop_id}: {exc}")
                await session.close()
                session = AsyncSessionLocal()
    finally:
        await session.close()


async def main() -> None:
    print(f"=== Production full recompute — concurrency={CONCURRENCY} ===\n")

    stats = {"done": 0, "errors": 0, "tax_changed": 0}
    lock = asyncio.Lock()
    last_id = RESUME_AFTER or None
    if last_id:
        print(f"Resuming after id={last_id}\n")

    while True:
        pending = await load_next_batch(last_id, BATCH_RELOAD_SIZE)
        if not pending:
            break
        last_id = pending[-1]

        print(f"[{_ts()}] Loaded a batch of {len(pending)} properties (up to id={last_id})\n")

        queue: asyncio.Queue = asyncio.Queue()
        for pid in pending:
            queue.put_nowait(pid)
        for _ in range(CONCURRENCY):
            queue.put_nowait(None)

        workers = [asyncio.create_task(worker(w, queue, stats, lock)) for w in range(CONCURRENCY)]
        await asyncio.gather(*workers)

    print(f"\n{'=' * 70}")
    print("=== RESULTS ===")
    print(f"recomputed: {stats['done']}")
    print(f"tax_changed: {stats['tax_changed']}")
    print(f"errors: {stats['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
