"""
Base scraper — shared Scrapfly client and normalized output dataclass.
Every site-specific scraper inherits from BaseScraper and outputs RawProperty objects.

Dual-key support:
  Pass api_keys=[key1, key2].  The scraper uses key1 by default.
  If key1 returns a credit-exhaustion error, it automatically switches
  to key2 for the rest of that session and logs a warning.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Union

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

    # Agent / dealer contact — used for cross-site deduplication and display
    agent_name:  Optional[str] = None               # listing agent full name
    agent_phone: Optional[str] = None               # agent phone number
    agent_email: Optional[str] = None               # agent email address
    agency_name: Optional[str] = None               # brokerage / agency name

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
    # Évaluation foncière — municipal assessed value (≠ asking price, updated every 3yr)
    # Used for more accurate tax estimation when listing discloses it
    evaluation_fonciere: Optional[float] = None

    # Media
    photos: list[str] = field(default_factory=list)
    description: Optional[str] = None

    # Timing
    days_on_market: Optional[int] = None
    listed_at: Optional[str] = None                 # ISO date string if available

    # Full raw extract — saved to property_snapshots for audit / re-parsing
    raw_data: dict = field(default_factory=dict)
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ── Credit-error detection ─────────────────────────────────────────────────────

_CREDIT_KEYWORDS = ("insufficient_credits", "credit_limit", "no_credits", "quota")

def _is_credit_error(exc: ScrapflyError) -> bool:
    msg = str(exc).lower()
    return any(kw in msg for kw in _CREDIT_KEYWORDS)


# ── Base scraper ───────────────────────────────────────────────────────────────

class BaseScraper:
    SOURCE: str = "base"

    def __init__(self, api_keys: Union[list[str], str]):
        """
        api_keys: either a single key string or a list [primary, fallback, ...].
        The scraper uses the first key; on credit exhaustion it switches to the next.
        """
        if isinstance(api_keys, str):
            api_keys = [k for k in [api_keys] if k]
        else:
            api_keys = [k for k in api_keys if k]

        if not api_keys:
            raise ValueError("At least one Scrapfly API key is required.")

        self._keys = api_keys
        self._key_idx = 0
        self.client = ScrapflyClient(key=self._keys[0])
        self.logger = logging.getLogger(self.__class__.__name__)

    def _switch_to_next_key(self) -> bool:
        """
        Rotate to the next available API key.
        Returns True if a new key was available, False if all keys are exhausted.
        """
        next_idx = self._key_idx + 1
        if next_idx >= len(self._keys):
            self.logger.error(
                f"[{self.SOURCE}] All {len(self._keys)} Scrapfly key(s) exhausted."
            )
            return False
        self._key_idx = next_idx
        self.client = ScrapflyClient(key=self._keys[self._key_idx])
        self.logger.warning(
            f"[{self.SOURCE}] Switched to Scrapfly key #{self._key_idx + 1} "
            f"(key_idx={self._key_idx}) due to credit exhaustion."
        )
        return True

    async def fetch(
        self,
        url: str,
        asp: bool = False,
        render_js: bool = False,
        country: str = "ca",
        retry: bool = True,
        headers: dict | None = None,
        rendering_wait: int = 0,
        wait_for_selector: str | None = None,
        js_scenario: list | None = None,
        auto_scroll: bool = False,
        geolocation: str | None = None,
    ) -> ScrapeApiResponse:
        """
        Fetch a page via Scrapfly.
        Automatically retries with the next API key on credit-exhaustion errors.
        rendering_wait: ms to wait after JS loads before capturing HTML.
        wait_for_selector: CSS selector to wait for before capturing.
        js_scenario: list of Scrapfly JS instructions.
        auto_scroll: automatically scroll to trigger lazy-loaded content.
        geolocation: Scrapfly geolocation string (e.g. "ca-qc@45.5,-73.5").
        """
        config_kwargs: dict = dict(
            url=url,
            asp=asp,
            render_js=render_js,
            country=country,
            retry=retry,
            headers=headers or {},
        )
        if rendering_wait > 0:
            config_kwargs["rendering_wait"] = rendering_wait
        if wait_for_selector:
            config_kwargs["wait_for_selector"] = wait_for_selector
        if js_scenario:
            config_kwargs["js_scenario"] = js_scenario
        if auto_scroll:
            config_kwargs["auto_scroll"] = True
        if geolocation:
            config_kwargs["geolocation"] = geolocation
        config = ScrapeConfig(**config_kwargs)
        try:
            result = await self.client.async_scrape(config)
            cost = result.context.get("cost", "?")
            self.logger.info(
                f"[{self.SOURCE}] {result.upstream_status_code} "
                f"| credits={cost} | key#{self._key_idx + 1} | {url[:90]}"
            )
            return result
        except ScrapflyError as exc:
            if _is_credit_error(exc) and self._switch_to_next_key():
                self.logger.info(f"[{self.SOURCE}] Retrying with new key: {url[:90]}")
                result = await self.client.async_scrape(config)
                return result
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
