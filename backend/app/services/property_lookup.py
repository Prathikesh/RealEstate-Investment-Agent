"""
On-demand property lookup — the "paste a link or type an address → we fetch it
live and analyze it" feature.

Reuses the machinery we already have:
  - each scraper's scrape_detail(url)   → fetch one listing
  - PropertyDeduplicator.process(...)   → save / merge (bypass_scope=True so a
                                          user-requested listing anywhere is kept)
  - InvestmentPipeline.run(...)         → comparables, financials, score, zoning
Fast path returns as soon as the analysis (no AI brief) is ready; the EN/FR
brief is generated in a follow-up pass so the page fills in a moment later.

Jobs are tracked in-memory (single-process) and polled by the frontend, exactly
like the existing scrape-status progress bar.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.property import Property

logger = logging.getLogger(__name__)

# ── Job store ─────────────────────────────────────────────────────────────────

# status lifecycle:
#   found      → already in our DB (instant, no scrape)
#   resolving  → turning an address into a listing URL
#   scraping   → fetching the listing page
#   analyzing  → running the pipeline
#   done               → property_id ready
#   needs_url          → address couldn't be resolved (ask user to paste the link)
#   not_found          → page loaded fine but held no listing data (dead/removed)
#   scrape_unavailable → couldn't reach the listing at all (Scrapfly down, no
#                        working fetch) — the listing may well exist; try later
#   failed             → error


@dataclass
class LookupJob:
    id: str
    input: str
    kind: str  # "url" | "address"
    status: str = "pending"
    property_id: str | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "job_id": self.id,
            "status": self.status,
            "step": self.status,
            "property_id": self.property_id,
            "error": self.error,
        }


_jobs: dict[str, LookupJob] = {}


def get_job(job_id: str) -> LookupJob | None:
    return _jobs.get(job_id)


# ── Helpers ─────────────────────────────────────────────────────────────────

_URL_RE = re.compile(r"^https?://", re.I)


def detect_kind(text: str) -> str:
    return "url" if _URL_RE.match(text.strip()) else "address"


def _api_keys() -> list[str]:
    keys = [
        settings.scrapfly_api_key, settings.scrapfly_api_key_2,
        settings.scrapfly_api_key_3, settings.scrapfly_api_key_4,
    ]
    return [k for k in keys if k]


def _source_for_url(url: str) -> str | None:
    host = urlparse(url).netloc.lower()
    if "centris.ca" in host:
        return "centris"
    if "realtor.ca" in host:
        return "realtor"
    if "duproprio.com" in host:
        return "duproprio"   # not supported yet
    if "remax" in host:
        return "remax"
    return None


def _make_scraper(source: str, keys: list[str]):
    if source == "centris":
        from app.scrapers.centris import CentrisScraper
        return CentrisScraper(api_keys=keys)
    if source == "realtor":
        from app.scrapers.realtor import RealtorScraper
        return RealtorScraper(api_keys=keys)
    if source == "remax":
        from app.scrapers.remax import RemaxScraper
        return RemaxScraper(api_keys=keys)
    return None


async def _resolve_address_to_url(address: str) -> str | None:
    """
    Turn a typed address into a Centris listing URL.

    Primary: deterministic geography-walk match on Centris's own listing data
    (address_lookup.resolve_centris_address) — resolves the municipality, walks
    its result pages (Scrapfly, else Playwright), and matches the exact
    civic+street. Returns a URL only when it lands a single unambiguous match.

    Fallback: Google Programmable Search bridge (best-effort, needs a CSE key).
    """
    try:
        from app.services.address_lookup import resolve_centris_address
        result = await resolve_centris_address(address, _api_keys())
        if result.url:
            return result.url
        # If several listings share the address key (e.g. re-listed), take the
        # first rather than failing — still Centris's own data, not a guess.
        if result.candidates:
            logger.info(f"[lookup] address matched {len(result.candidates)} candidates; using first")
            return result.candidates[0].url
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[lookup] geography address resolve failed: {exc}")

    # ── Fallback: Google Programmable Search bridge ──
    if not settings.google_cse_key or not settings.google_cse_cx:
        return None
    query = f"{address} site:centris.ca OR site:duproprio.com"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={"key": settings.google_cse_key, "cx": settings.google_cse_cx, "q": query, "num": 5},
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[lookup] address search failed: {exc}")
        return None

    for it in items:
        link = it.get("link", "")
        host = urlparse(link).netloc.lower()
        # A listing detail page, not a search/index page.
        if ("centris.ca" in host or "duproprio.com" in host) and re.search(r"/\d", urlparse(link).path):
            return link
    return None


# ── Orchestration ─────────────────────────────────────────────────────────────


async def start_lookup(text: str, session: AsyncSession) -> LookupJob:
    """Create a job. If we already have this URL, resolve instantly; else run async."""
    text = text.strip()
    kind = detect_kind(text)
    job = LookupJob(id=uuid.uuid4().hex[:12], input=text, kind=kind)
    _jobs[job.id] = job

    # Instant hit: URL already in our DB → no scrape needed.
    if kind == "url":
        existing = await session.scalar(select(Property).where(Property.listing_url == text))
        if existing:
            job.status = "found"
            job.property_id = str(existing.id)
            return job

    asyncio.create_task(_run(job.id))
    return job


async def _run(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    try:
        async with AsyncSessionLocal() as session:
            # 1. Resolve to a listing URL
            if job.kind == "address":
                job.status = "resolving"
                url = await _resolve_address_to_url(job.input)
                if not url:
                    job.status = "needs_url"
                    return
            else:
                url = job.input

            source = _source_for_url(url)
            if source is None:
                job.status = "failed"
                job.error = "unsupported_site"
                return
            if source == "duproprio":
                job.status = "failed"
                job.error = "duproprio_not_supported"
                return

            keys = _api_keys()

            # 2. Scrape the listing. Centris pages are server-rendered, so the
            #    primary path is a plain-HTTP fetch (~0.5s). Scrapfly (if
            #    configured) and a headless browser (Playwright) are fallbacks
            #    for the rare case that GET is challenged.
            job.status = "scraping"
            raw = None
            page_fetched = False  # did we actually load the listing page from any source?

            # Fast path — plain HTTP (Centris only; realtor/remax go via Scrapfly).
            if source == "centris":
                from app.scrapers.http_fetch import fetch_html_fast
                html = await fetch_html_fast(url)
                if html:
                    page_fetched = True
                    parser = _make_scraper("centris", keys or ["dummy"])
                    raw = parser._parse_detail_page(html, source_url=url)

            # Scrapfly (if we have a key) — still needed for non-Centris sources.
            if raw is None and keys:
                scraper = _make_scraper(source, keys)
                try:
                    raw = await scraper.scrape_detail(url)
                    if raw:
                        page_fetched = True
                except Exception as exc:  # noqa: BLE001
                    logger.warning(f"[lookup] Scrapfly scrape failed, will try fallback: {exc}")
                finally:
                    await scraper.close()

            # Headless-browser fallback for Centris when the above gave nothing.
            if raw is None and source == "centris":
                logger.info(f"[lookup] fast/Scrapfly gave nothing — falling back to Playwright for {url}")
                from app.scrapers.playwright_fetch import fetch_html
                html = await fetch_html(url)
                if html:
                    page_fetched = True
                    parser = _make_scraper("centris", keys or ["dummy"])
                    raw = parser._parse_detail_page(html, source_url=url)

            if not raw:
                # If we never managed to load the page, scraping is unavailable
                # (Scrapfly suspended, no working fallback) — the listing may well
                # exist. Only call it "not_found" when the page loaded but was empty.
                job.status = "not_found" if page_fetched else "scrape_unavailable"
                return

            # Cap the gallery for an on-demand lookup — a listing can carry 40+
            # photos, which is overkill here; the first 10 are the hero shots.
            if raw.photos:
                raw.photos = raw.photos[:10]

            # 3. Save / merge (bypass_scope so any city is kept)
            from app.scrapers.deduplicator import PropertyDeduplicator
            dedup = PropertyDeduplicator(session)
            prop, _is_new = await dedup.process(raw, bypass_scope=True)
            if prop is None:
                job.status = "failed"
                job.error = "save_rejected"
                return
            await session.commit()

            # 4. Express analysis (no AI brief yet — fast)
            job.status = "analyzing"
            from app.agent.pipeline import InvestmentPipeline
            pipeline = InvestmentPipeline(session, generate_brief=False)
            await pipeline.run(prop, strategy="both")
            await session.commit()

            job.property_id = str(prop.id)
            job.status = "done"
            logger.info(f"[lookup] done {job.id} → {prop.id} ({prop.full_address})")

        # 5. Follow-up: generate the EN/FR brief so the page fills in shortly after.
        asyncio.create_task(_generate_brief(job.property_id))

    except Exception as exc:  # noqa: BLE001
        logger.exception(f"[lookup] job {job_id} failed: {exc}")
        job.status = "failed"
        job.error = type(exc).__name__


async def _generate_brief(property_id: str | None) -> None:
    if not property_id:
        return
    try:
        async with AsyncSessionLocal() as session:
            prop = await session.get(Property, property_id)
            if not prop:
                return
            from app.agent.pipeline import InvestmentPipeline
            pipeline = InvestmentPipeline(session, generate_brief=True)
            await pipeline.run(prop, strategy="both", force_brief=True)
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[lookup] brief generation failed for {property_id}: {exc}")
