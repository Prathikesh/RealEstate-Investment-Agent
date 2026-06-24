"""
Stage 4 — AI Brief Generator.

Calls Claude (Anthropic API) to write a broker-focused investment brief.
All numbers are pre-calculated — the LLM only interprets and narrates.
Only runs for properties scoring >= MIN_SCORE_FOR_BRIEF (40),
unless force=True (used for on-demand generation from the UI).

Quebec market benchmarks used in prompts:
  - Good cap rate: 4.5–7%  (anything above 6% = strong)
  - GRM target:   < 13x    (lower = better cashflow)
  - Cash-on-cash: > 5%     (with 20% down, 4.5% mortgage)
  - Welcome tax:  QC droits de mutation tiers (0.5% / 1% / 1.5% / 2% / 2.5%)
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


# Quebec market benchmarks for broker context
QC_CAP_RATE_STRONG   = 6.0   # % — very attractive
QC_CAP_RATE_GOOD     = 4.5   # % — acceptable floor
QC_GRM_TARGET        = 13.0  # x  — below this = good cash flow
QC_COC_TARGET        = 5.0   # % — cash-on-cash minimum for investors


def _fmt(value: Optional[float], prefix: str = "$", suffix: str = "", decimals: int = 0) -> str:
    if value is None:
        return "N/A"
    if decimals == 0:
        return f"{prefix}{value:,.0f}{suffix}"
    return f"{prefix}{value:,.{decimals}f}{suffix}"


def _cap_rate_signal(cap_rate: Optional[float]) -> str:
    if cap_rate is None:
        return "cap rate unavailable"
    if cap_rate >= QC_CAP_RATE_STRONG:
        return f"{cap_rate:.2f}% — STRONG (QC benchmark: >{QC_CAP_RATE_STRONG}%)"
    if cap_rate >= QC_CAP_RATE_GOOD:
        return f"{cap_rate:.2f}% — ACCEPTABLE (QC benchmark: {QC_CAP_RATE_GOOD}–{QC_CAP_RATE_STRONG}%)"
    return f"{cap_rate:.2f}% — BELOW MARKET (QC benchmark floor: {QC_CAP_RATE_GOOD}%)"


def _grm_signal(grm: Optional[float]) -> str:
    if grm is None:
        return "N/A"
    label = "GOOD" if grm < QC_GRM_TARGET else "HIGH"
    return f"{grm:.1f}x — {label} (QC target: <{QC_GRM_TARGET:.0f}x)"


def _coc_signal(coc: Optional[float]) -> str:
    if coc is None:
        return "N/A"
    label = "STRONG" if coc >= QC_COC_TARGET else "WEAK"
    return f"{coc:.2f}% — {label} (target: >{QC_COC_TARGET}%)"


class BriefGenerator:

    async def generate(
        self,
        prop: Property,
        fp: FinancialProfile,
        score: ScoreResult,
        language: str = "en",
        extra_context: str = "",
        force: bool = False,
    ) -> Optional[str]:
        """
        Generate a broker-focused investment brief via Claude (Anthropic API).
        Returns None if score is below MIN_SCORE_FOR_BRIEF (unless force=True)
        or if the API key is not configured.
        """
        if not force and score.total < MIN_SCORE_FOR_BRIEF:
            logger.debug(
                f"Skipping brief for {prop.mls_number} — score {score.total} < {MIN_SCORE_FOR_BRIEF}"
            )
            return None

        if not settings.anthropic_api_key:
            logger.warning("ANTHROPIC_API_KEY not set — skipping brief generation")
            return None

        system = self._system_prompt(language)
        user   = self._build_prompt(prop, fp, score, language, extra_context)

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            message = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=420,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            brief = message.content[0].text.strip() if message.content else ""
            logger.info(
                f"Claude brief generated for {prop.mls_number} ({len(brief)} chars)"
            )
            return brief or None

        except anthropic.AuthenticationError:
            logger.error("Anthropic API key invalid — check ANTHROPIC_API_KEY in .env")
            return None
        except Exception as exc:
            logger.error(f"Anthropic brief error for {prop.mls_number}: {exc}")
            return None

    def _system_prompt(self, language: str) -> str:
        if language == "fr":
            return (
                "Tu es un assistant immobilier qui aide des investisseurs ordinaires — pas des experts — "
                "à comprendre si une propriété vaut la peine d'être achetée. "
                "Écris en français simple et clair. Phrases courtes. Zéro jargon financier. "
                "Zéro tableau markdown. Utilise seulement ## pour les titres de section et - pour les listes. "
                "N'importe qui doit pouvoir lire et comprendre en moins d'une minute."
            )
        return (
            "You are a real estate assistant helping everyday investors — not experts — understand "
            "if a property is a good buy. Write in plain, simple English. Short sentences. "
            "No financial jargon. No markdown tables. Use only ## for section headings and - for bullet points. "
            "Anyone should be able to read and understand in under one minute."
        )

    def _build_prompt(
        self,
        prop: Property,
        fp: FinancialProfile,
        score: ScoreResult,
        language: str,
        extra_context: str = "",
    ) -> str:
        discount_line = (
            f"{fp.discount_pct:+.1f}% {'below' if fp.discount_pct > 0 else 'above'} "
            f"comparable median ({_fmt(fp.comparable_median_price)})"
            if fp.discount_pct is not None
            else "no comparable data"
        )
        rent_note  = "estimated" if fp.rent_is_estimated else "from listing"
        cap_signal = _cap_rate_signal(fp.cap_rate)
        extra      = f"\n\nADDITIONAL CONTEXT:\n{extra_context}" if extra_context else ""
        price_hist = self._format_price_history(prop.price_history)

        prop_label = prop.property_type.value.replace("_", " ").title()
        score_label = score.category.value.replace("_", " ").title()

        if language == "fr":
            return f"""Écris une analyse courte (maximum 160 mots) pour un investisseur ordinaire.
Utilise un langage simple. Aucun tableau. Pas de jargon.

DONNÉES:
- Adresse: {prop.full_address} ({prop_label})
- Prix demandé: {_fmt(fp.asking_price)}
- Score d'opportunité: {score.total}/100 ({score_label})
- Loyer mensuel: {_fmt(fp.gross_rent_monthly)} ({rent_note})
- Flux de trésorerie: {_fmt(fp.monthly_cash_flow)}/mois
- Taux de capitalisation: {cap_signal}
- Prix vs marché: {discount_line}
- Mise de fonds requise: {_fmt(fp.down_payment)} + taxes {_fmt(fp.welcome_tax)}
{extra}{price_hist}

Écris exactement 3 sections courtes:

## VERDICT
Une seule phrase claire: est-ce un bon investissement? Pourquoi?

## CE QUI EST BIEN
- 2 ou 3 points positifs concrets (chiffres à l'appui)

## À SURVEILLER
- 2 risques réels que l'acheteur doit connaître"""

        return f"""Write a SHORT analysis (max 160 words) for an everyday investor.
Plain English. No tables. No jargon. Real numbers only.

DATA:
- Address: {prop.full_address} ({prop_label})
- Asking price: {_fmt(fp.asking_price)}
- Opportunity score: {score.total}/100 ({score_label})
- Monthly rent: {_fmt(fp.gross_rent_monthly)} ({rent_note})
- Monthly cash flow: {_fmt(fp.monthly_cash_flow)}/mo after all costs
- Cap rate: {cap_signal}
- Price vs market: {discount_line}
- Cash needed to buy: {_fmt(fp.down_payment)} down + {_fmt(fp.welcome_tax)} welcome tax
{extra}{price_hist}

Write exactly 3 short sections:

## VERDICT
One clear sentence: is this a good investment? Why?

## WHAT'S WORKING
- 2 or 3 positives with real numbers

## WATCH OUT FOR
- 2 risks the buyer needs to know"""

    def _investor_profile(self, fp: FinancialProfile, score: ScoreResult) -> str:
        """Suggest the right buyer profile based on the financials."""
        cap = fp.cap_rate or 0
        coc = fp.cash_on_cash_return or 0
        cf  = fp.monthly_cash_flow or 0

        if cap >= QC_CAP_RATE_STRONG and coc >= QC_COC_TARGET and cf > 0:
            return "Cash flow investor — strong immediate returns, suitable for leveraged buyer"
        if cap >= QC_CAP_RATE_GOOD and coc >= 3.0:
            return "Buy-and-hold investor — stable income with moderate leverage tolerance"
        if (fp.discount_pct or 0) >= 5 and cap < QC_CAP_RATE_GOOD:
            return "Value-add investor — below-market price but requires income improvement"
        if cap < QC_CAP_RATE_GOOD and coc < 3.0:
            return "Long-term appreciation play — limited cash flow, suited for low-leverage or all-cash buyer"
        return "General income property investor — verify rent upside before committing"

    @staticmethod
    def _format_description(description: Optional[str]) -> str:
        if not description or not description.strip():
            return ""
        snippet = description.strip()[:450]
        if len(description.strip()) > 450:
            snippet += "…"
        return f"\n\nLISTING DESCRIPTION (from original listing):\n{snippet}"

    @staticmethod
    def _format_price_history(price_history: Optional[list]) -> str:
        if not price_history or len(price_history) < 2:
            return ""
        try:
            entries = sorted(
                [e for e in price_history if isinstance(e, dict) and e.get("price") and e.get("date")],
                key=lambda x: x["date"],
            )
            if len(entries) < 2:
                return ""
            lines = [f"\n\nPRICE HISTORY ({len(entries)} entries):"]
            for e in entries:
                event = e.get("event", "update")
                lines.append(f"  {e['date']}: ${float(e['price']):,.0f} ({event})")
            original = float(entries[0]["price"])
            current  = float(entries[-1]["price"])
            if original > 0:
                change = ((current - original) / original) * 100
                lines.append(f"  Net change from original listing: {change:+.1f}%")
            return "\n".join(lines)
        except Exception:
            return ""
