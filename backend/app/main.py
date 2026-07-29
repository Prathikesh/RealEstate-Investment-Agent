"""
FastAPI application entry point.
Run with:  uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.api.routes.properties import router as properties_router
from app.api.routes.brokers import router as brokers_router
from app.api.routes.admin import router as admin_router
from app.api.routes.images import router as images_router
from app.analytics.routes import router as analytics_router, admin_router as analytics_admin_router
from app.auth.routes import router as auth_router
from app.auth.security import hash_password
from app.database import AsyncSessionLocal
from app.models.broker import Broker, UserRole
from app.scheduler import create_scheduler


async def _bootstrap_admin() -> None:
    """Create (or promote) the configured admin account on startup. No-op if unset."""
    if not settings.admin_bootstrap_email or not settings.admin_bootstrap_password:
        return

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(Broker).where(Broker.email == settings.admin_bootstrap_email))
        if existing:
            if existing.role != UserRole.ADMIN:
                existing.role = UserRole.ADMIN
                await db.commit()
            return

        db.add(Broker(
            email=settings.admin_bootstrap_email,
            password_hash=hash_password(settings.admin_bootstrap_password),
            role=UserRole.ADMIN,
            is_verified=True,
        ))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _bootstrap_admin()
    # No Scrapfly key = demo mode: skip the scraping scheduler entirely
    scheduler = create_scheduler() if settings.scrapfly_api_key else None
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="Quebec Real Estate AI",
    description="AI-powered investment analysis for Quebec real estate brokers.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:5173"],
    allow_origin_regex=r"https://.*\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(analytics_router)
app.include_router(analytics_admin_router)
app.include_router(properties_router)
app.include_router(brokers_router)
app.include_router(admin_router)
app.include_router(images_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
