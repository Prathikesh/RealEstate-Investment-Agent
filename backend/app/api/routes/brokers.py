"""
Broker endpoints — profile management and preferences.
Auth (Google OAuth) is Phase 3. For now these endpoints are unprotected.

POST /api/brokers              — create broker profile
GET  /api/brokers/{id}         — get profile
PUT  /api/brokers/{id}         — update preferences
POST /api/brokers/{id}/watch/{property_id}   — watch a property
DELETE /api/brokers/{id}/watch/{property_id} — unwatch
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.broker import Broker, InvestmentStrategy, Language

router = APIRouter(prefix="/api/brokers", tags=["brokers"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class BrokerCreate(BaseModel):
    google_id:   str
    email:       str
    name:        Optional[str] = None
    avatar_url:  Optional[str] = None


class BrokerPreferences(BaseModel):
    location_city:       Optional[str]   = None
    location_radius_km:  Optional[int]   = None
    property_types:      Optional[list[str]] = None
    price_min:           Optional[float] = None
    price_max:           Optional[float] = None
    min_units:           Optional[int]   = None
    investment_strategy: Optional[str]   = None   # "buy_and_hold" | "buy_fix_sell" | "both"
    email_alerts_enabled:  Optional[bool] = None
    min_score_for_alert:   Optional[int]  = None
    language:              Optional[str]  = None  # "fr" | "en"
    onboarding_complete:   Optional[bool] = None


class BrokerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                  uuid.UUID
    google_id:           str
    email:               str
    name:                Optional[str]
    avatar_url:          Optional[str]
    location_city:       Optional[str]
    location_radius_km:  int
    property_types:      Optional[list]
    price_min:           Optional[float]
    price_max:           Optional[float]
    min_units:           Optional[int]
    investment_strategy: str
    email_alerts_enabled: bool
    min_score_for_alert:  int
    language:             str
    watched_property_ids: Optional[list]
    onboarding_complete:  bool
    is_active:            bool

    def model_post_init(self, __context):
        if hasattr(self, "investment_strategy") and hasattr(self.investment_strategy, "value"):
            object.__setattr__(self, "investment_strategy", self.investment_strategy.value)
        if hasattr(self, "language") and hasattr(self.language, "value"):
            object.__setattr__(self, "language", self.language.value)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=BrokerResponse, status_code=201)
async def create_broker(
    data: BrokerCreate,
    db: AsyncSession = Depends(get_db),
) -> BrokerResponse:
    # Check if google_id already exists
    existing = await db.scalar(
        select(Broker).where(Broker.google_id == data.google_id)
    )
    if existing:
        return BrokerResponse.model_validate(existing)

    broker = Broker(
        google_id=data.google_id,
        email=data.email,
        name=data.name,
        avatar_url=data.avatar_url,
    )
    db.add(broker)
    await db.flush()
    return BrokerResponse.model_validate(broker)


@router.get("/{broker_id}", response_model=BrokerResponse)
async def get_broker(
    broker_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> BrokerResponse:
    broker = await db.scalar(select(Broker).where(Broker.id == broker_id))
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    return BrokerResponse.model_validate(broker)


@router.put("/{broker_id}", response_model=BrokerResponse)
async def update_broker(
    broker_id: uuid.UUID,
    prefs: BrokerPreferences,
    db: AsyncSession = Depends(get_db),
) -> BrokerResponse:
    broker = await db.scalar(select(Broker).where(Broker.id == broker_id))
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")

    update_data = prefs.model_dump(exclude_none=True)

    if "investment_strategy" in update_data:
        try:
            update_data["investment_strategy"] = InvestmentStrategy(update_data["investment_strategy"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid investment_strategy")

    if "language" in update_data:
        try:
            update_data["language"] = Language(update_data["language"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid language")

    for key, value in update_data.items():
        setattr(broker, key, value)

    await db.flush()
    return BrokerResponse.model_validate(broker)


@router.post("/{broker_id}/watch/{property_id}")
async def watch_property(
    broker_id:   uuid.UUID,
    property_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    broker = await db.scalar(select(Broker).where(Broker.id == broker_id))
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")

    watched = list(broker.watched_property_ids or [])
    pid = str(property_id)
    if pid not in watched:
        broker.watched_property_ids = [*watched, pid]

    return {"status": "watching", "property_id": pid}


@router.delete("/{broker_id}/watch/{property_id}")
async def unwatch_property(
    broker_id:   uuid.UUID,
    property_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    broker = await db.scalar(select(Broker).where(Broker.id == broker_id))
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")

    pid = str(property_id)
    broker.watched_property_ids = [
        w for w in (broker.watched_property_ids or []) if w != pid
    ]
    return {"status": "unwatched", "property_id": pid}
