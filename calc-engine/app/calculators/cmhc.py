"""
CMHC Mortgage Default Insurance Calculator

Required when down payment < 20% of purchase price.
Premium is added to the mortgage (not paid upfront).
Quebec charges a 9% provincial tax on the CMHC premium (paid upfront separately).

Law: National Housing Act, RSC 1985, c N-11, s.6
"""
import json
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult

SOURCE_LAW = "National Housing Act, RSC 1985, c N-11, s.6"
QC_TAX_LAW = "Loi sur les assurances, RLRQ c A-32 (Quebec 9% premium tax)"


class CMHCCalculator(BaseCalculator):

    def calculate(
        self,
        purchase_price: Decimal,
        down_payment: Decimal,
        rate_record_value: str,
        data_version: str,
        scraped_at: str,
    ) -> tuple[CalcResult | None, CalcResult | None]:
        """
        Returns (cmhc_premium_result, quebec_premium_tax_result).
        Both are None if CMHC is not required (down >= 20% or price > max).
        """
        data = json.loads(rate_record_value)
        max_insured = Decimal(data["max_insured_price"])
        min_down_pct = Decimal(data["min_down_pct"])
        qc_tax_pct = Decimal(data["quebec_premium_tax_pct"]) / Decimal("100")

        down_pct = (down_payment / purchase_price) * Decimal("100")
        mortgage_amount = purchase_price - down_payment

        # Check if CMHC is required
        if purchase_price > max_insured:
            no_cmhc = CalcResult(
                calculator_id="cmhc_insurance",
                label="CMHC Mortgage Default Insurance",
                value=Decimal("0"),
                steps=[],
                breakdown=[],
                source=self._source(SOURCE_LAW, "s.6", "https://www.cmhc-schl.gc.ca"),
                data_version=data_version,
                scraped_at=scraped_at,
                warnings=[
                    f"CMHC insurance not available: purchase price ${purchase_price:,.2f} "
                    f"exceeds maximum insured price ${max_insured:,.2f}."
                ],
            )
            return no_cmhc, None

        if down_pct >= Decimal("20"):
            no_cmhc = CalcResult(
                calculator_id="cmhc_insurance",
                label="CMHC Mortgage Default Insurance",
                value=Decimal("0"),
                steps=[],
                breakdown=[],
                source=self._source(SOURCE_LAW, "s.6"),
                data_version=data_version,
                scraped_at=scraped_at,
                warnings=[f"CMHC not required: down payment {down_pct:.2f}% ≥ 20%."],
            )
            return no_cmhc, None

        # Find applicable bracket
        premium_rate = None
        bracket_label = ""
        for bracket in data["brackets"]:
            lo = Decimal(bracket["min_down_pct"])
            hi = Decimal(bracket["max_down_pct"])
            if lo <= down_pct <= hi:
                premium_rate = Decimal(bracket["premium_rate_pct"]) / Decimal("100")
                bracket_label = f"{bracket['min_down_pct']}%–{bracket['max_down_pct']}% down → {bracket['premium_rate_pct']}% premium"
                break

        if premium_rate is None:
            return CalcResult(
                calculator_id="cmhc_insurance",
                label="CMHC Mortgage Default Insurance",
                value=Decimal("0"),
                steps=[],
                breakdown=[],
                source=self._source(SOURCE_LAW),
                data_version=data_version,
                scraped_at=scraped_at,
                warnings=[f"Could not determine CMHC bracket for {down_pct:.2f}% down."],
                is_estimate=True,
            ), None

        # Premium is applied to the mortgage amount (not the purchase price)
        premium_amount = self._round(mortgage_amount * premium_rate)
        qc_premium_tax = self._round(premium_amount * qc_tax_pct)

        cmhc_steps = [
            self._step(
                1,
                f"Down payment = ${down_payment:,.2f} / ${purchase_price:,.2f} = {down_pct:.2f}%",
                "down_payment / purchase_price × 100",
                {"down_payment": str(down_payment), "purchase_price": str(purchase_price)},
                down_pct,
                down_pct,
            ),
            self._step(
                2,
                f"Bracket: {bracket_label}. Mortgage = ${mortgage_amount:,.2f}",
                "purchase_price - down_payment",
                {"purchase_price": str(purchase_price), "down_payment": str(down_payment)},
                mortgage_amount,
                mortgage_amount,
            ),
            self._step(
                3,
                f"CMHC premium = ${mortgage_amount:,.2f} × {premium_rate * 100:.2f}% = ${premium_amount:,.2f}",
                "mortgage_amount × premium_rate",
                {"mortgage_amount": str(mortgage_amount), "premium_rate": str(premium_rate)},
                premium_amount,
                premium_amount,
            ),
        ]

        cmhc_result = CalcResult(
            calculator_id="cmhc_insurance",
            label="CMHC Mortgage Default Insurance",
            value=premium_amount,
            steps=cmhc_steps,
            breakdown=[
                self._breakdown("Mortgage amount", mortgage_amount),
                self._breakdown(f"CMHC premium ({premium_rate * 100:.2f}%)", premium_amount),
            ],
            source=self._source(SOURCE_LAW, "s.6", "https://www.cmhc-schl.gc.ca"),
            data_version=data_version,
            scraped_at=scraped_at,
            warnings=[
                "CMHC premium is added to your mortgage, not paid upfront.",
                "The Quebec 9% premium tax is paid upfront at closing.",
            ],
            assumptions=[f"Down payment: {down_pct:.2f}% → {bracket_label}"],
        )

        qc_tax_result = CalcResult(
            calculator_id="cmhc_premium_tax",
            label="Quebec Insurance Premium Tax (9% on CMHC premium)",
            value=qc_premium_tax,
            steps=[self._step(
                1,
                f"Quebec 9% tax on CMHC premium ${premium_amount:,.2f}",
                "cmhc_premium × 0.09",
                {"cmhc_premium": str(premium_amount), "rate": "0.09"},
                qc_premium_tax,
                qc_premium_tax,
            )],
            breakdown=[self._breakdown("Quebec premium tax (9%)", qc_premium_tax)],
            source=self._source(QC_TAX_LAW),
            data_version=data_version,
            scraped_at=scraped_at,
            warnings=["Paid upfront at closing. Not added to mortgage."],
        )

        return cmhc_result, qc_tax_result
