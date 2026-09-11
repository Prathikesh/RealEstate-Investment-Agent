"""
Fast plain-HTTP fetch for Centris pages.

Centris's search/listing AND detail pages are server-rendered, so a normal
HTTPS GET returns the full HTML in well under a second — no headless browser
needed. This is 30–100x faster than the Playwright path and is the primary
fetcher for the on-demand lookup; Playwright (playwright_fetch.fetch_html)
stays as a fallback for the rare case Centris serves an anti-bot challenge
instead of the page.

Detection: a real listing/search page is large and contains Centris markup; an
anti-bot interstitial (DataDome / captcha) is small or carries known markers.
We return None on anything that doesn't look like a real page so the caller
falls back to the browser fetch.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
_HEADERS = {
    "User-Agent": _UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
}

# An anti-bot interstitial is tiny and/or carries these markers.
_CHALLENGE_MARKERS = ("datadome", "captcha-delivery", "px-captcha", "/cdn-cgi/challenge")


async def fetch_html_fast(url: str, timeout: float = 20.0) -> str | None:
    """Plain-HTTP GET of a Centris page. None if blocked/challenged/failed."""
    try:
        async with httpx.AsyncClient(
            headers=_HEADERS, timeout=timeout, follow_redirects=True,
        ) as client:
            resp = await client.get(url)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[http-fast] fetch failed for {url[-60:]}: {exc}")
        return None

    if resp.status_code != 200:
        logger.info(f"[http-fast] {resp.status_code} for {url[-60:]} — will fall back")
        return None

    html = resp.text
    low = html[:4000].lower()
    if len(html) < 20_000 or any(m in low for m in _CHALLENGE_MARKERS):
        logger.info(f"[http-fast] looks like a challenge/short page for {url[-60:]} — will fall back")
        return None
    return html
