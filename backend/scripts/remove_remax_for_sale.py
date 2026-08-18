"""
Remove ReMax as a for-sale data source. Rentals (listing_type=FOR_RENT) are
never touched — this is for-sale only, per the decision to stop trusting
ReMax's for-sale data after this session's string of confirmed issues:
agent-only dedup matches, no unit number in the address text (the 1211 Rue
Drummond cluster), and multiple confirmed wrong cross-source merges (the
Côte-Ste-Catherine quintuplex).

Two cases, split by how many active sources the property has:
  1. ReMax-only (active_sources == ["remax"]) — no other source to fall back
     to, so the property is deleted outright. PropertySource/PropertySnapshot
     rows cascade-delete automatically (ondelete="CASCADE" on both FKs).
  2. Multi-site (ReMax + Centris and/or Realtor) — the property stays; only
     the ReMax PropertySource is detached (is_active=False), removed from
     active_sources, and its price_history entries stripped. asking_price /
     price_per_sqft / primary_source are recomputed from the remaining
     source(s), preferring Centris over Realtor when both remain (Centris has
     proven the more reliable parser this session).

Going forward, remax.py's sitemap walk no longer fetches for-sale ReMax pages
at all (filtered at the URL level before any detail fetch), and
deduplicator.py has a hard backstop that refuses to save a remax for-sale
RawProperty by any path — so this cleanup should be a one-time pass, not
something that needs to run repeatedly.

Usage:
  python -m scripts.remove_remax_for_sale            # dry run
  python -m scripts.remove_remax_for_sale --apply     # perform the cleanup
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.property import ListingType, Property
from app.models.source import PropertySource
from app.models.snapshot import ScraperSource

logging.disable(logging.INFO)


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        stmt = select(Property).where(
            Property.listing_type == ListingType.FOR_SALE,
            Property.active_sources.isnot(None),
        )
        candidates = [
            p for p in (await db.execute(stmt)).scalars().all()
            if p.active_sources and "remax" in p.active_sources
        ]

        remax_only = [p for p in candidates if len(p.active_sources) == 1]
        multi_site = [p for p in candidates if len(p.active_sources) > 1]

        print(f"ReMax-only for-sale properties (will be deleted): {len(remax_only)}")
        print(f"Multi-site for-sale properties incl. ReMax (ReMax source will be detached): {len(multi_site)}")

        if not apply:
            print("\n[dry run] No rows written. Re-run with --apply to perform the cleanup.")
            return

        # ── Case 1: ReMax-only → delete outright ──
        # Batched commits + rollback-on-error, not one giant transaction —
        # a single dropped DB connection mid-loop otherwise leaves the whole
        # session's transaction broken and every subsequent delete cascades
        # to the same error (confirmed live earlier this session with the
        # same class of bug in reclassify_remax_rentals.py).
        deleted = 0
        for p in remax_only:
            pid = p.id  # capture before any risky operation — after a
            # rollback, SQLAlchemy expires the object, and touching an
            # expired attribute triggers a lazy-load that needs its own DB
            # round-trip; doing that inside the except block itself (when the
            # connection is what just failed) crashes the handler uncaught.
            try:
                await db.delete(p)
                deleted += 1
            except Exception as exc:
                print(f"  delete failed for {pid}: {exc}")
                await db.rollback()
                continue
            if deleted % 50 == 0:
                await db.commit()
                print(f"  deleted {deleted}/{len(remax_only)}")
        await db.commit()
        print(f"\n[deleted] {deleted} ReMax-only for-sale properties.")

        # ── Case 2: multi-site → detach ReMax, keep the rest ──
        detached = 0
        deleted_stale = 0
        for i, p in enumerate(multi_site, 1):
            pid = p.id  # same reasoning as the delete loop above
            try:
                sources_stmt = select(PropertySource).where(
                    PropertySource.property_id == p.id,
                    PropertySource.is_active == True,  # noqa: E712
                )
                active_sources = (await db.execute(sources_stmt)).scalars().all()
                remax_row = next((s for s in active_sources if s.source == ScraperSource.REMAX), None)
                keepers = [s for s in active_sources if s.source != ScraperSource.REMAX]

                # Property.active_sources (denormalized JSON) had drifted out
                # of sync with the real property_sources table for ~15 rows —
                # confirmed live: it listed "remax" with no matching active
                # PropertySource row at all (or vice versa). Trusting that
                # stale field caused an infinite skip loop across repeated
                # runs. The real property_sources table is authoritative —
                # correct active_sources to match it either way, not just
                # when there's an actual remax row to deactivate.
                if not keepers:
                    # No genuinely active non-remax source despite what
                    # active_sources claimed — nothing valid to keep, so this
                    # is effectively remax-only. Delete outright, same as
                    # Case 1.
                    if remax_row:
                        remax_row.is_active = False
                    await db.delete(p)
                    deleted_stale += 1
                    continue

                if remax_row:
                    remax_row.is_active = False
                p.active_sources = [k.source.value for k in keepers]
                if p.price_history:
                    p.price_history = [e for e in p.price_history if e.get("source") != "remax"]

                # Prefer Centris over Realtor when both remain — the more
                # reliable parser this session (real welcome-tax calculator,
                # cleaner address/unit parsing).
                keep = next((k for k in keepers if k.source == ScraperSource.CENTRIS), keepers[0])
                if keep.last_price:
                    p.asking_price = keep.last_price
                    p.price_per_sqft = (
                        round(keep.last_price / p.sqft_total, 2)
                        if p.sqft_total and p.sqft_total > 0 else None
                    )
                p.primary_source = keep.source.value
                p.needs_reanalysis = True
                detached += 1
            except Exception as exc:
                print(f"  detach failed for {pid}: {exc}")
                await db.rollback()
                continue

            if i % 100 == 0:
                await db.commit()
                print(f"  detached {detached}/{len(multi_site)} (checked {i})")

        await db.commit()
        print(f"[detached] {detached} multi-site properties had their ReMax source removed.")
        if deleted_stale:
            print(f"[deleted] {deleted_stale} more properties had no genuinely active non-remax "
                  f"source despite active_sources claiming one (stale denormalized field).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    asyncio.run(main(apply=args.apply))
