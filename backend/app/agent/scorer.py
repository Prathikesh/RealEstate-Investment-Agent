"""
Stage 3 — Opportunity Scorer.
Rule-based 0-100 score. No LLM involved.

Weights shift based on broker's investment strategy:
  buy_and_hold  → income metrics matter more (cap rate, cash flow)
  buy_fix_sell  → discount metrics matter more (gap vs market)
  both          → balanced

Score categories:
  80-100  strong_opportunity
  60-79   worth_investigating
  40-59   market_price
  0-39    not_recommended
"""
from dataclasses import dataclass
from typing import Optional

from app.agent.calculator import FinancialProfile
from app.models.property import ScoreCategory


@dataclass
class ScoreResult:
    total: int                          # 0-100
    category: ScoreCategory
    components: dict[str, float]        # breakdown for transparency
    strategy: str


# ── Weight sets ───────────────────────────────────────────────────────────────

WEIGHTS: dict[str, dict[str, float]] = {
    "buy_and_hold": {
        "discount":   0.25,
        "cap_rate":   0.30,
        "cash_flow":  0.25,
        "confidence": 0.10,
        "dom_bonus":  0.10,
    },
    "buy_fix_sell": {
        "discount":   0.45,
        "cap_rate":   0.10,
        "cash_flow":  0.10,
        "confidence": 0.15,
        "dom_bonus":  0.20,
    },
    "both": {
        "discount":   0.35,
        "cap_rate":   0.20,
        "cash_flow":  0.18,
        "confidence": 0.12,
        "dom_bonus":  0.15,
    },
}


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _normalize(value: float, bad: float, good: float) -> float:
    """Linear scale from bad→0 to good→100."""
    if good == bad:
        return 50.0
    return _clamp((value - bad) / (good - bad) * 100)


class OpportunityScorer:

    def score(
        self,
        fp: FinancialProfile,
        strategy: str = "both",
        days_on_market: Optional[int] = None,
    ) -> ScoreResult:
        weights = WEIGHTS.get(strategy, WEIGHTS["both"])
        components: dict[str, float] = {}

        # ── Discount vs market (how far below comparable median) ──────────────
        discount_score = 0.0
        if fp.discount_pct is not None:
            # 0% discount → 20 pts, 20%+ → 100 pts
            discount_score = _normalize(fp.discount_pct, -10, 20)
        components["discount"] = round(discount_score, 1)

        # ── Cap rate (Quebec avg ~2.3%) ────────────────────────────────────────
        cap_rate_score = 0.0
        if fp.cap_rate is not None:
            # 1% → 0, 5%+ → 100
            cap_rate_score = _normalize(fp.cap_rate, 1.0, 5.0)
        components["cap_rate"] = round(cap_rate_score, 1)

        # ── Monthly cash flow ─────────────────────────────────────────────────
        cash_flow_score = 0.0
        if fp.monthly_cash_flow is not None:
            # -$3000/mo → 0, +$500/mo → 100
            cash_flow_score = _normalize(fp.monthly_cash_flow, -3000, 500)
        components["cash_flow"] = round(cash_flow_score, 1)

        # ── Data confidence ───────────────────────────────────────────────────
        confidence_map = {"high": 90.0, "medium": 55.0, "low": 20.0}
        confidence_score = confidence_map.get(fp.analysis_confidence, 20.0)
        # Penalize heavily when no comps at all
        if fp.comparable_count == 0:
            confidence_score = 5.0
        components["confidence"] = round(confidence_score, 1)

        # ── Days-on-market bonus (motivated seller signal) ────────────────────
        dom_score = 30.0   # neutral baseline
        if days_on_market is not None:
            if days_on_market > 90:
                dom_score = 80.0    # stale listing = motivated seller
            elif days_on_market > 45:
                dom_score = 55.0
            elif days_on_market < 7:
                dom_score = 15.0    # brand new = full price expected
        components["dom_bonus"] = round(dom_score, 1)

        # ── Weighted total ────────────────────────────────────────────────────
        total = sum(
            components[key] * weight
            for key, weight in weights.items()
        )
        total_int = min(100, max(0, round(total)))

        # ── Category ─────────────────────────────────────────────────────────
        if total_int >= 80:
            category = ScoreCategory.STRONG_OPPORTUNITY
        elif total_int >= 60:
            category = ScoreCategory.WORTH_INVESTIGATING
        elif total_int >= 40:
            category = ScoreCategory.MARKET_PRICE
        else:
            category = ScoreCategory.NOT_RECOMMENDED

        return ScoreResult(
            total=total_int,
            category=category,
            components=components,
            strategy=strategy,
        )
