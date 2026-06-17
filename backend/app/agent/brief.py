"""
Stage 4 — AI Brief Generator.

Calls a local Ollama model to write a broker-focused investment brief.
All numbers are pre-calculated — the LLM only interprets and narrates.
Only runs for properties scoring >= MIN_SCORE_FOR_BRIEF (40).

Ollama must be running locally at the configured base URL (default: http://localhost:11434).
If Ollama is unavailable, generate() returns None gracefully — the pipeline continues.

Quebec market benchmarks used in prompts:
  - Good cap rate: 4.5–7%  (anything above 6% = strong)
  - GRM target:   < 13x    (lower = better cashflow)
  - Cash-on-cash: > 5%     (with 20% down, 4.5% mortgage)
  - Welcome tax:  QC droits de mutation tiers (0.5% / 1% / 1.5% / 2% / 2.5%)
"""
import logging
from typing import Optional

import httpx

from app.agent.calculator import FinancialProfile
from app.agent.scorer import ScoreResult
from app.config import settings
from app.models.property import Property

logger = logging.getLogger(__name__)

MIN_SCORE_FOR_BRIEF = 40
OLLAMA_TIMEOUT = 180.0  # seconds — generous for CPU inference


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
    ) -> Optional[str]:
        """
        Generate a broker-focused investment brief via local Ollama.
        Returns None if:
          - score is below MIN_SCORE_FOR_BRIEF
          - Ollama is not running / times out
        """
        if score.total < MIN_SCORE_FOR_BRIEF:
            logger.debug(
                f"Skipping brief for {prop.mls_number} — score {score.total} < {MIN_SCORE_FOR_BRIEF}"
            )
            return None

        system = self._system_prompt(language)
        user   = self._build_prompt(prop, fp, score, language, extra_context)
        full_prompt = f"{system}\n\n{user}"

        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model":  settings.ollama_model,
                        "prompt": full_prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,   # low temp = factual, consistent
                            "num_predict": 600,   # ~450 words output cap
                        },
                    },
                )
                response.raise_for_status()
                data  = response.json()
                brief = data.get("response", "").strip()
                logger.info(
                    f"Ollama brief generated for {prop.mls_number} "
                    f"({len(brief)} chars, model={settings.ollama_model})"
                )
                return brief or None

        except httpx.ConnectError:
            logger.warning(
                f"Ollama not reachable at {settings.ollama_base_url} — "
                f"skipping brief for {prop.mls_number}"
            )
            return None
        except httpx.TimeoutException:
            logger.warning(
                f"Ollama timed out after {OLLAMA_TIMEOUT}s — "
                f"skipping brief for {prop.mls_number}"
            )
            return None
        except Exception as exc:
            logger.error(f"Ollama error for {prop.mls_number}: {exc}")
            return None

    def _system_prompt(self, language: str) -> str:
        if language == "fr":
            return (
                "Vous êtes un analyste immobilier senior spécialisé dans le marché locatif québécois. "
                "Votre rôle est d'aider les courtiers immobiliers à évaluer si une propriété vaut la "
                "peine d'être présentée à des investisseurs. Soyez direct, factuel et précis sur les "
                "chiffres. Mentionnez toujours le taux de capitalisation par rapport aux normes du "
                "marché québécois (4,5–7%). Identifiez le profil d'investisseur cible. Ne dites jamais "
                "explicitement 'achetez' ou 'n'achetez pas' — utilisez des formulations comme "
                "'mérite l'attention', 'à évaluer soigneusement' ou 'présente des risques notables'."
            )
        return (
            "You are a senior real estate investment analyst specializing in Quebec's income property "
            "market. Your audience is real estate brokers who need to decide whether to pitch a "
            "property to their investor clients. Be direct, data-driven, and precise. Always benchmark "
            "cap rate against Quebec norms (4.5–7%). Identify the target investor profile. Never "
            "explicitly say 'buy' or 'don't buy' — use phrases like 'merits serious consideration', "
            "'warrants careful due diligence', or 'presents notable challenges'. Brokers need concrete "
            "talking points and honest risk disclosures."
        )

    def _build_prompt(
        self,
        prop: Property,
        fp: FinancialProfile,
        score: ScoreResult,
        language: str,
        extra_context: str = "",
    ) -> str:
        # Comparable context
        comp_desc = (
            f"{fp.comparable_count} comparables within {fp.search_radius_km:.0f} km"
            if fp.search_radius_km
            else f"{fp.comparable_count} comparables in {prop.city}"
        )
        discount_line = (
            f"{fp.discount_pct:+.1f}% {'below' if fp.discount_pct > 0 else 'above'} "
            f"comparable median ({_fmt(fp.comparable_median_price)})"
            if fp.discount_pct is not None
            else "no comparable data — price validation not possible"
        )
        rent_note = (
            "estimated from unit count / market rents — not disclosed in listing"
            if fp.rent_is_estimated
            else "from listing"
        )
        tax_note = (
            f"estimated using {prop.city} city rate (2025-2026) — verify actual tax bill"
            if fp.taxes_are_estimated
            else "from listing"
        )

        # Investor profile hint based on score and metrics
        profile = self._investor_profile(fp, score)

        # Quebec benchmark signals
        cap_signal = _cap_rate_signal(fp.cap_rate)
        grm_signal = _grm_signal(fp.grm)
        coc_signal = _coc_signal(fp.cash_on_cash_return)

        extra = f"\n\nADDITIONAL CONTEXT:\n{extra_context}" if extra_context else ""

        prop_label = prop.property_type.value.replace("_", " ").title()
        score_label = score.category.value.replace("_", " ").title()

        if language == "fr":
            return f"""Rédigez une analyse d'investissement de 400-450 mots destinée à un courtier immobilier québécois.
L'objectif est de déterminer si cette propriété mérite d'être présentée à des investisseurs.

═══════════════════════════════════════════════════════
FICHE PROPRIÉTÉ
═══════════════════════════════════════════════════════
Type:              {prop_label}
Adresse:           {prop.full_address}
Prix demandé:      {_fmt(fp.asking_price)}
Score opportunité: {score.total}/100 — {score_label}
Stratégie:         {score.strategy}

═══════════════════════════════════════════════════════
POSITIONNEMENT MARCHÉ ({fp.analysis_confidence.upper()} confidence)
═══════════════════════════════════════════════════════
Comparables:       {comp_desc}
Médiane comparable:{_fmt(fp.comparable_median_price)}
Écart de valeur:   {_fmt(fp.value_gap)} ({discount_line})

═══════════════════════════════════════════════════════
MÉTRIQUES FINANCIÈRES (référence marché QC)
═══════════════════════════════════════════════════════
Taux de cap:           {cap_signal}
Multiplicateur (GRM):  {grm_signal}
Rendement CoC:         {coc_signal}
Revenu locatif/mois:   {_fmt(fp.gross_rent_monthly)} ({rent_note})
Revenu brut annuel:    {_fmt(fp.gross_rent_annual)}
Charges annuelles:     {_fmt(fp.total_expenses_annual)}
  • Taxes municipales: {_fmt(fp.municipal_taxes_annual)} ({tax_note})
  • Taxes scolaires:   {_fmt(fp.school_taxes_annual)} ({tax_note})
  • Assurances:        {_fmt(fp.insurance_annual)}
  • Entretien (1%):    {_fmt(fp.maintenance_annual)}
  • Vacance (5%):      {_fmt(fp.vacancy_loss_annual)}
RNE annuel:            {_fmt(fp.noi_annual)}
Flux trésorerie/mois:  {_fmt(fp.monthly_cash_flow)} (financement 80%, 4,5%, 25 ans)

═══════════════════════════════════════════════════════
COÛTS D'ACQUISITION TOTAUX
═══════════════════════════════════════════════════════
Mise de fonds (20%):       {_fmt(fp.down_payment)}
Hypothèque mensuelle:      {_fmt(fp.monthly_mortgage)}
Droits de mutation (QC):   {_fmt(fp.welcome_tax)}
Liquidités totales req.:   {_fmt(fp.total_cash_needed)}

PROFIL D'INVESTISSEUR CIBLE: {profile}
{extra}

Structure requise (4 sections):
1. VERDICT COURTIER (2-3 phrases): Est-ce que cette propriété mérite une présentation à des clients investisseurs? Soyez direct.
2. POINTS DE VENTE CLÉS (liste à puces): 3-4 arguments que le courtier peut utiliser pour présenter cette propriété.
3. ANALYSE FINANCIÈRE: Performance par rapport aux normes québécoises. Commentez le taux de cap, le GRM et le flux de trésorerie.
4. RISQUES ET MISE EN GARDE: 2-3 risques réels à divulguer honnêtement aux acheteurs potentiels."""

        return f"""Write a 400-450 word investment brief for a Quebec real estate broker.
The goal: determine whether this property deserves a pitch to investor clients.

═══════════════════════════════════════════════════════
PROPERTY SNAPSHOT
═══════════════════════════════════════════════════════
Type:              {prop_label}
Address:           {prop.full_address}
Asking Price:      {_fmt(fp.asking_price)}
Opportunity Score: {score.total}/100 — {score_label}
Strategy:          {score.strategy}

═══════════════════════════════════════════════════════
MARKET POSITIONING ({fp.analysis_confidence.upper()} confidence)
═══════════════════════════════════════════════════════
Comparables:       {comp_desc}
Comparable Median: {_fmt(fp.comparable_median_price)}
Value Gap:         {_fmt(fp.value_gap)} ({discount_line})

═══════════════════════════════════════════════════════
FINANCIAL METRICS vs. QUEBEC MARKET BENCHMARKS
═══════════════════════════════════════════════════════
Cap Rate:              {cap_signal}
Gross Rent Multiplier: {grm_signal}
Cash-on-Cash Return:   {coc_signal}
Monthly Rental Income: {_fmt(fp.gross_rent_monthly)} ({rent_note})
Annual Gross Income:   {_fmt(fp.gross_rent_annual)}
Annual Expenses:       {_fmt(fp.total_expenses_annual)}
  • Municipal taxes:   {_fmt(fp.municipal_taxes_annual)} ({tax_note})
  • School taxes:      {_fmt(fp.school_taxes_annual)} ({tax_note})
  • Insurance:         {_fmt(fp.insurance_annual)}
  • Maintenance (1%):  {_fmt(fp.maintenance_annual)}
  • Vacancy (5%):      {_fmt(fp.vacancy_loss_annual)}
Net Operating Income:  {_fmt(fp.noi_annual)}
Monthly Cash Flow:     {_fmt(fp.monthly_cash_flow)} (80% LTV, 4.5% rate, 25yr amort.)

═══════════════════════════════════════════════════════
TOTAL ACQUISITION COSTS
═══════════════════════════════════════════════════════
Down Payment (20%):         {_fmt(fp.down_payment)}
Monthly Mortgage:           {_fmt(fp.monthly_mortgage)}
Welcome Tax (droits QC):    {_fmt(fp.welcome_tax)}
Total Cash Required:        {_fmt(fp.total_cash_needed)}

TARGET INVESTOR PROFILE: {profile}
{extra}

Required structure (4 sections):
1. BROKER VERDICT (2-3 sentences): Does this property deserve a pitch to investor clients? Be direct.
2. KEY SELLING POINTS (bullet list): 3-4 concrete talking points the broker can use when presenting.
3. FINANCIAL ANALYSIS: How do the metrics stack up against Quebec norms? Comment on cap rate, GRM, and cash flow specifically.
4. RISKS & DISCLOSURES: 2-3 real risks to honestly disclose to prospective buyers."""

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
