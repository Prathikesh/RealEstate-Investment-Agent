"""
One-time push to clear the verification backlog fast, instead of waiting on
the nightly cron's small daily batches. Runs continuously (not gated by the
3am cron window) with several properties verified in parallel, and does NOT
pause the regular scrape/pipeline jobs — a property that gets re-scraped
moments after being verified just has last_scraped_at > last_verified_at
again and gets picked up in a later chunk automatically, so there's no need
to freeze new-listing scraping for this to be safe.

Safe to Ctrl-C and rerun any time: progress is durable via last_verified_at,
so a rerun just picks up wherever the backlog query leaves off.

Usage:
    python scripts/run_verification_backfill.py [--concurrency 6] [--chunk-size 500] [--limit 2000]
"""
from __future__ import annotations

import argparse
import asyncio
import time

from app.agent.verifier import verify_batch
from app.database import AsyncSessionLocal
from app.scheduler import _api_keys, _select_verification_batch


async def main(concurrency: int, chunk_size: int, limit: int | None) -> None:
    start = time.time()
    total_done = 0
    totals: dict[str, int] = {}

    while True:
        if limit is not None and total_done >= limit:
            print(f"Reached --limit {limit}, stopping.")
            break

        async with AsyncSessionLocal() as session:
            chunk = await _select_verification_batch(session, min(chunk_size, limit - total_done) if limit else chunk_size)

        if not chunk:
            print("Backlog is empty — nothing left to verify.")
            break

        chunk_start = time.time()

        def _progress(done: int, total: int, stats: dict) -> None:
            if done % 25 == 0 or done == total:
                elapsed = time.time() - chunk_start
                rate = done / elapsed if elapsed > 0 else 0
                print(
                    f"  chunk {done}/{total} | {rate:.2f}/s | "
                    f"corrected={stats.get('corrected', 0)} verified={stats.get('verified_match', 0)} "
                    f"manual_review={stats.get('manual_review', 0)} errors={stats.get('errors', 0)}",
                    flush=True,
                )

        print(f"=== Chunk of {len(chunk)} properties (total done so far: {total_done}) ===", flush=True)
        stats = await verify_batch(chunk, _api_keys(), concurrency=concurrency, progress_cb=_progress)

        total_done += len(chunk)
        for k, v in stats.items():
            totals[k] = totals.get(k, 0) + v

        elapsed_total = time.time() - start
        print(
            f"=== Running total: {total_done} verified in {elapsed_total/60:.1f} min "
            f"({total_done/(elapsed_total/3600):.0f}/hour) — {totals} ===\n",
            flush=True,
        )

    elapsed_total = time.time() - start
    print(f"\n=== Backfill done: {total_done} properties in {elapsed_total/3600:.2f}h — {totals} ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--chunk-size", type=int, default=500)
    parser.add_argument("--limit", type=int, default=None, help="stop after this many properties total (default: drain full backlog)")
    args = parser.parse_args()
    asyncio.run(main(args.concurrency, args.chunk_size, args.limit))
