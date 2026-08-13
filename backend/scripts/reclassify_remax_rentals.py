"""
Reclassify historically mislabeled ReMax rentals — properties scraped before
this session's ReMax for-sale/for-rent fix, stored as listing_type=FOR_SALE
with an implausible sale price (a monthly rent, e.g. $1,250-$2,500).

Confirmed via direct query: 438 of 1,247 ReMax-sourced properties (35%) match
`primary_source='remax' AND listing_type='FOR_SALE' AND asking_price < 10000`
— nothing sells for under $10,000 in Quebec real estate, so this threshold is
a clean, high-confidence signal (only 4 properties fall in the ambiguous
$10k-$50k band; those are left untouched). Each one carries a full AI
score/cap-rate/comp analysis computed against a rent value as if it were a
purchase price (cap rates of 500-1,100%+ observed).

Two modes, additive:
  1. Reclassify (default): DB-only, free. Sets listing_type=FOR_RENT and
     clears the sale-oriented analysis fields — same field list
     InvestmentPipeline.run()'s rental branch clears (app/agent/pipeline.py),
     kept in sync with it deliberately rather than reimplemented differently.
  2. --refetch: additionally re-fetches each listing's live page via
     RemaxScraper.scrape_detail() (now running through the fixed parser) and
     re-runs it through PropertyDeduplicator.process() for fully current
     price/photos/description/etc. Costs real Scrapfly credits — one detail
     fetch per property. Combine with --limit to control cost/scope.

Safety, same pattern as backfill_score_components.py / fix_mismatched_sources.py:
  * Default (no flags) is a dry run — prints what WOULD happen, writes nothing.
  * --apply performs the reclassification writes.
  * --refetch requires --apply (refetching without writing is pointless) and
    is always additive to the reclassification, never a replacement for it.

Usage:
  python -m scripts.reclassify_remax_rentals                       # dry run
  python -m scripts.reclassify_remax_rentals --apply                # reclassify only (free)
  python -m scripts.reclassify_remax_rentals --apply --refetch      # + live re-fetch all matches
  python -m scripts.reclassify_remax_rentals --apply --refetch --limit 10   # test on a slice first
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import or_, select

from app.database import AsyncSessionLocal
from app.models.property import ListingType, Property
from app.scrapers.deduplicator import PropertyDeduplicator
from app.scrapers.remax import RemaxScraper
from app.config import settings

logging.disable(logging.INFO)  # silence SQLAlchemy echo
logger = logging.getLogger(__name__)

PRICE_CEILING = 10_000  # below this, a ReMax "for_sale" price is certainly a rent


def _reset_sale_fields(prop: Property) -> None:
    """Same field list as InvestmentPipeline.run()'s rental branch — kept in
    sync deliberately so a reclassified property looks identical whether it
    went through this script or the normal pipeline."""
    prop.score = None
    prop.score_category = None
    prop.score_components = None
    prop.analysis_confidence = None
    prop.value_gap = None
    prop.discount_pct = None
    prop.cap_rate = None
    prop.noi_annual = None
    prop.grm = None
    prop.monthly_cash_flow = None
    prop.cash_on_cash_return = None
    prop.welcome_tax = None
    prop.down_payment_20pct = None
    prop.monthly_mortgage = None
    prop.comparable_count = None
    prop.comparable_median_price = None
    prop.comparable_mean_price = None
    prop.comparable_ids = None
    prop.ai_brief_en = None
    prop.ai_brief_fr = None


async def main(apply: bool, refetch: bool, limit: int | None) -> None:
    async with AsyncSessionLocal() as db:
        # Matches both not-yet-reclassified rows (still FOR_SALE, cheap price)
        # and already-reclassified ones (FOR_RENT via a prior run of this
        # script) — so --refetch can be run standalone after the fact without
        # re-triggering reclassification of rows that are already correct.
        still_mislabeled = (
            (Property.listing_type == ListingType.FOR_SALE)
            & (Property.asking_price < PRICE_CEILING)
        )
        stmt = select(Property).where(
            Property.primary_source == "remax",
            or_(still_mislabeled, Property.listing_type == ListingType.FOR_RENT),
        )
        candidates = (await db.execute(stmt)).scalars().all()
        to_reclassify = [p for p in candidates if p.listing_type == ListingType.FOR_SALE]
        if limit:
            candidates = candidates[:limit]
            to_reclassify = [p for p in to_reclassify if p in candidates]

        print(f"candidates (remax, for_rent or still-mislabeled): {len(candidates)}")
        print(f"  of which not yet reclassified: {len(to_reclassify)}")
        for p in to_reclassify[:10]:
            print(f"  {p.id}  {p.full_address}  ${p.asking_price:,.0f}  score={p.score}  cap_rate={p.cap_rate}")
        if len(to_reclassify) > 10:
            print(f"  ... and {len(to_reclassify) - 10} more")

        if not apply:
            print("\n[dry run] No rows written. Re-run with --apply to reclassify"
                  " (add --refetch to also pull live data — costs Scrapfly credits).")
            return

        # ── Reclassify (free) ──
        reclassified = 0
        for p in to_reclassify:
            p.listing_type = ListingType.FOR_RENT
            _reset_sale_fields(p)
            p.needs_reanalysis = False  # nothing left for the pipeline to compute
            reclassified += 1
            if reclassified % 100 == 0:
                await db.commit()
                print(f"  reclassified {reclassified}/{len(to_reclassify)}")
        await db.commit()
        if reclassified:
            print(f"\n[applied] {reclassified} properties reclassified to listing_type=for_rent.")

        if not refetch:
            return

        # ── Live re-fetch (costs Scrapfly credits) ──
        print(f"\n--- live re-fetch: {len(candidates)} properties ---")
        keys = [k for k in [settings.scrapfly_api_key, settings.scrapfly_api_key_2] if k]
        dedup = PropertyDeduplicator(db)
        refetched = errors = 0
        async with RemaxScraper(api_keys=keys) as scraper:
            for i, p in enumerate(candidates, 1):
                if not p.listing_url:
                    continue
                try:
                    raw = await scraper.scrape_detail(p.listing_url)
                    if raw is None:
                        # Listing no longer resolves on ReMax — leave it as
                        # the free-pass reclassification already set it
                        # (for_rent, sale fields cleared) rather than error.
                        logger.info(f"[{i}/{len(candidates)}] no longer resolves: {p.listing_url}")
                        continue
                    await dedup.process(raw)
                    refetched += 1
                except Exception as exc:
                    logger.warning(f"[{i}/{len(candidates)}] refetch failed for {p.listing_url}: {exc}")
                    errors += 1
                    # Without this, a single dropped DB connection or failed
                    # statement leaves the session's transaction broken, and
                    # every subsequent item cascades to the same
                    # PendingRollbackError instead of just skipping the one
                    # bad item — confirmed live: this exact gap turned one
                    # transient connection blip into ~380 lost items.
                    await db.rollback()

                if i % 25 == 0:
                    try:
                        await db.commit()
                    except Exception as exc:
                        # The checkpoint commit itself can hit the same
                        # transient connection loss as a per-item fetch —
                        # confirmed live (asyncpg ConnectionDoesNotExistError
                        # here crashed the whole run previously, past the
                        # per-item try/except above).
                        logger.warning(f"commit at {i}/{len(candidates)} failed: {exc}")
                        await db.rollback()
                        errors += 1
                    print(f"  refetched {i}/{len(candidates)} (errors={errors})")
                await asyncio.sleep(2)

        await db.commit()
        print(f"\n[refetch done] {refetched} refreshed, {errors} errors.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="perform the reclassification writes (default: dry run)")
    ap.add_argument("--refetch", action="store_true", help="also re-fetch live data for each match (requires --apply, costs Scrapfly credits)")
    ap.add_argument("--limit", type=int, default=None, help="only process the first N candidates (useful with --refetch to test on a slice)")
    args = ap.parse_args()
    if args.refetch and not args.apply:
        ap.error("--refetch requires --apply")
    asyncio.run(main(apply=args.apply, refetch=args.refetch, limit=args.limit))
