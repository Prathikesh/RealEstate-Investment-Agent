"""
Unit tests for "Your Verdict" scoring (app/agent/verdict.py compute_weighted_score).

Pure-Python, no DB — run with:  .venv/bin/pytest tests/test_verdict.py -q

These lock in the behaviour the client's two Loom bug reports were about:
  * "I set Days Listed to 100% but the verdict is 30 / never passes ~55" — a
    days-listed (or discount) driven verdict must be free to reach 100 and is NOT
    crushed by the unverified-income guard.
  * fabricated (estimated) rent must still not be able to inflate the yield
    factors (cap_rate / cash_flow / grm).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.agent.verdict import (  # noqa: E402
    SCORE_FACTORS,
    UNVERIFIED_INCOME_FACTOR_CEILING,
    compute_weighted_score,
)


def only(factor: str) -> dict[str, float]:
    """Weights that put 100% on a single factor (sums to 1.0)."""
    return {f: (1.0 if f == factor else 0.0) for f in SCORE_FACTORS}


def base_components(**overrides) -> dict:
    comps = {f: 30.0 for f in SCORE_FACTORS}
    comps["unverified_income_cap"] = 0.0
    comps.update(overrides)
    return comps


# ── The core client bug: days-listed strategy must work ───────────────────────

def test_days_target_scores_100_when_beaten():
    """Set days target=30, a 60-day listing → dom_bonus factor scores 100."""
    comps = base_components(dom_bonus=30.0)  # stored band would give only 30
    score = compute_weighted_score(
        comps, only("dom_bonus"),
        buy_box={"days_on_market_min": 30},
        raw={"dom_bonus": 60},
    )
    assert score == 100


def test_days_driven_verdict_exceeds_59_even_with_estimated_income():
    """The old global cap pinned this at 59; now a non-income strategy is free."""
    comps = base_components(dom_bonus=30.0, unverified_income_cap=59.0)
    score = compute_weighted_score(
        comps, only("dom_bonus"),
        buy_box={"days_on_market_min": 30},
        raw={"dom_bonus": 90},
    )
    assert score == 100  # not clamped to 59


# ── The guard still holds: estimated rent can't inflate the yield factors ──────

def test_estimated_income_caps_a_yield_factor():
    comps = base_components(cash_flow=90.0, unverified_income_cap=59.0)
    score = compute_weighted_score(comps, only("cash_flow"))
    assert score == UNVERIFIED_INCOME_FACTOR_CEILING  # 90 → 50


def test_disclosed_income_is_not_capped():
    comps = base_components(cash_flow=90.0, unverified_income_cap=0.0)
    score = compute_weighted_score(comps, only("cash_flow"))
    assert score == 90


def test_estimated_income_cap_is_scoped_not_global():
    """Half discount (100) + half cash_flow (100→50 est.) = 75, above the old 59."""
    comps = base_components(discount=100.0, cash_flow=100.0, unverified_income_cap=59.0)
    weights = {f: 0.0 for f in SCORE_FACTORS}
    weights["discount"] = 0.5
    weights["cash_flow"] = 0.5
    score = compute_weighted_score(comps, weights)
    assert score == 75


def test_estimated_income_caps_target_relative_yield_too():
    """A cash-flow TARGET can't dodge the guard: raw beats target → 100 → capped 50."""
    comps = base_components(cash_flow=10.0, unverified_income_cap=59.0)
    score = compute_weighted_score(
        comps, only("cash_flow"),
        buy_box={"cash_flow_min": 500},
        raw={"cash_flow": 2000},  # 2000/500*100 = 400 → clamp 100 → cap 50
    )
    assert score == UNVERIFIED_INCOME_FACTOR_CEILING


# ── Misc invariants ───────────────────────────────────────────────────────────

def test_none_components_returns_none():
    assert compute_weighted_score(None, only("discount")) is None


def test_no_buy_box_matches_stored_components():
    comps = base_components(discount=80.0)
    assert compute_weighted_score(comps, only("discount")) == 80
