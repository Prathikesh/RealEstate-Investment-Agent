"""
GET /api/v1/rates/* — Transparency endpoints.

Users and admins can inspect the raw scraped rate values stored in the DB.
This lets them verify that the calculation engine is using correct data.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.rate_store import repository
from app.rate_store.db import get_session

router = APIRouter()


@router.get("/{municipality_code}")
def get_rates_for_municipality(
    municipality_code: str,
    session: Session = Depends(get_session),
):
    """Return all active rate records for a municipality."""
    records = repository.get_rates_for_municipality(session, municipality_code.upper())
    if not records:
        raise HTTPException(
            status_code=404,
            detail=f"No rates stored for municipality '{municipality_code}'. "
                   "Submit a property analysis request first to populate rates.",
        )
    return [
        {
            "rate_type": r.rate_type,
            "value": r.value,
            "unit": r.unit,
            "data_version": r.data_version,
            "scraped_at": r.scraped_at.isoformat(),
            "source_url": r.source_url,
            "source_law": r.source_law,
        }
        for r in records
    ]


@router.get("/changes/recent")
def get_recent_changes(
    limit: int = 50,
    session: Session = Depends(get_session),
):
    """Return the most recent rate changes detected."""
    changes = repository.get_recent_changes(session, limit=limit)
    return [
        {
            "detected_at": c.detected_at.isoformat(),
            "municipality_code": c.municipality_code,
            "rate_type": c.rate_type,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "old_version": c.old_version,
            "new_version": c.new_version,
            "source_url": c.source_url,
        }
        for c in changes
    ]


@router.get("/locations/all")
def get_all_locations(session: Session = Depends(get_session)):
    """Return all municipalities with stored rates."""
    return repository.get_all_active_locations(session)
