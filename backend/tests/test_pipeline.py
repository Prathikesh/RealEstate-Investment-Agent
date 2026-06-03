"""
Test the full AI pipeline on properties already in the DB.
Run from backend/ with:  python tests/test_pipeline.py

Stages tested: comparables → financials → score → Claude brief
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.property import Property, ScoreCategory
from app.agent.pipeline import InvestmentPipeline


SCORE_EMOJI = {
    ScoreCategory.STRONG_OPPORTUNITY:  "🟢",
    ScoreCategory.WORTH_INVESTIGATING: "🔵",
    ScoreCategory.MARKET_PRICE:        "🟡",
    ScoreCategory.NOT_RECOMMENDED:     "🔴",
}


async def main() -> None:
    print("=" * 65)
    print("AI Investment Pipeline Test")
    print("=" * 65)

    async with AsyncSessionLocal() as session:

        # Load all properties that need analysis
        props = list((await session.scalars(
            select(Property)
            .where(Property.asking_price.isnot(None))
            .order_by(Property.created_at)
        )).all())

        print(f"\nFound {len(props)} properties in DB\n")

        if not props:
            print("No properties found. Run tests/test_e2e.py first.")
            return

        # Run pipeline (no Claude brief for speed — set generate_brief=True to enable)
        pipeline = InvestmentPipeline(session, generate_brief=True)
        stats = await pipeline.run_pending(limit=50, strategy="both")

        await session.commit()

        print(f"\nProcessed: {stats['processed']} | Errors: {stats['errors']}\n")
        print("-" * 65)

        # Re-load and display results sorted by score
        scored_props = list((await session.scalars(
            select(Property)
            .where(Property.score.isnot(None))
            .order_by(Property.score.desc())
        )).all())

        print(f"{'#':>3}  {'Score':>6}  {'Price':>12}  {'Cap%':>6}  {'CF/mo':>8}  {'Disc%':>6}  Address")
        print("-" * 65)

        for i, p in enumerate(scored_props, 1):
            emoji = SCORE_EMOJI.get(p.score_category, " ")
            price = f"${p.asking_price:,.0f}" if p.asking_price else "N/A"
            cap   = f"{p.cap_rate:.1f}%" if p.cap_rate else "N/A"
            cf    = f"${p.monthly_cash_flow:+,.0f}" if p.monthly_cash_flow else "N/A"
            disc  = f"{p.discount_pct:+.1f}%" if p.discount_pct else "N/A"
            print(
                f"{i:>3}. {emoji}{p.score:>3}/100  "
                f"{price:>12}  {cap:>6}  {cf:>8}  {disc:>6}  "
                f"{p.full_address[:35]}"
            )

        # Summary
        if scored_props:
            scores = [p.score for p in scored_props]
            print(f"\n  Avg score: {sum(scores)/len(scores):.1f}")
            strong = sum(1 for p in scored_props if p.score_category == ScoreCategory.STRONG_OPPORTUNITY)
            invest = sum(1 for p in scored_props if p.score_category == ScoreCategory.WORTH_INVESTIGATING)
            print(f"  Strong opportunities (80+): {strong}")
            print(f"  Worth investigating (60-79): {invest}")

        # Show one property's full breakdown
        if scored_props:
            best = scored_props[0]
            print(f"\n{'='*65}")
            print(f"Best Property Deep Dive: {best.full_address}")
            print(f"{'='*65}")
            print(f"  Score:          {best.score}/100 — {best.score_category.value}")
            print(f"  Price:          ${best.asking_price:,.0f}")
            print(f"  Comp median:    ${best.comparable_median_price:,.0f}" if best.comparable_median_price else "  Comp median:    N/A")
            print(f"  Discount:       {best.discount_pct:+.1f}%" if best.discount_pct else "  Discount:       N/A")
            print(f"  Cap rate:       {best.cap_rate:.2f}%" if best.cap_rate else "  Cap rate:       N/A")
            print(f"  NOI annual:     ${best.noi_annual:,.0f}" if best.noi_annual else "  NOI annual:     N/A")
            print(f"  Monthly CF:     ${best.monthly_cash_flow:+,.0f}" if best.monthly_cash_flow else "  Monthly CF:     N/A")
            print(f"  Welcome tax:    ${best.welcome_tax:,.0f}" if best.welcome_tax else "  Welcome tax:    N/A")
            print(f"  Comps found:    {best.comparable_count} ({best.analysis_confidence.value} confidence)")
            if best.ai_brief_en:
                print(f"\n{'─'*65}")
                print("AI INVESTMENT BRIEF (English):")
                print(f"{'─'*65}")
                print(best.ai_brief_en)


if __name__ == "__main__":
    asyncio.run(main())
