"""
Detach cross-source dedup mismatches — properties where two sources' prices
diverge so much they're almost certainly two different real-world listings
merged into one row (see app/scrapers/deduplicator.py for the tightened
matching logic going forward; this script is the one-off cleanup for rows
that were already merged wrong under the old, looser matching).

Confirmed root causes (see PR that introduced this script):
  * ReMax's scraper had no for-sale/for-rent distinction — a rental's monthly
    price (e.g. 1150, 1400, 2500) landing on an unrelated for-sale property's
    asking_price is the single most common pattern here.
  * The old composite-score dedup let matching agent contact info alone pass
    the 60-point bar, with zero required corroboration — one agent handling
    several units in the same building was enough to merge two different
    properties.

Classification, per property with 2+ active property_sources:
  * lower price < 30% of the higher price -> AUTO-DETACH candidate (clear-cut
    outlier — almost always the ReMax-rent-merged-in pattern, or two
    obviously different price points that can't be the same real listing).
  * 20-30% divergence, no extreme outlier -> REVIEW candidate. Both prices
    look like plausible real sale prices; printed for manual review rather
    than guessed at.
  * <20% divergence -> left alone (normal cross-source price lag, not a bug).

On auto-detach: keeps the source with the highest last_price (the ReMax-rent
pattern always makes the correct sale price the higher one), sets the
detached PropertySource.is_active=False, removes it from
Property.active_sources, strips its entries from price_history, recomputes
asking_price/price_per_sqft from the kept source, and sets
needs_reanalysis=True so the next pipeline cycle rescoring it uses the
corrected price. The detached listing isn't lost — the next scheduled scrape
cycle re-discovers it and, under the fixed dedup logic, creates it as its own
correctly-matched (and, if it's a rental, correctly-tagged for_rent) property.

Safety, same pattern as scripts/backfill_score_components.py:
  * Default (no flags) is a dry run — prints exactly what WOULD happen,
    writes nothing.
  * --apply performs the auto-detach writes. Review candidates are NEVER
    auto-written by this script, in either mode.

Usage:
  python -m scripts.fix_mismatched_sources            # dry run (report only)
  python -m scripts.fix_mismatched_sources --apply     # perform auto-detach
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.property import Property
from app.models.source import PropertySource

logging.disable(logging.INFO)  # silence SQLAlchemy echo

AUTO_DETACH_RATIO = 0.30   # lower price under 30% of higher -> clear-cut outlier
REVIEW_RATIO = 0.20        # 20-30% divergence -> flag for manual review


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        properties = (await db.execute(select(Property))).scalars().all()
        by_id = {p.id: p for p in properties}

        sources = (await db.execute(
            select(PropertySource).where(PropertySource.is_active == True)  # noqa: E712
        )).scalars().all()

        by_property: dict = {}
        for s in sources:
            by_property.setdefault(s.property_id, []).append(s)

        auto_detach: list[tuple[Property, list[PropertySource], PropertySource]] = []
        review: list[tuple[Property, list[PropertySource]]] = []

        for prop_id, srcs in by_property.items():
            if len(srcs) < 2:
                continue
            priced = [s for s in srcs if s.last_price]
            if len(priced) < 2:
                continue
            prop = by_id.get(prop_id)
            if not prop:
                continue

            lo = min(priced, key=lambda s: s.last_price)
            hi = max(priced, key=lambda s: s.last_price)
            if lo.last_price <= 0 or hi.last_price <= 0 or lo is hi:
                continue
            ratio = lo.last_price / hi.last_price

            if ratio < AUTO_DETACH_RATIO:
                # Detach every priced source that's an outlier relative to hi,
                # not just the single minimum — handles 3+ source properties.
                outliers = [s for s in priced if s.last_price / hi.last_price < AUTO_DETACH_RATIO]
                auto_detach.append((prop, outliers, hi))
            elif ratio < (1 - REVIEW_RATIO):
                review.append((prop, priced))

        print(f"properties with 2+ active priced sources: {len(by_property)}")
        print(f"  auto-detach candidates (clear outlier): {len(auto_detach)}")
        print(f"  review candidates (ambiguous)         : {len(review)}")

        print("\n--- REVIEW (not touched by this script — check manually) ---")
        for prop, priced in review:
            price_list = ", ".join(f"{s.source.value}=${s.last_price:,.0f}" for s in priced)
            print(f"  {prop.id}  {prop.full_address}  |  {price_list}")

        if not apply:
            print("\n--- AUTO-DETACH (dry run — nothing written; re-run with --apply) ---")
            for prop, outliers, kept in auto_detach:
                names = ", ".join(f"{s.source.value}=${s.last_price:,.0f}" for s in outliers)
                print(f"  {prop.id}  {prop.full_address}  |  detach [{names}]  keep {kept.source.value}=${kept.last_price:,.0f}")
            print(f"\n[dry run] {len(auto_detach)} properties would be cleaned up. Re-run with --apply to write.")
            return

        # ── Apply ──
        detached_count = 0
        for prop, outliers, kept in auto_detach:
            detached_names = {s.source.value for s in outliers}

            for s in outliers:
                s.is_active = False

            if prop.active_sources:
                prop.active_sources = [src for src in prop.active_sources if src not in detached_names]

            if prop.price_history:
                prop.price_history = [
                    entry for entry in prop.price_history
                    if entry.get("source") not in detached_names
                ]

            prop.asking_price = kept.last_price
            prop.price_per_sqft = (
                round(kept.last_price / prop.sqft_total, 2)
                if prop.sqft_total and prop.sqft_total > 0 else None
            )
            prop.primary_source = kept.source.value
            prop.needs_reanalysis = True

            detached_count += 1
            if detached_count % 50 == 0:
                await db.commit()
                print(f"  committed {detached_count}/{len(auto_detach)}")

        await db.commit()
        print(f"\n[applied] {detached_count} properties cleaned up — detached source(s) will be "
              f"re-scraped and correctly re-matched under the fixed dedup logic on the next scrape cycle.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="perform the auto-detach writes (default: dry run)")
    args = ap.parse_args()
    asyncio.run(main(apply=args.apply))
