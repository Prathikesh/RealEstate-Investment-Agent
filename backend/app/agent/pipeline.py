"""
AI Investment Pipeline — orchestrates all 4 stages for one property.

Stage 1: ComparableFinder  → ComparableSet
Stage 2: FinancialCalculator → FinancialProfile
Stage 3: OpportunityScorer  → ScoreResult
Stage 4: BriefGenerator     → str (Claude API)

Then writes all results back to the Property record.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.brief import BriefGenerator
from app.agent.calculator import FinancialCalculator
from app.agent.comparables import ComparableFinder
from app.agent.scorer import OpportunityScorer
from app.models.property import AnalysisConfidence, Property, ScoreCategory

logger = logging.getLogger(__name__)


class InvestmentPipeline:
    def __init__(self, session: AsyncSession, generate_brief: bool = True):
        self.session         = session
        self.comp_finder     = ComparableFinder(session)
        self.calculator      = FinancialCalculator()
        self.scorer          = OpportunityScorer()
        self.brief_generator = BriefGenerator() if generate_brief else None

    async def run(
        self,
        prop: Property,
        strategy: str = "both",
        language: str = "en",
    ) -> Property:
        """
        Run the full pipeline for one property.
        Updates the property record in-place and marks needs_reanalysis=False.
        Does NOT commit — caller is responsible.
        """
        logger.info(f"Pipeline starting: {prop.mls_number} — {prop.full_address}")

        # Stage 1
        comp_set = await self.comp_finder.find(prop)
        logger.info(
            f"  Comps: {comp_set.count} found | "
            f"median={comp_set.median_price} | confidence={comp_set.confidence}"
        )

        # Stage 2
        fp = self.calculator.calculate(prop, comp_set)
        logger.info(
            f"  Financials: cap={fp.cap_rate}% | "
            f"cf={fp.monthly_cash_flow}/mo | discount={fp.discount_pct}%"
        )

        # Stage 3
        score = self.scorer.score(fp, strategy=strategy, days_on_market=prop.days_on_market)
        logger.info(f"  Score: {score.total}/100 — {score.category.value}")

        # Stage 4 (optional)
        brief_en = brief_fr = None
        if self.brief_generator and score.total >= 40:
            brief_en = await self.brief_generator.generate(prop, fp, score, language="en")
            if score.total >= 60:
                brief_fr = await self.brief_generator.generate(prop, fp, score, language="fr")

        # Write results back to property
        self._update_property(prop, comp_set, fp, score, brief_en, brief_fr)
        return prop

    async def run_pending(
        self,
        limit: int = 50,
        strategy: str = "both",
        language: str = "en",
    ) -> dict:
        """
        Process all properties with needs_reanalysis=True.
        Returns summary stats.
        """
        stmt = (
            select(Property)
            .where(Property.needs_reanalysis == True)  # noqa: E712
            .where(Property.asking_price.isnot(None))
            .limit(limit)
        )
        properties = list((await self.session.scalars(stmt)).all())
        logger.info(f"Processing {len(properties)} pending properties")

        stats = {"processed": 0, "errors": 0, "scores": []}

        for prop in properties:
            try:
                await self.run(prop, strategy=strategy, language=language)
                stats["processed"] += 1
                stats["scores"].append(prop.score)
            except Exception as exc:  # noqa: BLE001
                logger.error(f"Pipeline error for {prop.mls_number}: {exc}")
                stats["errors"] += 1

        await self.session.flush()
        return stats

    @staticmethod
    def _update_property(prop, comp_set, fp, score, brief_en, brief_fr) -> None:
        now = datetime.now(timezone.utc)

        # Comparable data
        prop.comparable_count        = comp_set.count
        prop.comparable_median_price = comp_set.median_price
        prop.comparable_mean_price   = comp_set.mean_price
        prop.value_gap               = fp.value_gap
        prop.discount_pct            = fp.discount_pct

        # Financial metrics
        prop.cap_rate             = fp.cap_rate
        prop.noi_annual           = fp.noi_annual
        prop.grm                  = fp.grm
        prop.monthly_cash_flow    = fp.monthly_cash_flow
        prop.cash_on_cash_return  = fp.cash_on_cash_return
        prop.welcome_tax          = fp.welcome_tax
        prop.down_payment_20pct   = fp.down_payment
        prop.monthly_mortgage     = fp.monthly_mortgage

        # Score
        prop.score          = score.total
        prop.score_category = score.category

        # Confidence
        conf_map = {"high": AnalysisConfidence.HIGH, "medium": AnalysisConfidence.MEDIUM, "low": AnalysisConfidence.LOW}
        prop.analysis_confidence = conf_map.get(fp.analysis_confidence, AnalysisConfidence.LOW)

        # Briefs
        if brief_en:
            prop.ai_brief_en = brief_en
        if brief_fr:
            prop.ai_brief_fr = brief_fr

        prop.last_analyzed_at = now
        prop.needs_reanalysis  = False
