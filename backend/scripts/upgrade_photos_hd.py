"""
Upgrade already-stored property photos to HD by rewriting the size in each URL.

Both Centris and ReMax bake the image size into the photo URL, so we can bump
existing listings to high-resolution WITHOUT re-scraping (no Scrapfly credits):
  - Centris: media.ashx  w=320/640  → w=1024&h=1024   (largest preset, ~300KB)
  - ReMax:   /img/www_medium/…       → /img/www_full/… (~850KB, keeps aspect)

Uses the exact same hi_res_photo() helpers the scrapers now use going forward,
so stored URLs match freshly-scraped ones.

Run from backend/ with:
  python scripts/upgrade_photos_hd.py --dry-run
  python scripts/upgrade_photos_hd.py
  python scripts/upgrade_photos_hd.py --source centris
  python scripts/upgrade_photos_hd.py --source remax
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("upgrade_photos_hd")

from app.database import AsyncSessionLocal
from app.models.property import Property
from app.scrapers.centris import hi_res_photo as centris_hi_res
from app.scrapers.remax import hi_res_photo as remax_hi_res

REWRITERS = {"centris": centris_hi_res, "remax": remax_hi_res}


async def run(sources: list[str], dry_run: bool) -> None:
    for source in sources:
        rewrite = REWRITERS[source]
        async with AsyncSessionLocal() as session:
            rows = (await session.execute(
                select(Property).where(Property.primary_source == source)
            )).scalars().all()

            changed = photos_upgraded = 0
            for prop in rows:
                if not prop.photos:
                    continue
                new_photos = [rewrite(u) for u in prop.photos]
                if new_photos != prop.photos:
                    diff = sum(1 for a, b in zip(prop.photos, new_photos) if a != b)
                    photos_upgraded += diff
                    changed += 1
                    if not dry_run:
                        prop.photos = new_photos
                        flag_modified(prop, "photos")

            logger.info(
                f"[{source}] {len(rows)} properties scanned → "
                f"{changed} would be upgraded ({photos_upgraded} photo URLs)"
                + ("  [DRY RUN]" if dry_run else "")
            )
            if not dry_run:
                await session.commit()
                logger.info(f"[{source}] committed {changed} properties to HD")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upgrade stored photos to HD (URL rewrite, no scraping)")
    parser.add_argument("--source", choices=["centris", "remax", "all"], default="all")
    parser.add_argument("--dry-run", action="store_true", help="Report counts without writing")
    args = parser.parse_args()

    sources = ["centris", "remax"] if args.source == "all" else [args.source]
    asyncio.run(run(sources=sources, dry_run=args.dry_run))
