"""
Report properties the verification pipeline (app/agent/verifier.py) flagged
as needing attention: manual_review / fetch_failed / no_centris_match
outcomes from their most recent verification run, plus any tax field that's
still NULL even after being verified (i.e. genuinely missing at the source,
not just an unfetched field).

Usage:
    python scripts/report_verification_issues.py [--source centris] [--limit 200]
"""
from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.property import Property
from app.models.verification import PropertyVerificationLog, VerificationOutcome

ISSUE_OUTCOMES = {
    VerificationOutcome.MANUAL_REVIEW,
    VerificationOutcome.FETCH_FAILED,
    VerificationOutcome.NO_CENTRIS_MATCH,
}


async def _latest_log_per_property(session) -> dict:
    rows = (
        await session.execute(
            select(PropertyVerificationLog).order_by(PropertyVerificationLog.verified_at.desc())
        )
    ).scalars().all()
    latest: dict = {}
    for log in rows:
        latest.setdefault(log.property_id, log)
    return latest


async def main(source_filter: str | None, limit: int) -> None:
    async with AsyncSessionLocal() as session:
        latest = await _latest_log_per_property(session)

        flagged = [log for log in latest.values() if log.outcome in ISSUE_OUTCOMES]
        if source_filter:
            flagged = [log for log in flagged if log.source.value == source_filter]

        by_outcome: dict = defaultdict(list)
        for log in flagged:
            by_outcome[log.outcome.value].append(log)

        print(f"=== Verification issues ({len(flagged)} properties, most recent run per property) ===\n")
        for outcome, logs in by_outcome.items():
            print(f"--- {outcome} ({len(logs)}) ---")
            for log in logs[:limit]:
                prop = await session.get(Property, log.property_id)
                addr = prop.full_address if prop else "(deleted)"
                print(f"  {log.property_id}  [{log.source.value}]  {addr}")
                for field, detail in log.fields_checked.items():
                    if detail.get("manual_review") or detail.get("no_centris_match"):
                        print(f"      {field}: {detail}")
            print()

        # Still-NULL tax fields after verification, grouped by primary_source —
        # answers "which properties don't have tax values scraped correctly."
        stmt = select(Property.primary_source, Property.id, Property.full_address).where(
            Property.last_verified_at.isnot(None),
            Property.municipal_taxes_annual.is_(None),
        )
        if source_filter:
            stmt = stmt.where(Property.primary_source == source_filter)
        missing_tax = (await session.execute(stmt)).all()

        by_source: dict = defaultdict(list)
        for src, pid, addr in missing_tax:
            by_source[src or "unknown"].append((pid, addr))

        print(f"=== Still missing municipal_taxes_annual after verification ({len(missing_tax)}) ===\n")
        for src, items in by_source.items():
            print(f"--- {src} ({len(items)}) ---")
            for pid, addr in items[:limit]:
                print(f"  {pid}  {addr}")
            print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=None, help="filter to one source, e.g. centris")
    parser.add_argument("--limit", type=int, default=200, help="max rows printed per group")
    args = parser.parse_args()
    asyncio.run(main(args.source, args.limit))
