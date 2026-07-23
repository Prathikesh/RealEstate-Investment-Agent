"""
AI Investment Pipeline — orchestrates all stages for one property.

Stage 1: ComparableFinder       → ComparableSet
Stage 2: CalcEngine + Financial → FinancialProfile (live Quebec taxes)
Stage 3: Risk + Neighbourhood   → feeds into scorer as modifiers
Stage 4: OpportunityScorer      → ScoreResult (uses all signals)
Stage 5: ZoningMatcher + RebuildEconomics → development-potential signal
Stage 6: BriefGenerator         → str (Claude API, includes description + price history)

Then writes all results back to the Property record.
"""
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.brief import BriefGenerator
from app.agent.calculator import FinancialCalculator
from app.agent.comparables import ComparableFinder
from app.agent.market_benchmark import MarketBenchmark, MarketBenchmarkComparator
from app.agent.neighbourhood import NeighbourhoodAnalyzer, NeighbourhoodContext
from app.agent.rebuild_economics import RebuildEconomicsCalculator
from app.agent.risk import RiskAssessment, RiskAssessor
from app.agent.scorer import OpportunityScorer
from app.agent.zoning_matcher import ZoningMatcher, current_units
from app.models.property import AnalysisConfidence, Property, ScoreCategory
from app.models.zoning import ZoningZone
from app.services.calc_client import analyze as calc_engine_analyze

logger = logging.getLogger(__name__)


class InvestmentPipeline:
    def __init__(self, session: AsyncSession, generate_brief: bool = True):
        self.session          = session
        self.comp_finder      = ComparableFinder(session)
        self.calculator       = FinancialCalculator()
        self.scorer           = OpportunityScorer()
        self.zoning_matcher   = ZoningMatcher(session)
        self.rebuild_calc     = RebuildEconomicsCalculator()
        self.benchmark_comparator = MarketBenchmarkComparator()
        self.brief_generator  = BriefGenerator() if generate_brief else None

    async def run(
        self,
        prop: Property,
        strategy: str = "both",
        language: str = "en",
        force_brief: bool = False,
    ) -> Property:
        """
        Run the full pipeline for one property.
        Updates the property record in-place and marks needs_reanalysis=False.
        Does NOT commit — caller is responsible.
        """
        logger.info(f"Pipeline starting: {prop.mls_number} — {prop.full_address}")

        # Stage 1 — comparables
        comp_set = await self.comp_finder.find(prop)
        logger.info(
            f"  Comps: {comp_set.count} found | "
            f"median={comp_set.median_price} | confidence={comp_set.confidence}"
        )

        # Stage 2a — colleague's calculation engine (accurate Quebec taxes + investment metrics)
        calc_fields = await calc_engine_analyze(prop)
        if calc_fields:
            logger.info(
                f"  CalcEngine: welcome_tax={calc_fields.get('welcome_tax','—')} | "
                f"cap={calc_fields.get('cap_rate','—')}% | "
                f"noi={calc_fields.get('noi_annual','—')} | "
                f"cf/mo={calc_fields.get('monthly_cash_flow','—')}"
            )
        else:
            logger.debug("  CalcEngine: unavailable, using estimates")

        # Stage 2b — our financial calculator (provides fallback + comparables analysis)
        fp = self.calculator.calculate(prop, comp_set)

        # Merge calc engine results into FinancialProfile so scorer uses accurate values
        if calc_fields:
            if "cap_rate"          in calc_fields: fp.cap_rate          = calc_fields["cap_rate"]
            if "noi_annual"        in calc_fields: fp.noi_annual        = calc_fields["noi_annual"]
            if "monthly_cash_flow" in calc_fields: fp.monthly_cash_flow = calc_fields["monthly_cash_flow"]
            if "welcome_tax"       in calc_fields: fp.welcome_tax       = calc_fields["welcome_tax"]
            if "monthly_mortgage"  in calc_fields: fp.monthly_mortgage  = calc_fields["monthly_mortgage"]
            if "municipal_taxes_annual" in calc_fields:
                fp.municipal_taxes_annual = calc_fields["municipal_taxes_annual"]
                fp.taxes_are_estimated    = False
            if "school_taxes_annual" in calc_fields:
                fp.school_taxes_annual = calc_fields["school_taxes_annual"]

        logger.info(
            f"  Financials: cap={fp.cap_rate}% | "
            f"cf={fp.monthly_cash_flow}/mo | discount={fp.discount_pct}% | "
            f"taxes_live={not fp.taxes_are_estimated}"
        )

        # Stage 2c — Market Benchmark (Colliers cap rate cross-check, informational only)
        benchmark: Optional[MarketBenchmark] = None
        try:
            benchmark = self.benchmark_comparator.compare(prop, fp.cap_rate)
            if benchmark:
                logger.debug(
                    f"  Benchmark: {benchmark.position} Colliers "
                    f"{benchmark.city_key} band ({benchmark.band_low*100:.2f}-{benchmark.band_high*100:.2f}%)"
                )
        except Exception as exc:
            logger.warning(f"  Market benchmark failed: {exc}")

        # Stage 3a — Risk Assessment (feeds into scorer)
        risk: Optional[RiskAssessment] = None
        try:
            risk = RiskAssessor().assess(prop, fp)
            logger.debug(f"  Risk: {risk.overall_risk.value} ({len(risk.items)} items)")
        except Exception as exc:
            logger.warning(f"  Risk assessment failed: {exc}")

        # Stage 3b — Neighbourhood Context (feeds into scorer)
        neighbourhood: Optional[NeighbourhoodContext] = None
        try:
            neighbourhood = await NeighbourhoodAnalyzer(self.session).analyze(prop)
            logger.debug(f"  Neighbourhood: {neighbourhood.sample_size} peers")
        except Exception as exc:
            logger.warning(f"  Neighbourhood analysis failed: {exc}")

        # Stage 4 — Scorer (now uses calc-engine data + risk + neighbourhood + price history)
        score = self.scorer.score(
            fp,
            strategy=strategy,
            days_on_market=prop.days_on_market,
            risk=risk,
            neighbourhood=neighbourhood,
            price_history=prop.price_history,
        )
        logger.info(
            f"  Score: {score.total}/100 — {score.category.value} | "
            f"risk_mod={score.components.get('risk_modifier', 0):+.0f} | "
            f"nbhd_mod={score.components.get('neighbourhood_modifier', 0):+.0f}"
        )

        # Stage 5 — Zoning match + rebuild-to-max economics (development potential)
        zone: Optional[ZoningZone] = None
        rebuild_scenario = None
        try:
            zone = await self.zoning_matcher.match(prop)
            if zone:
                max_units = (zone.rules or {}).get("max_units")
                if max_units:
                    rebuild_scenario = self.rebuild_calc.calculate(
                        prop,
                        target_units=max_units,
                        current_units=current_units(prop),
                        is_open_ended_target=bool((zone.rules or {}).get("is_open_ended")),
                    )
                logger.info(
                    f"  Zoning: {zone.zone_code} | "
                    f"upside={'yes' if rebuild_scenario else 'no'}"
                )
        except Exception as exc:
            logger.warning(f"  Zoning match failed: {exc}")

        # Stage 6 — AI Brief (includes description, price history, risk/neighbourhood/zoning context)
        brief_en = brief_fr = None
        extra_context = self._build_brief_context(risk, neighbourhood, zone, rebuild_scenario)
        if self.brief_generator and (force_brief or score.total >= 40):
            brief_en = await self.brief_generator.generate(
                prop, fp, score, language="en", extra_context=extra_context, force=force_brief
            )
            if force_brief or score.total >= 60:
                brief_fr = await self.brief_generator.generate(
                    prop, fp, score, language="fr", extra_context=extra_context, force=force_brief
                )

        # Write results back to property (calc_fields written directly to model)
        self._update_property(
            prop, comp_set, fp, score, brief_en, brief_fr, calc_fields, zone, rebuild_scenario, benchmark
        )
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
                # Use a savepoint so a single property failure doesn't
                # abort the whole PostgreSQL transaction for the batch.
                async with self.session.begin_nested():
                    await self.run(prop, strategy=strategy, language=language)
                stats["processed"] += 1
                stats["scores"].append(prop.score)
            except Exception as exc:  # noqa: BLE001
                logger.error(f"Pipeline error for {prop.mls_number}: {exc}")
                stats["errors"] += 1
                # Savepoint was auto-rolled back; session is still usable.

        return stats

    @staticmethod
    def _build_brief_context(
        risk: Optional[RiskAssessment],
        neighbourhood: Optional[NeighbourhoodContext],
        zone: Optional[ZoningZone] = None,
        rebuild_scenario=None,
    ) -> str:
        lines: list[str] = []
        if risk and risk.items:
            lines.append(f"RISK PROFILE: {risk.overall_risk.value.upper()}")
            for item in risk.items[:3]:
                lines.append(f"  • [{item.severity.value.upper()}] {item.label}: {item.description}")
        if neighbourhood and neighbourhood.sample_size > 0:
            lines.append(
                f"NEIGHBOURHOOD ({neighbourhood.sample_size} peers): "
                f"price vs avg {neighbourhood.price_vs_avg_pct:+.1f}%, "
                f"cap rate percentile {neighbourhood.cap_rate_percentile:.0f}th, "
                f"score percentile {neighbourhood.score_percentile:.0f}th"
                if neighbourhood.cap_rate_percentile is not None and neighbourhood.score_percentile is not None
                else f"NEIGHBOURHOOD ({neighbourhood.sample_size} peers found)"
            )
        if zone and rebuild_scenario:
            plus = "+" if rebuild_scenario.is_open_ended_target else ""
            lines.append(
                f"ZONING (zone {zone.zone_code}): currently {rebuild_scenario.current_units} unit(s), "
                f"zoning permits {rebuild_scenario.target_units}{plus} — "
                f"rebuild-to-max is a rough planning estimate: "
                f"~${rebuild_scenario.total_rebuild_cost:,.0f} rebuild cost, "
                f"projected value ~${rebuild_scenario.projected_new_value:,.0f} "
                f"(net upside ~${rebuild_scenario.net_upside:,.0f} before financing/soft-cost overruns — "
                f"mention this is indicative only, not a guarantee)"
            )
        return "\n".join(lines)

    @staticmethod
    def _update_property(
        prop, comp_set, fp, score, brief_en, brief_fr,
        calc_fields: dict | None = None,
        zone: Optional[ZoningZone] = None,
        rebuild_scenario=None,
        benchmark: Optional[MarketBenchmark] = None,
    ) -> None:
        now = datetime.now(timezone.utc)

        # Comparable data
        prop.comparable_count        = comp_set.count
        prop.comparable_median_price = comp_set.median_price
        prop.comparable_mean_price   = comp_set.mean_price
        prop.comparable_ids          = [str(c.property_id) for c in comp_set.comparables]
        prop.value_gap               = fp.value_gap
        prop.discount_pct            = fp.discount_pct

        # Financial metrics — use colleague's calc engine values when available,
        # otherwise fall back to our own estimates from FinancialCalculator
        prop.cap_rate            = fp.cap_rate           # already merged from calc_fields
        prop.noi_annual          = fp.noi_annual
        prop.grm                 = fp.grm
        prop.monthly_cash_flow   = fp.monthly_cash_flow
        prop.cash_on_cash_return = fp.cash_on_cash_return
        # Welcome tax scraped from Centris's own calculator is authoritative;
        # only fall back to calc-engine / local bracket estimates without it
        scraped_wt = (prop.raw_expenses or {}).get("welcome_tax_centris")
        prop.welcome_tax         = scraped_wt or fp.welcome_tax
        prop.down_payment_20pct  = fp.down_payment
        prop.monthly_mortgage    = fp.monthly_mortgage

        # Write calc engine tax values directly to property (they're not in FinancialProfile)
        if calc_fields:
            if "municipal_taxes_annual" in calc_fields:
                prop.municipal_taxes_annual = calc_fields["municipal_taxes_annual"]
            if "school_taxes_annual" in calc_fields:
                prop.school_taxes_annual = calc_fields["school_taxes_annual"]
            if "down_payment_20pct" in calc_fields:
                prop.down_payment_20pct = calc_fields["down_payment_20pct"]

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

        # Compute price_per_sqft if not already set by the scraper
        if prop.price_per_sqft is None and prop.asking_price and prop.sqft_total and prop.sqft_total > 0:
            prop.price_per_sqft = round(prop.asking_price / prop.sqft_total, 2)

        # Zoning match + rebuild economics
        if zone:
            prop.zoning_zone_id    = zone.id
            prop.zoning_matched_at = now
        if rebuild_scenario:
            prop.rebuild_economics = asdict(rebuild_scenario)

        # Colliers cap rate benchmark (informational only)
        if benchmark:
            prop.market_benchmark = asdict(benchmark)
