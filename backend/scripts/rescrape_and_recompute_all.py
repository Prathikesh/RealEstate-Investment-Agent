"""
PRODUCTION ONE-OFF — re-fetches every property's OWN listing_url and
re-parses it with the CURRENT scraper before re-running the full pipeline.

Why this exists, distinct from recompute_all_pipeline.py: that script only
re-runs analysis on whatever is ALREADY stored in the DB — it never
re-fetches the source page. Confirmed live on a real reported property
(302-308, 5e Avenue, Shawinigan): the real Centris page discloses a school
tax of $150 in a `financial-details-table__label`/`__value` layout that an
OLDER version of `_parse_detail_page` didn't know how to read (a "Pattern 6"
was added for this later, this session, by a parallel change) — so the
property's stored school_taxes_annual (258, a Montreal-biased computed
estimate from the postal-code bug) was never corrected by re-running
analysis alone, because FinancialCalculator.calculate() can't distinguish
"a genuinely disclosed value" from "a wrong number that merely happens to
already be sitting in that column" — once ANY value is stored there, it's
treated as authoritative and never revisited by pure re-analysis.

This script closes that gap: fetch the real page again, re-parse with
today's scraper (which now correctly reads school/municipal tax off the
financial-details-table layout), overwrite the raw fields only when the
fresh parse actually found something, THEN re-run the full pipeline so
score/comparables/etc. reflect the corrected figures.

Not committed to dev; deployed as a temporary one-off Railway service
sourced from a throwaway branch (GitHub-connected deploy — local `railway
up` uploads have been unreliable this session), then torn down once done.

Same proven patterns as every prior bulk script this session: one
long-lived DB session per worker, sentinel-based shutdown, keyset
pagination so it's safe to stop/resume, plain-HTTP fetch via
asyncio.to_thread (never blocks the event loop).

Usage (set via Railway service variables, not committed anywhere):
    DATABASE_URL=<production private URL>
    PYTHONUNBUFFERED=1
    EXPERIMENT_CONCURRENCY=6   # moderate — this one re-hits Centris, unlike
                               # the DB-only recompute script
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

import requests
from sqlalchemy import select  # noqa: E402

from app.agent.pipeline import InvestmentPipeline  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.property import Property  # noqa: E402
from app.scrapers.centris import CentrisScraper  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
CONCURRENCY = int(os.environ.get("EXPERIMENT_CONCURRENCY", "6"))
BATCH_RELOAD_SIZE = int(os.environ.get("EXPERIMENT_BATCH_SIZE", "500"))
RESUME_AFTER = os.environ.get("RECOMPUTE_RESUME_AFTER", "")


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def plain_get(url: str) -> tuple[int, str]:
    resp = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "fr-CA,fr;q=0.9"}, timeout=30)
    return resp.status_code, resp.text


async def load_next_batch(after_id, limit: int) -> list:
    async with AsyncSessionLocal() as session:
        stmt = (
            select(Property.id, Property.listing_url, Property.primary_source)
            .where(Property.listing_url.isnot(None))
            .order_by(Property.id)
            .limit(limit)
        )
        if after_id is not None:
            stmt = stmt.where(Property.id > after_id)
        rows = (await session.execute(stmt)).all()
        return [(r.id, r.listing_url, r.primary_source) for r in rows]


async def worker(worker_id: int, queue: asyncio.Queue, stats: dict, lock: asyncio.Lock) -> None:
    scraper = CentrisScraper(api_keys=["dummy-not-used-for-parsing-only"])
    session = AsyncSessionLocal()
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            prop_id, listing_url, primary_source = item

            try:
                t0 = time.monotonic()
                prop = await session.get(Property, prop_id)
                if prop is None:
                    continue

                # Only Centris listings use this scraper's parser — other
                # sources (Realtor, ReMax) aren't in scope for this pass.
                if primary_source != "centris" or not listing_url or "centris.ca" not in listing_url:
                    async with lock:
                        stats["skipped_non_centris"] += 1
                    continue

                status, html = await asyncio.to_thread(plain_get, listing_url)
                if status != 200:
                    async with lock:
                        stats["http_failed"] += 1
                    await asyncio.sleep(0.5)
                    continue

                parsed = await asyncio.to_thread(scraper._parse_detail_page, html, source_url=listing_url)
                if parsed is None or getattr(parsed, "is_delisted", False):
                    async with lock:
                        stats["delisted_or_unparseable"] += 1
                    await asyncio.sleep(0.5)
                    continue

                old_muni, old_school = prop.municipal_taxes_annual, prop.school_taxes_annual
                changed = False

                # Only overwrite when the fresh parse actually found something —
                # never blank out a field we previously had just because this
                # particular fetch/parse missed it.
                if parsed.municipal_taxes_annual is not None and parsed.municipal_taxes_annual != prop.municipal_taxes_annual:
                    prop.municipal_taxes_annual = parsed.municipal_taxes_annual
                    changed = True
                if parsed.school_taxes_annual is not None and parsed.school_taxes_annual != prop.school_taxes_annual:
                    prop.school_taxes_annual = parsed.school_taxes_annual
                    changed = True
                if parsed.evaluation_fonciere is not None and parsed.evaluation_fonciere != prop.evaluation_fonciere:
                    prop.evaluation_fonciere = parsed.evaluation_fonciere
                    changed = True
                if parsed.condo_fees_monthly is not None and parsed.condo_fees_monthly != prop.condo_fees_monthly:
                    prop.condo_fees_monthly = parsed.condo_fees_monthly
                    changed = True
                if parsed.rental_income_monthly is not None and parsed.rental_income_monthly != prop.rental_income_monthly:
                    prop.rental_income_monthly = parsed.rental_income_monthly
                    changed = True
                if parsed.raw_data:
                    merged = dict(prop.raw_expenses or {})
                    merged.update(parsed.raw_data)
                    if merged != (prop.raw_expenses or {}):
                        prop.raw_expenses = merged
                        changed = True

                pipeline = InvestmentPipeline(session, generate_brief=False)
                await pipeline.run(prop, strategy="both", language="en")
                await session.commit()
                elapsed = time.monotonic() - t0

                async with lock:
                    stats["done"] += 1
                    done = stats["done"]
                    if changed:
                        stats["fields_corrected"] += 1
                if done <= 10 or done % 200 == 0 or changed:
                    print(f"  [{_ts()}] [w{worker_id}] ... {done} done "
                          f"(this item: {elapsed:.2f}s, score={prop.score}, "
                          f"muni {old_muni}->{prop.municipal_taxes_annual}, "
                          f"school {old_school}->{prop.school_taxes_annual}, "
                          f"changed={changed})")

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

            await asyncio.sleep(0.3)
    finally:
        await session.close()
        await scraper.close()


async def main() -> None:
    print(f"=== Production full re-scrape + recompute — concurrency={CONCURRENCY} ===\n")

    stats = {"done": 0, "errors": 0, "fields_corrected": 0, "http_failed": 0,
              "delisted_or_unparseable": 0, "skipped_non_centris": 0}
    lock = asyncio.Lock()
    last_id = RESUME_AFTER or None
    if last_id:
        print(f"Resuming after id={last_id}\n")

    while True:
        pending = await load_next_batch(last_id, BATCH_RELOAD_SIZE)
        if not pending:
            break
        last_id = pending[-1][0]

        print(f"[{_ts()}] Loaded a batch of {len(pending)} properties (up to id={last_id})\n")

        queue: asyncio.Queue = asyncio.Queue()
        for item in pending:
            queue.put_nowait(item)
        for _ in range(CONCURRENCY):
            queue.put_nowait(None)

        workers = [asyncio.create_task(worker(w, queue, stats, lock)) for w in range(CONCURRENCY)]
        await asyncio.gather(*workers)

    print(f"\n{'=' * 70}")
    print("=== RESULTS ===")
    for k, v in stats.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())
