"""
Run the AI investment pipeline on all pending properties.
Run from backend/ with:  python scripts/run_pipeline.py

Options:
  --limit 100          process only N properties (default: all)
  --no-brief           skip Claude API calls (faster, no cost)
  --strategy both      buy_and_hold | buy_fix_sell | both
"""
import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pipeline_runner")

from sqlalchemy import select, func

from app.database import AsyncSessionLocal
from app.models.property import Property, ScoreCategory
from app.agent.pipeline import InvestmentPipeline


async def main(limit: int, generate_brief: bool, strategy: str) -> None:
    start = time.time()

    async with AsyncSessionLocal() as session:
        pending = await session.scalar(
            select(func.count()).select_from(Property)
            .where(Property.needs_reanalysis == True)
            .where(Property.asking_price.isnot(None))
        )

    print(f"\n{'='*60}")
    print(f"AI Pipeline Runner")
    print(f"{'='*60}")
    print(f"  Pending properties : {pending}")
    print(f"  Processing limit   : {limit}")
    print(f"  Claude briefs      : {'yes (costs API credits)' if generate_brief else 'no (skipped)'}")
    print(f"  Strategy           : {strategy}")
    print(f"{'='*60}\n")

    processed = 0
    batch_size = 50     # commit every 50 to avoid long transactions

    for batch_start in range(0, limit, batch_size):
        batch_limit = min(batch_size, limit - batch_start)

        async with AsyncSessionLocal() as session:
            pipeline = InvestmentPipeline(session, generate_brief=generate_brief)
            stats = await pipeline.run_pending(
                limit=batch_limit,
                strategy=strategy,
            )
            await session.commit()

        processed += stats["processed"]
        errors = stats.get("errors", 0)
        scores = stats.get("scores", [])
        avg = sum(s for s in scores if s) / len(scores) if scores else 0

        logger.info(
            f"Batch {batch_start // batch_size + 1}: "
            f"{stats['processed']} processed | avg score {avg:.1f} | errors {errors}"
        )

        if stats["processed"] < batch_limit:
            break   # no more pending

    # Final summary
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(Property.score_category, func.count())
            .where(Property.score.isnot(None))
            .group_by(Property.score_category)
        )).all()

        total_scored = await session.scalar(
            select(func.count()).select_from(Property).where(Property.score.isnot(None))
        )
        avg_score = await session.scalar(
            select(func.avg(Property.score)).where(Property.score.isnot(None))
        )

    elapsed = round(time.time() - start, 1)

    print(f"\n{'='*60}")
    print(f"DONE in {elapsed}s — {processed} properties analyzed")
    print(f"  Total scored in DB : {total_scored}")
    print(f"  Average score      : {round(float(avg_score), 1) if avg_score else 'N/A'}")
    print(f"\n  Score breakdown:")
    category_order = ["strong_opportunity", "worth_investigating", "market_price", "not_recommended"]
    cat_map = {r[0].value if r[0] else "none": r[1] for r in rows}
    for cat in category_order:
        count = cat_map.get(cat, 0)
        bar = "█" * (count // 5)
        print(f"    {cat:25s} {count:4d}  {bar}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",     type=int,  default=10000)
    parser.add_argument("--no-brief",  action="store_true")
    parser.add_argument("--strategy",  default="both",
                        choices=["both", "buy_and_hold", "buy_fix_sell"])
    args = parser.parse_args()

    asyncio.run(main(
        limit=args.limit,
        generate_brief=not args.no_brief,
        strategy=args.strategy,
    ))
