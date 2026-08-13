"""
Cross-check the "ambiguous" review list left behind by fix_mismatched_sources.py
(properties with 2+ active sources whose prices diverge 20-30% — not extreme
enough to auto-detach, but not proven to be a legitimate cross-source match
either).

Confirmed live (see PR notes): the Côte-Ste-Catherine quintuplex had a ReMax
source that had drifted across THREE different real properties over several
scrape cycles under the old dedup logic; separately, a single Realtor listing
for unit #2405 at 1211 Rue Drummond is merged onto three different real
Centris units in the same building (Realtor's address text doesn't carry the
apartment number, so building-level address matching alone can't tell them
apart). Both are genuine wrong merges, not just stale price lag.

Method: re-fetch each active source's CURRENT live page (not the stored
snapshot) and compare the freshly-parsed addresses:
  1. Building level (civic number + street, via the same
     app.services.quebec_address.full_address_match_key() used to match
     scraped listings to the assessment roll) — a mismatch here means two
     genuinely different properties were merged.
  2. Apartment/unit number, extracted from the address text or URL — a
     mismatch here means two different units in the same building were
     merged (the Drummond pattern).

Only auto-detaches when a fetched source's building key OR unit number
clearly disagrees with the majority of the property's other sources. Anything
that still can't be resolved (a fetch failure, or every source genuinely
agreeing) is left alone and reported, same conservative default as
fix_mismatched_sources.py.

Costs Scrapfly credits — one live fetch per active source per candidate.

Usage:
  python -m scripts.crosscheck_review_list                # dry run
  python -m scripts.crosscheck_review_list --apply         # perform detaches
  python -m scripts.crosscheck_review_list --apply --limit 20   # test on a slice
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import re

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.property import Property
from app.models.source import PropertySource
from app.models.snapshot import ScraperSource
from app.scrapers.centris import CentrisScraper
from app.scrapers.realtor import RealtorScraper
from app.scrapers.remax import RemaxScraper
from app.services.quebec_address import full_address_match_key
from app.config import settings

logging.disable(logging.INFO)
logger = logging.getLogger(__name__)

AUTO_DETACH_RATIO = 0.30
REVIEW_RATIO = 0.20

UNIT_RE = re.compile(r"(?:app\.?|apt\.?|unit|unite|#)\s*(\w+)", re.IGNORECASE)


def _extract_unit(address: str, url: str) -> str | None:
    """Apartment/unit number from address text, falling back to a URL slug
    number segment (e.g. .../1211-rue-drummond-2405-montreal...)."""
    if address:
        m = UNIT_RE.search(address)
        if m:
            return m.group(1).upper()
    # URL fallback: a 3-5 digit segment between the street slug and the city
    # slug is very likely a unit number on these sites (not a MLS/ULS, which
    # sits at the very end of the URL).
    m = re.search(r"-(\d{2,5})-(?:montreal|laval|longueuil|quebec|gatineau)", url, re.IGNORECASE)
    return m.group(1) if m else None


async def _fetch(source: ScraperSource, url: str, remax_scraper, centris_scraper, realtor_scraper):
    if source == ScraperSource.REMAX:
        return await remax_scraper.scrape_detail(url)
    if source == ScraperSource.CENTRIS:
        return await centris_scraper.scrape_detail(url)
    if source == ScraperSource.REALTOR:
        return await realtor_scraper.scrape_detail(url)
    return None  # other sources not re-verified here


async def main(apply: bool, limit: int | None) -> None:
    async with AsyncSessionLocal() as db:
        properties = (await db.execute(select(Property))).scalars().all()
        by_id = {p.id: p for p in properties}
        sources = (await db.execute(
            select(PropertySource).where(PropertySource.is_active == True)  # noqa: E712
        )).scalars().all()
        by_property: dict = {}
        for s in sources:
            by_property.setdefault(s.property_id, []).append(s)

        review_candidates = []
        for prop_id, srcs in by_property.items():
            priced = [s for s in srcs if s.last_price and s.source_url]
            if len(priced) < 2:
                continue
            lo = min(priced, key=lambda s: s.last_price)
            hi = max(priced, key=lambda s: s.last_price)
            if lo.last_price <= 0 or hi.last_price <= 0 or lo is hi:
                continue
            ratio = lo.last_price / hi.last_price
            if AUTO_DETACH_RATIO <= ratio < (1 - REVIEW_RATIO):
                review_candidates.append((by_id[prop_id], priced))

        if limit:
            review_candidates = review_candidates[:limit]

        print(f"review candidates to cross-check: {len(review_candidates)}")

        keys = [k for k in [settings.scrapfly_api_key, settings.scrapfly_api_key_2] if k]
        confirmed_bad: list[tuple] = []
        inconclusive = 0

        async with RemaxScraper(api_keys=keys) as remax_scraper, \
                   CentrisScraper(api_keys=keys) as centris_scraper:
            realtor_scraper = RealtorScraper(api_keys=keys)
            try:
                for n, (prop, priced) in enumerate(review_candidates, 1):
                    fetched = []  # (source_row, building_key, unit, address)
                    for s in priced:
                        try:
                            raw = await _fetch(s.source, s.source_url, remax_scraper, centris_scraper, realtor_scraper)
                            if raw is None or not raw.full_address:
                                continue
                            bkey = full_address_match_key(raw.full_address)
                            unit = _extract_unit(raw.full_address, s.source_url)
                            fetched.append((s, bkey, unit, raw.full_address))
                        except Exception as exc:
                            logger.warning(f"[{n}] fetch failed for {s.source_url}: {exc}")
                        await asyncio.sleep(1.5)

                    if len(fetched) < 2:
                        inconclusive += 1
                        continue

                    # Majority building key wins; anything disagreeing (on
                    # building OR unit, when both sides have a unit) is bad.
                    bkeys = [f[1] for f in fetched if f[1]]
                    majority_bkey = max(set(bkeys), key=bkeys.count) if bkeys else None
                    units_present = [f[2] for f in fetched if f[2]]
                    majority_unit = max(set(units_present), key=units_present.count) if units_present else None

                    bad = []
                    good = []
                    for s, bkey, unit, addr in fetched:
                        is_bad = (
                            (majority_bkey and bkey and bkey != majority_bkey)
                            or (majority_unit and unit and unit != majority_unit)
                        )
                        (bad if is_bad else good).append((s, addr))

                    if bad and good:
                        confirmed_bad.append((prop, bad, good))
                        print(f"  [{n}/{len(review_candidates)}] MISMATCH  {prop.full_address}")
                        for s, addr in bad:
                            print(f"      ✗ {s.source.value}: {addr}  ({s.source_url})")
                        for s, addr in good:
                            print(f"      ✓ {s.source.value}: {addr}")
                    else:
                        inconclusive += 1
                        reason = "agree" if len(fetched) == len(priced) else f"fetch failed ({len(priced)-len(fetched)} of {len(priced)})"
                        print(f"  [{n}/{len(review_candidates)}] OK ({reason})  {prop.full_address}")
            finally:
                await realtor_scraper.close()

        print(f"\nconfirmed mismatches: {len(confirmed_bad)}")
        print(f"inconclusive / agree: {inconclusive}")

        if not apply:
            print("\n[dry run] No rows written. Re-run with --apply to detach confirmed-bad sources.")
            return

        detached = 0
        for prop, bad, good in confirmed_bad:
            bad_names = {s.source.value for s in [b[0] for b in bad]}
            for s, _ in bad:
                s.is_active = False
            if prop.active_sources:
                prop.active_sources = [src for src in prop.active_sources if src not in bad_names]
            if prop.price_history:
                prop.price_history = [e for e in prop.price_history if e.get("source") not in bad_names]
            keep = max((b[0] for b in good), key=lambda s: s.last_price or 0)
            prop.asking_price = keep.last_price
            prop.price_per_sqft = (
                round(keep.last_price / prop.sqft_total, 2)
                if prop.sqft_total and prop.sqft_total > 0 else None
            )
            prop.primary_source = keep.source.value
            prop.needs_reanalysis = True
            detached += 1
        await db.commit()
        print(f"\n[applied] {detached} properties corrected — bad source(s) detached, kept the confirmed match.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    asyncio.run(main(apply=args.apply, limit=args.limit))
