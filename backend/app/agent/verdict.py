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

# The yield factors that are derived from the listing's rental income. When rent
# is only ESTIMATED (not disclosed), these can't be trusted as a positive signal,
# so Your Verdict clamps each of them to a neutral ceiling instead of hard-capping
# the whole score. That way a broker's discount- or days-listed-driven verdict is
# free to exceed 59, while fabricated rent still can't inflate the yield factors.
# (The AI score keeps its own global 59 cap in scorer.py — unchanged.)
INCOME_FACTORS: frozenset[str] = frozenset({"cap_rate", "cash_flow", "grm"})
UNVERIFIED_INCOME_FACTOR_CEILING: float = 50.0

# ── Target-relative scoring ("in numbers, not percentages") ───────────────────
# When a broker sets a real-number buy-box target for a factor, that factor's
# sub-score is recomputed RELATIVE TO THEIR TARGET instead of the scorer's global
# band. Their number defines what "fully satisfies me" (=100); below it scores
# proportionally lower. This makes the client's mental model literally true:
# "I want long-listed → set days=90 → a 90+-day listing scores 100 on that factor."
#
# Only these four factors support it — they each map to a real numeric metric on
# Property AND to a buy-box target the client can type in. The other three (grm,
# confidence, price_history) have no user-facing target and keep their stored
# component. Keys must stay in sync with frontend lib/buybox.ts + verdict.ts.
_TARGET_KEY: dict[str, str] = {
    "discount":  "discount_min",         # % below comparable median
    "cap_rate":  "cap_rate_min",         # % cap rate
    "cash_flow": "cash_flow_min",        # $/mo cash flow
    "dom_bonus": "days_on_market_min",   # days listed
}


def days_on_market_expr():
    """
    Live days-on-market as a SQL float, single source of truth for filter, sort,
    and target-relative scoring. Uses the real listing date when known
    (listed_at), else the first_seen_at fallback (always set, so never NULL).
    """
    return func.extract(
        "epoch", func.now() - func.coalesce(Property.listed_at, Property.first_seen_at)
    ) / 86400.0


def _raw_metric_expr(factor: str):
    """The raw, same-unit metric a target-relative factor is scored against."""
    if factor == "discount":
        return Property.discount_pct
    if factor == "cap_rate":
        return Property.cap_rate
    if factor == "cash_flow":
        return Property.monthly_cash_flow
    if factor == "dom_bonus":
        return days_on_market_expr()
    return None


def _target_relative_expr(raw, target: float):
    """clamp(raw / target * 100, 0, 100) — meets-or-beats the broker's own number → 100."""
    return func.least(100.0, func.greatest(0.0, raw / float(target) * 100.0))


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


def weighted_score_expr(weights: dict[str, float], buy_box: Optional[dict] = None):
    """
    SQLAlchemy expression computing the Your Verdict score in-DB from
    Property.score_components (JSONB, per-factor 0-100 sub-scores).

    When `buy_box` carries a real-number target for a factor, that factor is scored
    RELATIVE TO THE TARGET (see _target_relative_expr) instead of using its stored
    global component — the client's "in numbers" request. Factors without a target
    keep their stored component, so a broker with no buy box behaves exactly as before.

    Returns NULL for legacy rows that have no score_components yet, so callers can
    order_by(...).nullslast() and keep un-scored properties out of the ranking
    until the backfill populates them.
    """
    buy_box = buy_box or {}
    # Data-integrity guard flag: unverified_income_cap > 0 means the listing's rent
    # was estimated, not disclosed. We clamp only the yield factors below (not the
    # whole score) so fabricated rent can't inflate cap_rate/cash_flow/grm while a
    # discount- or days-listed-driven verdict is still free to exceed 59.
    income_estimated = (
        func.coalesce(cast(Property.score_components["unverified_income_cap"].astext, Float), 0.0) > 0
    )
    total = None
    for f in SCORE_FACTORS:
        stored = func.coalesce(cast(Property.score_components[f].astext, Float), 0.0)
        target = buy_box.get(_TARGET_KEY[f]) if f in _TARGET_KEY else None
        if target is not None and float(target) > 0:
            raw = _raw_metric_expr(f)
            # Fall back to the stored component when the raw metric is NULL (e.g. a
            # listing with no cap_rate) so a missing value never scores a hard 0.
            comp = case((raw.is_(None), stored), else_=_target_relative_expr(raw, float(target)))
        else:
            comp = stored
        # Neutralize a yield factor when income is only estimated — see INCOME_FACTORS.
        if f in INCOME_FACTORS:
            comp = case(
                (income_estimated, func.least(comp, UNVERIFIED_INCOME_FACTOR_CEILING)),
                else_=comp,
            )
        term = comp * float(weights.get(f, 0.0))
        total = term if total is None else total + term
    # NULL when there's no breakdown at all (legacy, pre-score_components rows).
    return case((Property.score_components.is_(None), None), else_=total)


def compute_weighted_score(
    components: Optional[dict],
    weights: dict[str, float],
    buy_box: Optional[dict] = None,
    raw: Optional[dict] = None,
) -> Optional[int]:
    """
    Pure-Python twin of weighted_score_expr — the Your Verdict score for a single
    property's components. Used off the request path (alerts, backfill checks).

    `buy_box` + `raw` enable target-relative scoring: `raw` supplies the same-unit
    metric per factor (discount, cap_rate, cash_flow, dom_bonus) and, when a target
    is set, that factor scores clamp(raw/target*100). Falls back to the stored
    component when no target or the raw value is missing.

    Returns None when there are no components (mirrors the SQL NULL branch).
    """
    if not isinstance(components, dict):
        return None
    buy_box = buy_box or {}
    raw = raw or {}
    cap = components.get("unverified_income_cap")
    income_estimated = isinstance(cap, (int, float)) and cap > 0
    total = 0.0
    for f in SCORE_FACTORS:
        stored = float(components.get(f) or 0.0)
        target = buy_box.get(_TARGET_KEY[f]) if f in _TARGET_KEY else None
        rv = raw.get(f)
        if target is not None and float(target) > 0 and rv is not None:
            comp = max(0.0, min(100.0, float(rv) / float(target) * 100.0))
        else:
            comp = stored
        # Neutralize a yield factor when income is only estimated — see INCOME_FACTORS.
        if f in INCOME_FACTORS and income_estimated:
            comp = min(comp, UNVERIFIED_INCOME_FACTOR_CEILING)
        total += comp * float(weights.get(f, 0.0))
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
