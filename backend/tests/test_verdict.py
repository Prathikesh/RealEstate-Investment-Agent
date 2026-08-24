"""
Unit tests for "Your Verdict" — the buy-box FIT model (app/agent/verdict.py).

Pure-Python, no DB — run with:  .venv/bin/pytest tests/test_verdict.py -q

These lock in the behaviour the client's bug reports were about:
  * A strict buy box RANKS listings, it never hard-filters them to nothing
    (that's enforced in the route; here we assert the score is always produced).
  * A NEGATIVE cash-flow target (e.g. −600/mo) is honoured, not silently dropped
    (the old raw/target model ignored any target ≤ 0).
  * A single dealbreaker pulls the score down (weak-spot blend), so four good
    numbers can't hide one terrible one.
  * Fabricated (estimated) rent still can't inflate the yield factors.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.agent.verdict import (  # noqa: E402
    INCOME_FACTOR_CEILING,
    compute_fit_score,
)


# ── Ranking / target-relative behaviour ───────────────────────────────────────

def test_days_target_met_scores_full():
    """days target=30, a 60-day listing beats it → single-factor fit → 100."""
    assert compute_fit_score({"days_on_market_min": 30}, {"days": 60}) == 100


def test_negative_cash_flow_target_is_honoured():
    """A −600/mo target is valid (bad=−3000); +100/mo beats it → high score.

    The OLD model required target>0 and did raw/target*100, so this case scored 0
    or was skipped entirely — the client's exact complaint."""
    assert compute_fit_score({"cash_flow_min": -600}, {"cash_flow": 100}) == 100


def test_below_target_scores_proportionally():
    """cap target=6 (bad=1); a 3.5% listing → (3.5-1)/(6-1)=50%."""
    assert compute_fit_score({"cap_rate_min": 6}, {"cap_rate": 3.5}) == 50


def test_grm_is_lower_is_better():
    """GRM target≤10 (bad=18); grm=14 → (18-14)/(18-10)=50%."""
    assert compute_fit_score({"grm_max": 10}, {"grm": 14}) == 50


# ── Weak-spot blend: one dealbreaker pulls the score down ──────────────────────

def test_weak_spot_pulls_score_down():
    """cap great (fit 125), discount terrible (fit ~33): blend well below the mean."""
    # cap: (6-1)/(5-1)=125 ; discount: (0+10)/(20+10)=33.33
    # avg=79.17, worst=33.33 -> 0.65*79.17 + 0.35*33.33 = 63.1
    score = compute_fit_score(
        {"cap_rate_min": 5, "discount_min": 20},
        {"cap_rate": 6, "discount": 0},
    )
    assert score == 63


# ── Estimated-rent guard still holds on yield factors ──────────────────────────

def test_estimated_income_caps_yield_factor():
    """Estimated rent → cash-flow fit capped at the income ceiling (50)."""
    score = compute_fit_score(
        {"cash_flow_min": 500}, {"cash_flow": 2000}, income_estimated=True,
    )
    assert score == INCOME_FACTOR_CEILING  # 50


def test_disclosed_income_is_not_capped():
    score = compute_fit_score(
        {"cash_flow_min": 500}, {"cash_flow": 2000}, income_estimated=False,
    )
    assert score == 100  # beats target, no cap


def test_estimated_guard_is_scoped_to_yield_only():
    """A discount target (not a yield factor) is free even when income is estimated."""
    score = compute_fit_score(
        {"discount_min": 10}, {"discount": 20}, income_estimated=True,
    )
    assert score == 100  # discount beats target, no income cap


# ── Fallbacks / invariants ────────────────────────────────────────────────────

def test_no_targets_falls_back_to_ai_score():
    assert compute_fit_score({}, {}, ai_score=73) == 73


def test_no_targets_no_ai_score_is_none():
    assert compute_fit_score({}, {}) is None


def test_missing_raw_metric_scores_zero_not_crash():
    """A listing with no cap_rate can't be verified against the target → 0, not error."""
    assert compute_fit_score({"cap_rate_min": 6}, {"cap_rate": None}) == 0


def test_zero_days_target_means_off():
    """days=0 is out-of-span (bad=0) → treated as 'no target' → AI fallback."""
    assert compute_fit_score({"days_on_market_min": 0}, {"days": 40}, ai_score=55) == 55
