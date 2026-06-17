from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import httpx

router = APIRouter(prefix="/api/images", tags=["images"])

_BASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

# CDN hosts that require a matching Referer from their own domain
_REFERER_MAP: dict[str, str] = {
    "centris.ca":   "https://www.centris.ca/",
    "realtor.ca":   "https://www.realtor.ca/",
    "remax.ca":     "https://www.remax.ca/",
    "zolo.ca":      "https://www.zolo.ca/",
}


def _referer_for(host: str) -> str | None:
    for domain, referer in _REFERER_MAP.items():
        if host == domain or host.endswith("." + domain):
            return referer
    return None


@router.get("/proxy")
async def proxy_image(url: str = Query(...)):
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Only HTTPS URLs allowed")
    host = parsed.netloc.lower()
    if host in ("localhost", "127.0.0.1", "0.0.0.0") or host.startswith("192.168.") or host.startswith("10."):
        raise HTTPException(status_code=400, detail="Private hosts not allowed")

    headers = dict(_BASE_HEADERS)
    referer = _referer_for(host)
    if referer:
        headers["Referer"] = referer

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers=headers)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch image")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Upstream error")

    content_type = resp.headers.get("content-type", "image/jpeg")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="URL did not return an image")

    return StreamingResponse(
        iter([resp.content]),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
