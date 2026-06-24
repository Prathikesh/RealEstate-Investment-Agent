"""
Stage 3 — Opportunity Scorer.
Rule-based 0-100 score. No LLM involved.

Weights shift based on broker's investment strategy:
  buy_and_hold  → income metrics matter more (cap rate, cash flow, GRM)
  buy_fix_sell  → discount and seller-motivation metrics matter more
  both          → balanced

Risk and neighbourhood are applied as post-modifiers AFTER the weighted base score:
  - CRITICAL risk: hard cap at 35 (forces not_recommended)
  - 2+ HIGH risks:  -15 points
  - 1 HIGH risk:    -8 points
  - MEDIUM only:    -3 points
  - Neighbourhood top quartile (≥75th):  +5 points
  - Neighbourhood bottom quartile (<25th): -5 points
  - High cap-rate percentile (≥80th):    +3 additional points

Score categories:
  80-100  strong_opportunity
  60-79   worth_investigating
  40-59   market_price
  0-39    not_recommended
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from app.agent.calculator import FinancialProfile
from app.models.property import ScoreCategory

if TYPE_CHECKING:
    from app.agent.neighbourhood import NeighbourhoodContext
    from app.agent.risk import RiskAssessment


@dataclass
class ScoreResult:
    total: int                          # 0-100
    category: ScoreCategory
    components: dict[str, float]        # breakdown for transparency
    strategy: str


# ── Weight sets ───────────────────────────────────────────────────────────────
# Weights must sum to 1.0 per strategy.

WEIGHTS: dict[str, dict[str, float]] = {
    "buy_and_hold": {
        "discount":        0.18,
        "cap_rate":        0.27,
        "cash_flow":       0.22,
        "grm":             0.10,
        "confidence":      0.11,
        "dom_bonus":       0.07,
        "price_history":   0.05,
    },
    "buy_fix_sell": {
        "discount":        0.38,
        "cap_rate":        0.08,
        "cash_flow":       0.08,
        "grm":             0.05,
        "confidence":      0.13,
        "dom_bonus":       0.18,
        "price_history":   0.10,
    },
    "both": {
        "discount":        0.28,
        "cap_rate":        0.18,
        "cash_flow":       0.17,
        "grm":             0.07,
        "confidence":      0.10,
        "dom_bonus":       0.13,
        "price_history":   0.07,
    },
}


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _normalize(value: float, bad: float, good: float) -> float:
    """Linear scale from bad→0 to good→100. Works for both ascending and descending metrics."""
    if good == bad:
        return 50.0
    return _clamp((value - bad) / (good - bad) * 100)


def _price_history_signal(price_history: Optional[list]) -> float:
    """
    Score 0-100 based on price change history.
    Multiple price drops = motivated seller = better for buyer.
    Price increase = overconfident seller = worse for buyer.
    """
    if not price_history or len(price_history) < 2:
        return 30.0  # neutral when no history

    try:
        entries = [
            e for e in price_history
            if isinstance(e, dict) and e.get("price")
        ]
        if len(entries) < 2:
            return 30.0

        prices = [float(e["price"]) for e in entries]
        original = prices[0]
        current  = prices[-1]

        if original <= 0:
            return 30.0

        drops    = sum(1 for i in range(1, len(prices)) if prices[i] < prices[i - 1])
        pct_drop = ((original - current) / original) * 100

        if drops >= 2:
            return _clamp(55.0 + pct_drop * 2.5)   # very motivated seller
        if drops == 1:
            return _clamp(45.0 + pct_drop * 2.0)   # some motivation
        if current > original:
            return 15.0                             # price raised = overconfident
        return 30.0

    except Exception:
        return 30.0


class OpportunityScorer:

    def score(
        self,
        fp: FinancialProfile,
        strategy: str = "both",
        days_on_market: Optional[int] = None,
        risk: Optional["RiskAssessment"] = None,
        neighbourhood: Optional["NeighbourhoodContext"] = None,
        price_history: Optional[list] = None,
    ) -> ScoreResult:
        weights = WEIGHTS.get(strategy, WEIGHTS["both"])
        components: dict[str, float] = {}

        # ── Discount vs comparable median ──────────────────────────────────────
        # 0% discount → 20 pts, 20%+ below market → 100 pts
        discount_score = 0.0
        if fp.discount_pct is not None:
            discount_score = _normalize(fp.discount_pct, -10, 20)
        components["discount"] = round(discount_score, 1)

        # ── Cap rate (QC benchmark: 4.5% acceptable, 6%+ strong) ─────────────
        cap_rate_score = 0.0
        if fp.cap_rate is not None:
            cap_rate_score = _normalize(fp.cap_rate, 1.0, 6.0)
        components["cap_rate"] = round(cap_rate_score, 1)

        # ── Monthly cash flow ──────────────────────────────────────────────────
        cash_flow_score = 0.0
        if fp.monthly_cash_flow is not None:
            cash_flow_score = _normalize(fp.monthly_cash_flow, -3000, 500)
        components["cash_flow"] = round(cash_flow_score, 1)

        # ── Gross Rent Multiplier (lower = better) ─────────────────────────────
        # QC range ~10-18x. bad=18x → 0, good=10x → 100
        grm_score = 30.0
        if fp.grm is not None:
            grm_score = _normalize(fp.grm, 18.0, 10.0)
        components["grm"] = round(grm_score, 1)

        # ── Data confidence ────────────────────────────────────────────────────
        confidence_map = {"high": 90.0, "medium": 55.0, "low": 20.0}
        confidence_score = confidence_map.get(fp.analysis_confidence, 20.0)
        if fp.comparable_count == 0:
            confidence_score = 5.0
        # Small bonus when live calc-engine tax data is available (not estimated)
        if not fp.taxes_are_estimated:
            confidence_score = min(100.0, confidence_score + 5.0)
        components["confidence"] = round(confidence_score, 1)

        # ── Days-on-market signal (motivated seller) ───────────────────────────
        dom_score = 30.0
        if days_on_market is not None:
            if days_on_market > 90:
                dom_score = 80.0
            elif days_on_market > 45:
                dom_score = 55.0
            elif days_on_market < 7:
                dom_score = 15.0
        components["dom_bonus"] = round(dom_score, 1)

        # ── Price history signal (motivated seller via price reductions) ────────
        ph_score = _price_history_signal(price_history)
        # Take the more optimistic signal when both DOM and price-history point to motivation
        if price_history and days_on_market is not None and days_on_market > 45:
            ph_score = max(ph_score, dom_score)
        components["price_history"] = round(ph_score, 1)

        # ── Weighted base score ────────────────────────────────────────────────
        total = sum(components[key] * weight for key, weight in weights.items())

        # ── Risk modifier (post-processing) ────────────────────────────────────
        risk_modifier = 0.0
        if risk is not None and risk.items:
            severities = [item.severity.value for item in risk.items]
            if "critical" in severities:
                total = min(total, 35.0)   # hard cap at not_recommended
                risk_modifier = -99.0      # sentinel: "capped by critical risk"
            else:
                high_count = severities.count("high")
                if high_count >= 2:
                    risk_modifier = -15.0
                elif high_count == 1:
                    risk_modifier = -8.0
                elif "medium" in severities:
                    risk_modifier = -3.0
                total += risk_modifier
        components["risk_modifier"] = round(risk_modifier, 1)

        # ── Neighbourhood modifier (post-processing) ───────────────────────────
        neighbourhood_modifier = 0.0
        if neighbourhood is not None and neighbourhood.sample_size >= 5:
            pctl = neighbourhood.score_percentile
            if pctl is not None:
                if pctl >= 75:
                    neighbourhood_modifier += 5.0
                elif pctl <= 25:
                    neighbourhood_modifier -= 5.0
            # Additional boost for standout cap rate vs peers
            cap_pctl = neighbourhood.cap_rate_percentile
            if cap_pctl is not None and cap_pctl >= 80:
                neighbourhood_modifier += 3.0
        total += neighbourhood_modifier
        components["neighbourhood_modifier"] = round(neighbourhood_modifier, 1)

        total_int = min(100, max(0, round(total)))

        # ── Category ──────────────────────────────────────────────────────────
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
