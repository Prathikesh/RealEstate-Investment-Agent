"""
Closing Costs Calculator — Notary fees, appraisal, inspection.

These are estimates (is_estimate=True) — no single authoritative source exists.
Ranges are based on Quebec market norms. The user should verify with their notary.
"""
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult


class ClosingCostsCalculator(BaseCalculator):

    def calculate(self, purchase_price: Decimal) -> tuple[CalcResult, CalcResult, CalcResult]:
        """Returns (notary_result, appraisal_result, inspection_result)."""

        # Notary fees: tiered estimate based on purchase price
        if purchase_price < Decimal("300000"):
            notary_estimate = Decimal("1200")
        elif purchase_price < Decimal("600000"):
            notary_estimate = Decimal("1800")
        elif purchase_price < Decimal("1000000"):
            notary_estimate = Decimal("2200")
        else:
            notary_estimate = Decimal("2500")

        notary = CalcResult(
            calculator_id="notary_fees",
            label="Notary Fees",
            value=notary_estimate,
            steps=[self._step(
                1,
                f"Notary fee estimate for property at ${purchase_price:,.2f}",
                "Estimate based on purchase price range",
                {"purchase_price": str(purchase_price)},
                notary_estimate, notary_estimate,
            )],
            breakdown=[self._breakdown("Estimated notary fees", notary_estimate)],
            source=self._source(
                "Quebec Notaries Act, RLRQ c N-3. Fees are negotiable.",
                notes="Ranges: <$300K ~$1,200 | $300K–$600K ~$1,800 | $600K–$1M ~$2,200 | >$1M ~$2,500",
            ),
            data_version="estimate",
            scraped_at="N/A",
            is_estimate=True,
            warnings=["Notary fees are negotiable. Verify with your notary before closing."],
        )

        appraisal = CalcResult(
            calculator_id="appraisal_fee",
            label="Appraisal Fee",
            value=Decimal("450"),
            steps=[self._step(1, "Typical appraisal fee in Quebec", "market estimate",
                              {}, Decimal("450"), Decimal("450"))],
            breakdown=[self._breakdown("Appraisal fee", Decimal("450"))],
            source=self._source(
                "Ordre des évaluateurs agréés du Québec. Market estimate $300–$600.",
            ),
            data_version="estimate",
            scraped_at="N/A",
            is_estimate=True,
            warnings=["Appraisal may not be required if lender waives it."],
        )

        inspection = CalcResult(
            calculator_id="inspection_fee",
            label="Home Inspection Fee",
            value=Decimal("550"),
            steps=[self._step(1, "Typical inspection fee in Quebec", "market estimate",
                              {}, Decimal("550"), Decimal("550"))],
            breakdown=[self._breakdown("Inspection fee", Decimal("550"))],
            source=self._source(
                "Association des inspecteurs en bâtiment du Québec. Market estimate $400–$700.",
            ),
            data_version="estimate",
            scraped_at="N/A",
            is_estimate=True,
        )

        return notary, appraisal, inspection
