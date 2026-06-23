"""
BaseHttpxScraper — plain httpx replacement for BaseScrapFlyScraper.

Government sites (legisquebec, montreal.ca, canada.ca, etc.) are public
pages with no anti-bot protection, so Scrapfly is not needed.
Using httpx directly saves Scrapfly credits for property listing scrapers.

All government scrapers should inherit from this instead of BaseScrapFlyScraper.
"""
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone

import httpx

from app.scrapers.base import ScrapedRate  # reuse ScrapedRate dataclass

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
}


class HttpxResponse:
    """
    Thin wrapper around httpx.Response that exposes .content as a string,
    matching the Scrapfly ScrapeApiResponse interface used by all scrapers.

    For PDF responses, .content returns latin-1 decoded bytes so that
    callers doing response.content.encode() get the original byte sequence back.
    """

    def __init__(self, response: httpx.Response):
        self._response = response

    @property
    def content(self) -> str:
        content_type = self._response.headers.get("content-type", "")
        raw = self._response.content
        if "pdf" in content_type or raw[:4] == b"%PDF":
            return raw.decode("latin-1")
        return self._response.text


class BaseHttpxScraper(ABC):
    """
    Drop-in replacement for BaseScrapFlyScraper for public government websites.
    Exposes the same _timed_fetch / fetch / _now_iso interface so all subclasses
    work without changes beyond the import and class parent.

    render_js parameter is accepted but ignored — government sites publish
    their tax data in static HTML.
    """

    def fetch(self, url: str, render_js: bool = False) -> HttpxResponse:
        with httpx.Client(
            headers=HEADERS,
            follow_redirects=True,
            timeout=30,
        ) as client:
            response = client.get(url)
            response.raise_for_status()
            return HttpxResponse(response)

    def _timed_fetch(self, url: str, render_js: bool = False) -> tuple:
        t0 = time.monotonic()
        response = self.fetch(url, render_js=render_js)
        duration_ms = int((time.monotonic() - t0) * 1000)
        return response, duration_ms

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    @abstractmethod
    def scrape(self) -> list[ScrapedRate]: ...
