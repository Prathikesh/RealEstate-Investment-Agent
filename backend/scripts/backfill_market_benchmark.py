"""
Backfill market_benchmark for all properties that already have a cap_rate
but were analyzed before the Colliers benchmark stage existed.

Unlike a full pipeline re-run, this only needs the property's existing
cap_rate/city/property_type — no comparables, calc-engine calls, or Claude
brief generation, so it's cheap to run against the whole table.

Run from backend/ with:
  python scripts/backfill_market_benchmark.py
  python scripts/backfill_market_benchmark.py --limit 100
  python scripts/backfill_market_benchmark.py --dry-run
"""
import argparse
import asyncio
import logging
import sys
import time
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("backfill_market_benchmark")

from sqlalchemy import select

from app.agent.market_benchmark import MarketBenchmarkComparator
from app.database import AsyncSessionLocal
from app.models.property import Property


async def main(limit: int, dry_run: bool) -> None:
    start = time.time()

    async with AsyncSessionLocal() as session:
        candidate_ids = list((await session.scalars(
            select(Property.id)
            .where(Property.cap_rate.isnot(None))
            .where(Property.market_benchmark.is_(None))
            .order_by(Property.mls_number)
            .limit(limit)
        )).all())

    print(f"\n{'='*60}")
    print(f"Market Benchmark Backfill")
    print(f"{'='*60}")
    print(f"  Properties eligible : {len(candidate_ids)}")
    print(f"  Processing limit    : {limit}")
    if dry_run:
        print(f"  [DRY RUN] No writes will be made.")
    print(f"{'='*60}\n")

    if dry_run:
        return

    comparator = MarketBenchmarkComparator()
    stats = {"benchmarked": 0, "not_applicable": 0}

    batch_size = 200
    for i in range(0, len(candidate_ids), batch_size):
        batch_ids = candidate_ids[i:i + batch_size]
        async with AsyncSessionLocal() as session:
            props = list((await session.scalars(
                select(Property).where(Property.id.in_(batch_ids))
            )).all())

            for prop in props:
                benchmark = comparator.compare(prop, prop.cap_rate)
                if benchmark:
                    prop.market_benchmark = asdict(benchmark)
                    stats["benchmarked"] += 1
                else:
                    # Not eligible (wrong property type / unmatched city) —
                    # leave market_benchmark null, correctly signaling "N/A".
                    stats["not_applicable"] += 1

            await session.commit()

        logger.info(f"Processed {min(i + batch_size, len(candidate_ids))}/{len(candidate_ids)}...")

    elapsed = round(time.time() - start, 1)
    print(f"\n{'='*60}")
    print(f"DONE in {elapsed}s")
    print(f"  Benchmarked     : {stats['benchmarked']}")
    print(f"  Not applicable  : {stats['not_applicable']} (property type/city not covered)")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",   type=int, default=10000)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    asyncio.run(main(limit=args.limit, dry_run=args.dry_run))
