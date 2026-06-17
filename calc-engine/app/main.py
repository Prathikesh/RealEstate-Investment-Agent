"""
FastAPI application factory.

Startup sequence:
1. Create DB tables (idempotent)
2. Start APScheduler (3-week rate refresh job)
3. Mount API routers

Shutdown:
1. Stop scheduler gracefully
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import v1_router
from app.rate_store.db import create_db_and_tables
from app.scheduler.jobs import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Quebec Real Estate Calculation Engine...")
    create_db_and_tables()
    start_scheduler()
    logger.info("Ready.")
    yield
    # Shutdown
    stop_scheduler()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="Quebec Real Estate Calculation Engine",
    description=(
        "Trustable, auditable financial calculations for Quebec real estate. "
        "All values sourced from official government sites via ScrapFly. "
        "Rates are automatically refreshed every 3 weeks."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow your existing full-stack app to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to your app's domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api")


@app.get("/")
def root():
    return {
        "service": "Quebec Real Estate Calculation Engine",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
        "main_endpoint": "POST /api/v1/property/analyze",
    }
