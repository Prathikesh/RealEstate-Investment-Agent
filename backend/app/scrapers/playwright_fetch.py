"""
Scrapfly-free fetch via headless Chromium (Playwright).

Used as a FALLBACK when Scrapfly is unavailable (no credits / suspended / error)
for the on-demand lookup feature. A real browser executes Centris's anti-bot JS
and returns the rendered HTML, which the existing parsers
(CentrisScraper._parse_detail_page) turn into a RawProperty.

Low-volume only (one page per user lookup). Not for the bulk nightly scrape.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


async def fetch_html(url: str, timeout_ms: int = 45000) -> str | None:
    """Fetch a URL's fully-rendered HTML with headless Chromium. None on failure."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("[playwright] not installed — run `python -m playwright install chromium`")
        return None

    html: str | None = None
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
            )
            try:
                ctx = await browser.new_context(
                    user_agent=_UA, viewport={"width": 1366, "height": 900}, locale="fr-CA",
                )
                page = await ctx.new_page()
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                # Let anti-bot JS settle and content render.
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass
                html = await page.content()
            finally:
                await browser.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[playwright] fetch failed for {url}: {exc}")
        return None

    return html
