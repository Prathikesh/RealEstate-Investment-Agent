"""
Neighbourhood Context Analyzer — async DB query, no LLM.

Compares this property against other active same-type properties in the same city
to give brokers a sense of where it stands in the local market.
"""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import Property, PropertyStatus


@dataclass
class NeighbourhoodContext:
    # How many active same-type properties were found in the city
    sample_size: int

    # City-wide averages
    city_avg_price:           Optional[float]
    city_avg_price_per_sqft:  Optional[float]
    city_avg_cap_rate:        Optional[float]
    city_avg_days_on_market:  Optional[float]
    city_avg_score:           Optional[float]

    # How this property compares (positive = above city average)
    price_vs_avg_pct:         Optional[float]
    cap_rate_vs_avg_pct:      Optional[float]
    score_vs_avg_pct:         Optional[float]

    # Percentile rankings (0–100; higher = better position for that metric)
    # Price:    lower price = better deal → percentile counts how many are priced higher
    # Cap rate: higher cap rate = better → percentile counts how many are lower
    # Score:    higher score = better → percentile counts how many are lower
    price_percentile:         Optional[float]
    cap_rate_percentile:      Optional[float]
    score_percentile:         Optional[float]


class NeighbourhoodAnalyzer:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def analyze(self, prop: Property) -> NeighbourhoodContext:
        stmt = (
            select(Property)
            .where(Property.city == prop.city)
            .where(Property.property_type == prop.property_type)
            .where(Property.status.in_([PropertyStatus.ACTIVE, PropertyStatus.PRICE_CHANGED]))
            .where(Property.id != prop.id)
            .where(Property.asking_price.isnot(None))
            .limit(100)
        )
        peers = list((await self.session.scalars(stmt)).all())

        if not peers:
            return NeighbourhoodContext(
                sample_size=0,
                city_avg_price=None, city_avg_price_per_sqft=None,
                city_avg_cap_rate=None, city_avg_days_on_market=None,
                city_avg_score=None, price_vs_avg_pct=None,
                cap_rate_vs_avg_pct=None, score_vs_avg_pct=None,
                price_percentile=None, cap_rate_percentile=None,
                score_percentile=None,
            )

        # ── City averages ─────────────────────────────────────────────────────
        prices     = [p.asking_price for p in peers if p.asking_price]
        ppsf_vals  = [p.price_per_sqft for p in peers if p.price_per_sqft]
        cap_rates  = [p.cap_rate for p in peers if p.cap_rate is not None]
        dom_vals   = [p.days_on_market for p in peers if p.days_on_market is not None]
        scores     = [p.score for p in peers if p.score is not None]

        avg_price   = _avg(prices)
        avg_ppsf    = _avg(ppsf_vals)
        avg_cap     = _avg(cap_rates)
        avg_dom     = _avg(dom_vals)
        avg_score   = _avg(scores)

        # ── This property vs averages ─────────────────────────────────────────
        price_vs   = _pct_diff(prop.asking_price, avg_price)
        cap_vs     = _pct_diff(prop.cap_rate, avg_cap)
        score_vs   = _pct_diff(prop.score, avg_score)

        # ── Percentiles ───────────────────────────────────────────────────────
        # Price percentile: % of peers with HIGHER price (lower price = better)
        price_pctl   = _percentile_lower_better(prop.asking_price, prices)
        # Cap rate percentile: % of peers with LOWER cap rate (higher cap = better)
        cap_pctl     = _percentile_higher_better(prop.cap_rate, cap_rates)
        # Score percentile: % of peers with LOWER score (higher score = better)
        score_pctl   = _percentile_higher_better(prop.score, scores)

        return NeighbourhoodContext(
            sample_size=len(peers),
            city_avg_price=_round(avg_price),
            city_avg_price_per_sqft=_round(avg_ppsf, 1),
            city_avg_cap_rate=_round(avg_cap, 2),
            city_avg_days_on_market=_round(avg_dom, 0),
            city_avg_score=_round(avg_score, 1),
            price_vs_avg_pct=_round(price_vs, 1),
            cap_rate_vs_avg_pct=_round(cap_vs, 1),
            score_vs_avg_pct=_round(score_vs, 1),
            price_percentile=_round(price_pctl, 0),
            cap_rate_percentile=_round(cap_pctl, 0),
            score_percentile=_round(score_pctl, 0),
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _avg(values: list) -> Optional[float]:
    filtered = [v for v in values if v is not None]
    return sum(filtered) / len(filtered) if filtered else None


def _pct_diff(this: Optional[float], avg: Optional[float]) -> Optional[float]:
    if this is None or avg is None or avg == 0:
        return None
    return (this - avg) / avg * 100


def _percentile_lower_better(
    this: Optional[float], peers: list[float]
) -> Optional[float]:
    """Higher percentile = cheaper than most peers (better deal)."""
    if this is None or not peers:
        return None
    above = sum(1 for v in peers if v > this)
    return above / len(peers) * 100


def _percentile_higher_better(
    this: Optional[float], peers: list[float]
) -> Optional[float]:
    """Higher percentile = better than most peers for metrics like cap rate, score."""
    if this is None or not peers:
        return None
    below = sum(1 for v in peers if v < this)
    return below / len(peers) * 100


def _round(value: Optional[float], decimals: int = 0) -> Optional[float]:
    if value is None:
        return None
    return round(value, decimals)
