"""
CRUD operations for the rate store.
All read operations return only is_active=True records.
"""
from datetime import datetime

from sqlmodel import Session, select

from .models import ChangeLog, RateRecord, ScrapeLog


# ---------------------------------------------------------------------------
# RateRecord
# ---------------------------------------------------------------------------

def get_active_rate(
    session: Session,
    municipality_code: str,
    rate_type: str,
    school_board_code: str = "",
) -> RateRecord | None:
    """Return the current active rate record for a location + type."""
    stmt = (
        select(RateRecord)
        .where(RateRecord.municipality_code == municipality_code)
        .where(RateRecord.school_board_code == school_board_code)
        .where(RateRecord.rate_type == rate_type)
        .where(RateRecord.is_active == True)
        .order_by(RateRecord.scraped_at.desc())
    )
    return session.exec(stmt).first()


def get_all_active_locations(session: Session) -> list[dict]:
    """Return distinct (municipality_code, school_board_code) pairs with active records."""
    stmt = (
        select(RateRecord.municipality_code, RateRecord.school_board_code)
        .where(RateRecord.is_active == True)
        .distinct()
    )
    rows = session.exec(stmt).all()
    return [{"municipality_code": r[0], "school_board_code": r[1]} for r in rows]


def deactivate_rate(session: Session, rate_record: RateRecord) -> None:
    """Mark a rate record as inactive (superseded by a newer value)."""
    rate_record.is_active = False
    session.add(rate_record)
    session.commit()


def insert_rate(session: Session, rate: RateRecord) -> RateRecord:
    session.add(rate)
    session.commit()
    session.refresh(rate)
    return rate


def get_rates_for_municipality(session: Session, municipality_code: str) -> list[RateRecord]:
    """Return all active rates for a municipality (for the /rates endpoint)."""
    stmt = (
        select(RateRecord)
        .where(RateRecord.municipality_code == municipality_code)
        .where(RateRecord.is_active == True)
    )
    return list(session.exec(stmt).all())


# ---------------------------------------------------------------------------
# ScrapeLog
# ---------------------------------------------------------------------------

def log_scrape(session: Session, entry: ScrapeLog) -> None:
    session.add(entry)
    session.commit()


# ---------------------------------------------------------------------------
# ChangeLog
# ---------------------------------------------------------------------------

def log_change(session: Session, entry: ChangeLog) -> None:
    session.add(entry)
    session.commit()


def get_recent_changes(session: Session, limit: int = 50) -> list[ChangeLog]:
    stmt = select(ChangeLog).order_by(ChangeLog.detected_at.desc()).limit(limit)
    return list(session.exec(stmt).all())
