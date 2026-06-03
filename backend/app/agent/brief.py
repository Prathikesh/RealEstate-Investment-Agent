"""
Stage 4 — AI Brief Generator.

Calls Claude API to write a 400-word professional investment brief.
All numbers are pre-calculated — Claude only interprets and narrates.
Only runs for properties scoring >= MIN_SCORE_FOR_BRIEF (40).
"""
import logging
from typing import Optional

import anthropic

from app.agent.calculator import FinancialProfile
from app.agent.scorer import ScoreResult
from app.config import settings
from app.models.property import Property

logger = logging.getLogger(__name__)

MIN_SCORE_FOR_BRIEF = 40
CLAUDE_MODEL = "claude-sonnet-4-6"


def _fmt(value: Optional[float], prefix: str = "$", suffix: str = "", decimals: int = 0) -> str:
    if value is None:
        return "N/A"
    if decimals == 0:
        return f"{prefix}{value:,.0f}{suffix}"
    return f"{prefix}{value:,.{decimals}f}{suffix}"


class BriefGenerator:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def generate(
        self,
        prop: Property,
        fp: FinancialProfile,
        score: ScoreResult,
        language: str = "en",
    ) -> Optional[str]:
        """
        Generate a professional investment brief.
        Returns None if score is too low or data is insufficient.
        """
        if score.total < MIN_SCORE_FOR_BRIEF:
            logger.debug(f"Skipping brief for {prop.mls_number} — score {score.total} < {MIN_SCORE_FOR_BRIEF}")
            return None

        prompt = self._build_prompt(prop, fp, score, language)

        try:
            response = await self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=700,
                system=self._system_prompt(language),
                messages=[{"role": "user", "content": prompt}],
            )
            brief = response.content[0].text.strip()
            logger.info(f"Brief generated for {prop.mls_number} ({len(brief)} chars)")
            return brief

        except anthropic.APIError as exc:
            logger.error(f"Claude API error for {prop.mls_number}: {exc}")
            return None

    def _system_prompt(self, language: str) -> str:
        if language == "fr":
            return (
                "Vous êtes un analyste immobilier professionnel spécialisé dans les marchés "
                "locatifs du Québec. Rédigez des analyses d'investissement concises, objectives "
                "et professionnelles. Ne recommandez jamais explicitement d'acheter ou de ne pas "
                "acheter. Utilisez un langage nuancé et factuel. Répondez toujours en français."
            )
        return (
            "You are a professional real estate investment analyst specializing in Quebec's "
            "rental property market. Write concise, objective, and professional investment "
            "analyses. Never explicitly say 'buy this' or 'don't buy this' — use nuanced, "
            "factual language. Always respond in English."
        )

    def _build_prompt(
        self,
        prop: Property,
        fp: FinancialProfile,
        score: ScoreResult,
        language: str,
    ) -> str:
        comp_desc = (
            f"{fp.comparable_count} comparable properties within "
            f"{fp.search_radius_km:.0f}km" if fp.search_radius_km
            else f"{fp.comparable_count} comparable properties in {prop.city}"
        )

        discount_line = (
            f"{fp.discount_pct:+.1f}% {'below' if fp.discount_pct > 0 else 'above'} "
            f"the comparable median ({_fmt(fp.comparable_median_price)})"
            if fp.discount_pct is not None
            else "No comparable data available for pricing analysis"
        )

        rent_note = "(estimated — listing does not disclose income)" if fp.rent_is_estimated else "(from listing)"

        if language == "fr":
            return f"""Rédigez une analyse d'investissement professionnelle de 350-400 mots pour cette propriété.

PROPRIÉTÉ: {prop.property_type.value.replace('_', ' ').title()} — {prop.full_address}
PRIX DEMANDÉ: {_fmt(fp.asking_price)}
SCORE D'OPPORTUNITÉ: {score.total}/100 — {score.category.value.replace('_', ' ').title()}

ANALYSE COMPARATIVE ({fp.analysis_confidence.upper()} confidence):
• {comp_desc} analysés
• Prix médian comparable: {_fmt(fp.comparable_median_price)}
• Écart de valeur: {_fmt(fp.value_gap)} ({discount_line})

DONNÉES FINANCIÈRES:
• Revenu locatif mensuel: {_fmt(fp.gross_rent_monthly)} {rent_note}
• Revenu brut annuel: {_fmt(fp.gross_rent_annual)}
• Charges d'exploitation annuelles: {_fmt(fp.total_expenses_annual)}
• Revenu net d'exploitation (RNE): {_fmt(fp.noi_annual)}
• Taux de capitalisation: {_fmt(fp.cap_rate, prefix='', suffix='%', decimals=2)}
• Multiplicateur de revenus bruts: {_fmt(fp.grm, prefix='', decimals=1)}x
• Flux de trésorerie mensuel (mise de fonds 20%): {_fmt(fp.monthly_cash_flow)}
• Rendement cash-sur-cash: {_fmt(fp.cash_on_cash_return, prefix='', suffix='%', decimals=2)}

COÛTS D'ACQUISITION:
• Mise de fonds (20%): {_fmt(fp.down_payment)}
• Droits de mutation: {_fmt(fp.welcome_tax)}
• Paiement hypothécaire mensuel: {_fmt(fp.monthly_mortgage)} (taux 5,2%, 25 ans)
• Liquidités totales requises: {_fmt(fp.total_cash_needed)}

Structurez l'analyse en 3 paragraphes: (1) positionnement prix et comps, (2) performance financière, (3) recommandation nuancée et facteurs de risque."""

        return f"""Write a professional investment analysis of 350-400 words for this property.

PROPERTY: {prop.property_type.value.replace('_', ' ').title()} — {prop.full_address}
ASKING PRICE: {_fmt(fp.asking_price)}
OPPORTUNITY SCORE: {score.total}/100 — {score.category.value.replace('_', ' ').title()}

COMPARABLE ANALYSIS ({fp.analysis_confidence.upper()} confidence):
• {comp_desc} analyzed
• Comparable median price: {_fmt(fp.comparable_median_price)}
• Value gap: {_fmt(fp.value_gap)} ({discount_line})

FINANCIAL DATA:
• Monthly rental income: {_fmt(fp.gross_rent_monthly)} {rent_note}
• Annual gross income: {_fmt(fp.gross_rent_annual)}
• Annual operating expenses: {_fmt(fp.total_expenses_annual)}
• Net Operating Income (NOI): {_fmt(fp.noi_annual)}
• Cap rate: {_fmt(fp.cap_rate, prefix='', suffix='%', decimals=2)}
• Gross Rent Multiplier: {_fmt(fp.grm, prefix='', decimals=1)}x
• Monthly cash flow (20% down): {_fmt(fp.monthly_cash_flow)}
• Cash-on-cash return: {_fmt(fp.cash_on_cash_return, prefix='', suffix='%', decimals=2)}

ACQUISITION COSTS:
• Down payment (20%): {_fmt(fp.down_payment)}
• Welcome tax (droits de mutation): {_fmt(fp.welcome_tax)}
• Monthly mortgage payment: {_fmt(fp.monthly_mortgage)} (5.2% rate, 25yr)
• Total cash required: {_fmt(fp.total_cash_needed)}

Structure the analysis in 3 paragraphs: (1) price positioning vs comparables, (2) financial performance assessment, (3) nuanced recommendation with key risk factors."""
