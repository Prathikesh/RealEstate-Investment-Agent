"""
BaseScrapFlyScraper — wraps the ScrapFly SDK.

All scrapers inherit from this. They call self.fetch(url) and parse the HTML.
ScrapFly handles anti-bot, JS rendering, and proxy rotation automatically.
"""
import time
from abc import ABC, abstractmethod

from scrapfly import ScrapeApiResponse, ScrapeConfig, ScrapflyClient

from app.config import settings


class ScrapedRate:
    """Structured result from a scraper."""

    def __init__(
        self,
        rate_type: str,
        value: str,
        unit: str,
        source_url: str,
        source_law: str = "",
        data_version: str = "",
        scraped_at: str = "",
    ):
        self.rate_type = rate_type
        self.value = value
        self.unit = unit
        self.source_url = source_url
        self.source_law = source_law
        self.data_version = data_version
        self.scraped_at = scraped_at
        self.error: str | None = None

    @classmethod
    def failure(cls, rate_type: str, source_url: str, error: str) -> "ScrapedRate":
        obj = cls(rate_type=rate_type, value="", unit="", source_url=source_url)
        obj.error = error
        return obj

    @property
    def success(self) -> bool:
        return self.error is None


class BaseScrapFlyScraper(ABC):
    """
    Base class for all ScrapFly-based scrapers.

    Subclasses implement scrape() and return a list[ScrapedRate].
    A single scraper may return multiple rates (e.g., GST + rebate threshold).
    """

    def __init__(self):
        self._client = ScrapflyClient(key=settings.scrapfly_api_key)

    def fetch(self, url: str, render_js: bool = False) -> ScrapeApiResponse:
        """
        Fetch a page via ScrapFly.
        - asp=True: bypass anti-scraping protection
        - country="CA": use a Canadian IP address
        - render_js: set True for JavaScript-heavy pages
        """
        config = ScrapeConfig(
            url=url,
            asp=True,
            country="CA",
            render_js=render_js,
        )
        return self._client.scrape(config)

    @abstractmethod
    def scrape(self) -> list[ScrapedRate]:
        """
        Perform the scrape. Return a list of ScrapedRate objects.
        NEVER raise — return ScrapedRate.failure(...) on errors.
        """
        ...

    def _now_iso(self) -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    def _timed_fetch(self, url: str, render_js: bool = False):
        """Fetch and return (response, duration_ms)."""
        t0 = time.monotonic()
        response = self.fetch(url, render_js=render_js)
        duration_ms = int((time.monotonic() - t0) * 1000)
        return response, duration_ms
