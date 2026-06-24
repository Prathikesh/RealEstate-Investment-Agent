"""
Full Analysis Orchestrator.

Runs the complete investment analysis pipeline for a single property:
  1. Comparables (existing Stage 1)
  2. Financial Calculator (existing Stage 2)
  3. Opportunity Scorer (existing Stage 3)
  4. Risk Assessment (new)
  5. 5-Year Projection (new)
  6. Renovation ROI (new)
  7. Neighbourhood Context (new)
  8. AI Brief via Ollama (Stage 4, rewritten)

Results are returned as a FullAnalysisResult — NOT written to the database.
This endpoint is on-demand and always computes fresh results.
"""
import uuid
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.brief import BriefGenerator
from app.agent.calculator import FinancialCalculator, FinancialProfile
from app.agent.comparables import ComparableFinder
from app.agent.neighbourhood import NeighbourhoodAnalyzer, NeighbourhoodContext
from app.agent.projector import FiveYearProjection, FiveYearProjector
from app.agent.renovation import RenovationAnalyzer, RenovationROI
from app.agent.risk import RiskAssessment, RiskAssessor
from app.agent.scorer import OpportunityScorer, ScoreResult
from app.models.property import Property

logger = logging.getLogger(__name__)


@dataclass
class FullAnalysisResult:
    property_id:   uuid.UUID
    full_address:  str
    financial:     FinancialProfile
    score:         ScoreResult
    risk:          RiskAssessment
    projection:    FiveYearProjection
    renovation:    RenovationROI
    neighbourhood: NeighbourhoodContext
    ai_brief:      Optional[str]
    computed_at:   str   # ISO 8601 UTC timestamp


async def run_full_analysis(
    property_id: uuid.UUID,
    db: AsyncSession,
) -> FullAnalysisResult:
    """
    Entry point for the full analysis pipeline.
    Raises ValueError if the property is not found.
    """
    # ── 1. Fetch property ──────────────────────────────────────────────────────
    result = await db.execute(
        select(Property).where(Property.id == property_id)
    )
    prop: Optional[Property] = result.scalar_one_or_none()
    if prop is None:
        raise ValueError(f"Property {property_id} not found")

    logger.info(f"[full_analysis] Starting for {prop.mls_number or prop.id} — {prop.full_address}")

    # ── 2. Comparables ────────────────────────────────────────────────────────
    comp_set = await ComparableFinder(db).find(prop)

    # ── 3. Financial Calculator ───────────────────────────────────────────────
    fp = FinancialCalculator().calculate(prop, comp_set)

    # ── 4. Opportunity Scorer ─────────────────────────────────────────────────
    score = OpportunityScorer().score(fp, strategy="both", days_on_market=prop.days_on_market)

    # ── 5. Risk Assessment ────────────────────────────────────────────────────
    risk = RiskAssessor().assess(prop, fp)

    # ── 6. 5-Year Projection ──────────────────────────────────────────────────
    projection = FiveYearProjector().project(prop, fp)

    # ── 7. Renovation ROI ─────────────────────────────────────────────────────
    renovation = RenovationAnalyzer().analyze(prop, fp)

    # ── 8. Neighbourhood Context (async DB query) ─────────────────────────────
    neighbourhood = await NeighbourhoodAnalyzer(db).analyze(prop)

    # ── 9. Build extra context for the Ollama brief ───────────────────────────
    extra_context = _build_extra_context(risk, projection, neighbourhood)

    # ── 10. AI Brief via Ollama ───────────────────────────────────────────────
    ai_brief = await BriefGenerator().generate(prop, fp, score, "en", extra_context)

    computed_at = datetime.now(timezone.utc).isoformat()
    logger.info(
        f"[full_analysis] Complete for {prop.mls_number or prop.id} — "
        f"score={score.total}, risk={risk.overall_risk.value}, brief={'yes' if ai_brief else 'no'}"
    )

    return FullAnalysisResult(
        property_id=prop.id,
        full_address=prop.full_address or "",
        financial=fp,
        score=score,
        risk=risk,
        projection=projection,
        renovation=renovation,
        neighbourhood=neighbourhood,
        ai_brief=ai_brief,
        computed_at=computed_at,
    )


def _build_extra_context(
    risk: RiskAssessment,
    projection: FiveYearProjection,
    neighbourhood: NeighbourhoodContext,
) -> str:
    """Summarise the new analysis sections for inclusion in the Ollama brief prompt."""
    lines: list[str] = []

    # Risk summary
    if risk.items:
        lines.append(f"RISK PROFILE: {risk.overall_risk.value.upper()}")
        for item in risk.items[:3]:   # top 3 risks only to keep prompt manageable
            lines.append(f"  • [{item.severity.value.upper()}] {item.label}: {item.description}")

    # 5-year projection headline
    if projection.snapshots:
        snap5 = projection.snapshots[-1]
        lines.append(
            f"5-YEAR PROJECTION: Property value → ${snap5.property_value:,.0f}, "
            f"Equity → ${snap5.equity:,.0f}, "
            f"Cumulative cash flow → ${snap5.cumulative_cash_flow:,.0f}"
        )
        if projection.total_return_pct is not None:
            lines.append(f"  Total return: {projection.total_return_pct:.1f}% "
                         f"(annualized: {projection.annualized_return:.2f}%)")

    # Neighbourhood position
    if neighbourhood.sample_size > 0:
        lines.append(
            f"NEIGHBOURHOOD CONTEXT ({neighbourhood.sample_size} peers in same city/type): "
            f"Price vs avg: {_sign(neighbourhood.price_vs_avg_pct)}%, "
            f"Cap rate vs avg: {_sign(neighbourhood.cap_rate_vs_avg_pct)}%, "
            f"Score percentile: {neighbourhood.score_percentile:.0f}th"
            if neighbourhood.score_percentile is not None else
            f"NEIGHBOURHOOD CONTEXT ({neighbourhood.sample_size} peers found)"
        )

    return "\n".join(lines)


def _sign(value: Optional[float]) -> str:
    if value is None:
        return "N/A"
    return f"{value:+.1f}"
