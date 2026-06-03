"""
Base scraper — shared Scrapfly client and normalized output dataclass.
Every site-specific scraper inherits from BaseScraper and outputs RawProperty objects.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from scrapfly import ScrapflyClient, ScrapeConfig, ScrapeApiResponse
from scrapfly.errors import ScrapflyError


# ── Normalized output from any scraper ────────────────────────────────────────

@dataclass
class RawProperty:
    """
    One property as extracted from a listing site.
    All fields are optional — parsers fill what they can find.
    The deduplication layer merges these across sources.
    """
    # Required
    source: str                                     # "centris", "realtor", etc.
    source_url: str                                 # full URL on the source site

    # Identification
    source_listing_id: Optional[str] = None         # site's own ID
    mls_number: Optional[str] = None                # shared across centris/realtor/zolo

    # Location
    full_address: Optional[str] = None
    street_number: Optional[str] = None
    street_name: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    postal_code: Optional[str] = None

    # Property details
    property_type: Optional[str] = None             # maps to PropertyType enum values
    unit_count: Optional[int] = None
    bedrooms_total: Optional[int] = None
    bathrooms_total: Optional[float] = None
    sqft_total: Optional[int] = None
    lot_sqft: Optional[int] = None
    year_built: Optional[int] = None
    parking_spaces: Optional[int] = None
    floors: Optional[int] = None

    # Pricing
    asking_price: Optional[float] = None

    # Quebec rental / expense data (plexes often include this on listing)
    rental_income_monthly: Optional[float] = None
    municipal_taxes_annual: Optional[float] = None
    school_taxes_annual: Optional[float] = None
    condo_fees_monthly: Optional[float] = None

    # Media
    photos: list[str] = field(default_factory=list)
    description: Optional[str] = None

    # Timing
    days_on_market: Optional[int] = None
    listed_at: Optional[str] = None                 # ISO date string if available

    # Full raw extract — saved to property_snapshots for audit / re-parsing
    raw_data: dict = field(default_factory=dict)
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ── Base scraper ───────────────────────────────────────────────────────────────

class BaseScraper:
    SOURCE: str = "base"

    def __init__(self, api_key: str):
        self.client = ScrapflyClient(key=api_key)
        self.logger = logging.getLogger(self.__class__.__name__)

    async def fetch(
        self,
        url: str,
        asp: bool = False,
        render_js: bool = False,
        country: str = "ca",
        retry: bool = True,
        headers: dict | None = None,
    ) -> ScrapeApiResponse:
        """Fetch a page via Scrapfly. Logs status and credit cost."""
        config = ScrapeConfig(
            url=url,
            asp=asp,
            render_js=render_js,
            country=country,
            retry=retry,
            headers=headers or {},
        )
        try:
            result = await self.client.async_scrape(config)
            cost = result.context.get("cost", "?")
            self.logger.info(
                f"[{self.SOURCE}] {result.upstream_status_code} "
                f"| credits={cost} | {url[:90]}"
            )
            return result
        except ScrapflyError as exc:
            self.logger.error(f"[{self.SOURCE}] Scrapfly error — {url}: {exc}")
            raise

    async def scrape_listings(self, **kwargs) -> list[RawProperty]:
        """Fetch a page of search results. Override in each scraper."""
        raise NotImplementedError

    async def scrape_detail(self, url: str) -> Optional[RawProperty]:
        """Fetch one listing's detail page. Override in each scraper."""
        raise NotImplementedError

    async def close(self) -> None:
        try:
            self.client.close()
        except AttributeError:
            pass  # http_session was never opened (e.g. scrape failed before first request)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.close()
