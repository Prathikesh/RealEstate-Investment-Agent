"""
"Your Verdict" scoring — buy-box fit model.

The broker sets real-number TARGETS (their "buy box"): cash flow $/mo, cap rate %,
price discount %, days listed, and GRM. "Your Verdict" is how well a listing FITS
those targets — nothing is weighted by hidden percentages, and nothing is hidden by
hard filters. Every listing stays visible on the Properties page; the buy box only
RANKS them (best-fit first). This replaces the old weighted-sum + strategy-weights
model, which nobody could explain (the client's repeated feedback).

Per factor:
    higher-is-better:  fit = (raw − bad) / (target − bad) × 100   (cash flow, cap, discount, days)
    lower-is-better:   fit = (bad − raw) / (bad − target) × 100   (GRM)
`bad` is the metric's worst-case anchor (reused from scorer.py bands); `target` is the
broker's number = "fully satisfies me" (=100). Clamped 0–RANK_CEILING so that beating
a target still separates the very best deals when ranking (display is clamped to 100
by clamp_round in the route).

Blend (weak-spot aware — one dealbreaker can't hide behind good numbers):
    Your Verdict = 0.65 × average(fits) + 0.35 × worst(fit)
over only the factors the broker actually set a target for. No targets → fall back to
the platform AI score, so "My Metrics" with an empty buy box just mirrors AI ranking.

Data-integrity guard: when a listing's rent is ESTIMATED (not disclosed), the yield
factors (cap rate / cash flow / GRM) are capped at UNVERIFIED_INCOME_FACTOR_CEILING so
fabricated income can't fake a perfect fit. (The AI score keeps its own 59 cap in
scorer.py — unchanged.)

Keep this in sync with the frontend twin  src/lib/verdict.ts.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Float, case, cast, func

from app.models.property import Property

# The 7 AI-score base factors — still used by scripts/backfill_score_components.py
# to seed Property.score_components for the AI score. NOT used by Your Verdict below.
SCORE_FACTORS: tuple[str, ...] = (
    "discount", "cap_rate", "cash_flow", "grm",
    "confidence", "dom_bonus", "price_history",
)

# Estimated-rent ceiling on yield factors (see module docstring).
INCOME_FACTOR_CEILING: float = 50.0
UNVERIFIED_INCOME_FACTOR_CEILING: float = INCOME_FACTOR_CEILING  # back-compat alias

# Fits are clamped to this for RANKING so beating a target still separates the best
# deals; the per-card display value is clamped to 100 by clamp_round.
RANK_CEILING: float = 150.0

# Blend weights: 0.65 × average + 0.35 × worst.
BLEND_AVG = 0.65
BLEND_WORST = 0.35


# ── Per-factor fit configuration ──────────────────────────────────────────────
# One entry per buy-box target. `raw` names the same-unit metric; `bad` is the
# worst-case anchor (fit → 0); `higher` is the metric direction; `income` marks
# the yield factors that the estimated-rent ceiling applies to.
_FIT_CONFIG: dict[str, dict] = {
    "cash_flow_min":      {"raw": "cash_flow", "bad": -3000.0, "higher": True,  "income": True},
    "cap_rate_min":       {"raw": "cap_rate",  "bad": 1.0,     "higher": True,  "income": True},
    "discount_min":       {"raw": "discount",  "bad": -10.0,   "higher": True,  "income": False},
    "days_on_market_min": {"raw": "days",      "bad": 0.0,     "higher": True,  "income": False},
    "grm_max":            {"raw": "grm",       "bad": 18.0,    "higher": False, "income": True},
}


def days_on_market_expr():
    """
    Live days-on-market as a SQL float — single source of truth for filter, sort,
    and fit scoring. Uses the real listing date (listed_at) when known, else the
    first_seen_at fallback (always set, so never NULL).
    """
    return func.extract(
        "epoch", func.now() - func.coalesce(Property.listed_at, Property.first_seen_at)
    ) / 86400.0


def _sql_raw_expr(raw_name: str):
    """The Property column / expression a fit factor is scored against."""
    if raw_name == "cash_flow":
        return Property.monthly_cash_flow
    if raw_name == "cap_rate":
        return Property.cap_rate
    if raw_name == "discount":
        return Property.discount_pct
    if raw_name == "days":
        return days_on_market_expr()
    if raw_name == "grm":
        return Property.grm
    return None


def _target_is_valid(key: str, target: float) -> bool:
    """
    A target only participates when it lies inside the factor's scoring span.
    Higher-is-better needs target > bad (so a negative cash-flow target like −600 is
    valid, since bad = −3000). Lower-is-better (GRM) needs 0 < target < bad. An
    out-of-span target (e.g. days = 0) means "no target set" and is skipped.
    """
    cfg = _FIT_CONFIG[key]
    if cfg["higher"]:
        return target > cfg["bad"]
    return 0.0 < target < cfg["bad"]


def _active_targets(buy_box: Optional[dict]) -> list[tuple[str, float]]:
    """(key, target) pairs for the buy-box factors with a valid target set."""
    buy_box = buy_box or {}
    out: list[tuple[str, float]] = []
    for key in _FIT_CONFIG:
        target = buy_box.get(key)
        if target is None:
            continue
        t = float(target)
        if _target_is_valid(key, t):
            out.append((key, t))
    return out


# ── SQL expression (ranks the whole set in-DB) ────────────────────────────────

def _sql_fit_expr(key: str, target: float, income_estimated):
    cfg = _FIT_CONFIG[key]
    bad = cfg["bad"]
    # NULL raw → coalesce to bad so the fraction is 0 (can't verify it meets target).
    raw = func.coalesce(_sql_raw_expr(cfg["raw"]), bad)
    if cfg["higher"]:
        frac = (raw - bad) / (target - bad)
    else:
        frac = (bad - raw) / (bad - target)
    fit = func.least(RANK_CEILING, func.greatest(0.0, frac * 100.0))
    if cfg["income"]:
        fit = case((income_estimated, func.least(fit, INCOME_FACTOR_CEILING)), else_=fit)
    return fit


def fit_score_expr(buy_box: Optional[dict] = None):
    """
    SQLAlchemy expression computing "Your Verdict" (the buy-box fit blend) in-DB, so
    the whole property set can be ranked + paginated by a broker's own numbers.

    Returns the raw blend (0–RANK_CEILING); the route clamps the displayed value to
    100 via clamp_round and orders by this raw expression. With no valid targets it
    falls back to the platform AI score (Property.score) so an empty buy box mirrors
    AI ranking.
    """
    targets = _active_targets(buy_box)
    if not targets:
        return cast(Property.score, Float)

    income_estimated = (
        func.coalesce(cast(Property.score_components["unverified_income_cap"].astext, Float), 0.0) > 0
    )
    fits = [_sql_fit_expr(key, t, income_estimated) for key, t in targets]

    total = fits[0]
    for e in fits[1:]:
        total = total + e
    avg = total / float(len(fits))
    worst = fits[0] if len(fits) == 1 else func.least(*fits)
    return BLEND_AVG * avg + BLEND_WORST * worst


# Back-compat name: the route imports weighted_score_expr. It no longer takes weights.
def weighted_score_expr(buy_box: Optional[dict] = None):
    return fit_score_expr(buy_box)


# ── Pure-Python twin (off the request path: alerts, backfill checks, tests) ────

def compute_fit_score(
    buy_box: Optional[dict],
    raw: Optional[dict],
    income_estimated: bool = False,
    ai_score: Optional[int] = None,
) -> Optional[int]:
    """
    Python twin of fit_score_expr for a single listing. `raw` supplies the same-unit
    metric per factor keyed by the config `raw` name (cash_flow, cap_rate, discount,
    days, grm). Returns the display score (0–100) or `ai_score` when no targets are set.
    """
    raw = raw or {}
    targets = _active_targets(buy_box)
    if not targets:
        return ai_score

    fits: list[float] = []
    for key, t in targets:
        cfg = _FIT_CONFIG[key]
        rv = raw.get(cfg["raw"])
        if rv is None:
            fit = 0.0
        else:
            if cfg["higher"]:
                fit = (float(rv) - cfg["bad"]) / (t - cfg["bad"]) * 100.0
            else:
                fit = (cfg["bad"] - float(rv)) / (cfg["bad"] - t) * 100.0
            fit = max(0.0, min(RANK_CEILING, fit))
        if cfg["income"] and income_estimated:
            fit = min(fit, INCOME_FACTOR_CEILING)
        fits.append(fit)

    avg = sum(fits) / len(fits)
    worst = min(fits)
    return clamp_round(BLEND_AVG * avg + BLEND_WORST * worst)


def clamp_round(value: Optional[float]) -> Optional[int]:
    """Clamp a raw score to 0–100 and round to an int (None stays None)."""
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
