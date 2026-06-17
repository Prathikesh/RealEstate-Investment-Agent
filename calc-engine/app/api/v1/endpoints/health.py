"""GET /api/v1/health — Health check for the existing app to ping."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session, text

from app.rate_store.db import get_session
from app.scheduler.jobs import scheduler

router = APIRouter()


@router.get("")
def health(session: Session = Depends(get_session)):
    # Check DB connectivity
    try:
        session.exec(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "db": "ok" if db_ok else "error",
        "scheduler": "running" if scheduler.running else "stopped",
    }
