"""
Backfill Property.score_components for legacy rows scored before that column existed.

Why: "Your Verdict" (app/agent/verdict.py) recombines a property's stored per-factor
score_components with the broker's own weights. Rows analyzed before score_components
was persisted have it NULL, so they can't be ranked by a broker's metrics and fall to
the bottom of any "My Metrics" ranking. This repopulates them.

How: we DON'T re-run the full pipeline (no comparables refetch, no Claude briefs, no
cost). We reconstruct the per-factor components directly from columns already on the
row (discount_pct, cap_rate, grm, monthly_cash_flow, comparable_count,
analysis_confidence, price_history, days-on-market) by calling the REAL
OpportunityScorer.score() with a lightweight stand-in profile — so the math is
byte-for-byte the scorer's own, not a reimplementation.

rent_is_estimated / taxes_are_estimated aren't stored columns, so we infer them:
  rent_is_estimated   = rental_income_monthly IS NULL   (no disclosed rent)
  taxes_are_estimated = municipal_taxes_annual IS NULL  (no scraped tax)

Safety:
  * --validate (default) writes NOTHING. It reconstructs components for the rows that
    ALREADY have them and reports how closely the reconstruction matches, so we can
    trust it before touching the NULL rows. Run this first.
  * --apply updates ONLY rows where score_components IS NULL. It never overwrites an
    existing breakdown and never touches any other column. Fully reversible
    (UPDATE properties SET score_components = NULL WHERE ... to revert).

Usage:
  python -m scripts.backfill_score_components            # validate (dry run)
  python -m scripts.backfill_score_components --apply    # write NULL rows
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from types import SimpleNamespace

from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.agent.scorer import OpportunityScorer
from app.agent.verdict import SCORE_FACTORS
from app.models.property import Property, compute_days_on_market

logging.disable(logging.INFO)  # silence SQLAlchemy echo

_scorer = OpportunityScorer()


def reconstruct_components(prop: Property) -> dict[str, float]:
    """Recompute score_components from stored columns via the real scorer."""
    fp = SimpleNamespace(
        discount_pct=prop.discount_pct,
        cap_rate=prop.cap_rate,
        monthly_cash_flow=prop.monthly_cash_flow,
        grm=prop.grm,
        analysis_confidence=(prop.analysis_confidence.value if prop.analysis_confidence else "low"),
        comparable_count=prop.comparable_count or 0,
        # Inferred (see module docstring) — these only affect the confidence factor
        # (+5 for real taxes) and the unverified-income cap (59 when rent estimated).
        taxes_are_estimated=(prop.municipal_taxes_annual is None),
        rent_is_estimated=(prop.rental_income_monthly is None),
    )
    result = _scorer.score(
        fp,  # type: ignore[arg-type]  (scorer only reads the 8 attrs above)
        strategy="both",
        days_on_market=compute_days_on_market(prop),
        risk=None,
        neighbourhood=None,
        price_history=prop.price_history,
    )
    return result.components


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        # Only rows that were actually analyzed (have an AI score) are eligible —
        # a NULL score means the pipeline never ran, so there's nothing to rebuild.
        rows = (await db.execute(
            select(Property).where(Property.score.isnot(None))
        )).scalars().all()

        have = [p for p in rows if p.score_components is not None]
        missing = [p for p in rows if p.score_components is None]
        print(f"eligible (has AI score): {len(rows)}")
        print(f"  already has components: {len(have)}")
        print(f"  NULL components       : {len(missing)}  <- backfill target")

        # ── Validation: reconstruct rows that already have components, compare ──
        base_factors = [f for f in SCORE_FACTORS]
        diffs: dict[str, list[float]] = {f: [] for f in base_factors}
        cap_matches = cap_total = 0
        for p in have:
            recon = reconstruct_components(p)
            stored = p.score_components or {}
            for f in base_factors:
                if f in stored and f in recon:
                    diffs[f].append(abs(float(stored[f]) - float(recon[f])))
            if "unverified_income_cap" in stored:
                cap_total += 1
                if (float(stored["unverified_income_cap"]) > 0) == (float(recon.get("unverified_income_cap", 0)) > 0):
                    cap_matches += 1

        print("\n--- reconstruction accuracy vs stored components (mean abs diff, 0-100 scale) ---")
        for f in base_factors:
            xs = diffs[f]
            avg = sum(xs) / len(xs) if xs else 0.0
            worst = max(xs) if xs else 0.0
            print(f"  {f:14s} n={len(xs):5d}  mean={avg:5.2f}  max={worst:6.2f}")
        if cap_total:
            print(f"  income-cap flag agreement: {cap_matches}/{cap_total} "
                  f"({100*cap_matches/cap_total:.1f}%)")

        if not apply:
            print("\n[validate only] No rows written. Re-run with --apply to fill NULL rows.")
            return

        # ── Apply: write ONLY the NULL rows ──
        written = 0
        for p in missing:
            comps = reconstruct_components(p)
            await db.execute(
                update(Property).where(Property.id == p.id).values(score_components=comps)
            )
            written += 1
            if written % 500 == 0:
                await db.commit()
                print(f"  committed {written}/{len(missing)}")
        await db.commit()
        print(f"\n[applied] score_components written for {written} rows.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write NULL rows (default: validate only)")
    args = ap.parse_args()
    asyncio.run(main(apply=args.apply))
