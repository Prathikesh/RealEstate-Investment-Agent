"""
Shared "Your Verdict" scoring — the broker-personalized recombination of a
property's stored score_components with the broker's own factor weights.

This is the server-side twin of the frontend lib/verdict.ts computeWeightedScore():
a transparent weighted sum of the 7 base factors, WITHOUT the risk / neighbourhood /
unverified-income modifiers the AI score applies (those depend on data the pure
recombination can't see). By computing it in-DB we can rank the ENTIRE property set
by a broker's own metrics with correct sorting + pagination — the client's
"all properties analyzed on their own metrics" request — instead of only re-sorting
one page in the browser.

Keep SCORE_FACTORS and the fallback presets in sync with:
  - backend  app/agent/scorer.py  (WEIGHTS)
  - frontend src/lib/verdict.ts    (SCORE_FACTORS, STRATEGY_WEIGHTS)
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Float, case, cast, func

from app.agent.scorer import WEIGHTS
from app.models.broker import Broker
from app.models.property import Property

# The 7 weighted base factors. Order/keys must match scorer.py + verdict.ts.
SCORE_FACTORS: tuple[str, ...] = (
    "discount",
    "cap_rate",
    "cash_flow",
    "grm",
    "confidence",
    "dom_bonus",
    "price_history",
)


def weights_are_valid(weights: Optional[dict]) -> bool:
    """True when weights cover all 7 factors and sum to ~1.0 (backend accepts ±0.01)."""
    if not isinstance(weights, dict):
        return False
    if not all(isinstance(weights.get(f), (int, float)) for f in SCORE_FACTORS):
        return False
    return abs(sum(float(weights[f]) for f in SCORE_FACTORS) - 1.0) <= 0.01


def effective_weights(broker: Optional[Broker]) -> dict[str, float]:
    """
    The weight set to use for a broker's Your Verdict:
      1. their custom_score_weights if valid,
      2. else their investment_strategy preset,
      3. else the balanced "both" preset.
    Mirrors the frontend VerdictCompare resolution exactly.
    """
    if broker is not None:
        custom = broker.custom_score_weights
        if weights_are_valid(custom):
            return {f: float(custom[f]) for f in SCORE_FACTORS}
        strategy = getattr(broker.investment_strategy, "value", broker.investment_strategy)
        if strategy in WEIGHTS:
            return WEIGHTS[strategy]
    return WEIGHTS["both"]


def weighted_score_expr(weights: dict[str, float]):
    """
    SQLAlchemy expression computing the Your Verdict score in-DB from
    Property.score_components (JSONB, per-factor 0-100 sub-scores).

    Returns NULL for legacy rows that have no score_components yet, so callers can
    order_by(...).nullslast() and keep un-scored properties out of the ranking
    until the backfill populates them.
    """
    total = None
    for f in SCORE_FACTORS:
        comp = func.coalesce(cast(Property.score_components[f].astext, Float), 0.0)
        term = comp * float(weights.get(f, 0.0))
        total = term if total is None else total + term
    # Data-integrity guard: when the listing's income was estimated (not disclosed),
    # the AI hard-caps the score (unverified_income_cap = 59) so fabricated cap_rate/
    # cash_flow can't top the ranking. Your Verdict honours the SAME cap — it's not a
    # weighting preference, it's protection from fake numbers — so it stays in sync
    # with the frontend compute_weighted_score() and never surfaces estimated-income
    # listings above disclosed-income ones just because a broker weighted yield high.
    cap = cast(Property.score_components["unverified_income_cap"].astext, Float)
    total = case((cap > 0, func.least(total, cap)), else_=total)
    # NULL when there's no breakdown at all (legacy, pre-score_components rows).
    return case((Property.score_components.is_(None), None), else_=total)


def compute_weighted_score(
    components: Optional[dict], weights: dict[str, float]
) -> Optional[int]:
    """
    Pure-Python twin of weighted_score_expr — the Your Verdict score for a single
    property's components. Used off the request path (alerts, backfill checks).
    Returns None when there are no components (mirrors the SQL NULL branch).
    """
    if not isinstance(components, dict):
        return None
    total = sum(
        float(components.get(f) or 0.0) * float(weights.get(f, 0.0))
        for f in SCORE_FACTORS
    )
    cap = components.get("unverified_income_cap")
    if isinstance(cap, (int, float)) and cap > 0:
        total = min(total, float(cap))
    return clamp_round(total)


def clamp_round(value: Optional[float]) -> Optional[int]:
    """Clamp a raw weighted score to 0-100 and round to an int (None stays None)."""
    if value is None:
        return None
    return max(0, min(100, round(value)))


def your_verdict_category(score: Optional[int]) -> Optional[str]:
    """Same thresholds as backend ScoreCategory / frontend categoryForScore."""
    if score is None:
        return None
    if score >= 80:
        return "strong_opportunity"
    if score >= 60:
        return "worth_investigating"
    if score >= 40:
        return "market_price"
    return "not_recommended"
