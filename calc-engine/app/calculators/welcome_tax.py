"""
Welcome Tax Calculator (Droits de mutation immobilières)

Law: Loi concernant les droits sur les mutations immobilières, RLRQ c D-15.1, Art. 2

Tax base = max(purchase_price, municipal_assessment)
Each bracket is applied only to the portion of the tax base within that bracket.
Montreal has two extra brackets (3% and 4%) via municipal by-law.

Every bracket row is a separate CalculationStep — fully auditable.
"""
import json
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult

SOURCE_LAW = "Loi concernant les droits sur les mutations immobilières, RLRQ c D-15.1, Art. 2"
SOURCE_URL = "https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1"


class WelcomeTaxCalculator(BaseCalculator):

    def calculate(
        self,
        purchase_price: Decimal,
        municipal_assessment: Decimal,
        municipality_code: str,
        rate_record_value: str,         # JSON string from DB
        data_version: str,
        scraped_at: str,
    ) -> CalcResult:
        brackets_data = json.loads(rate_record_value)
        standard_brackets = brackets_data["standard"]
        muni_overrides = brackets_data.get("municipality_overrides", {})

        # Tax base = higher of purchase price or municipal assessment
        tax_base = max(purchase_price, municipal_assessment)
        base_was = "purchase_price" if purchase_price >= municipal_assessment else "municipal_assessment"

        steps = []
        breakdown = []
        warnings = []

        # Step 1: Determine tax base
        steps.append(self._step(
            1,
            f"Tax base = max(purchase_price, municipal_assessment) = max({purchase_price}, {municipal_assessment})",
            "max(purchase_price, municipal_assessment)",
            {"purchase_price": str(purchase_price), "municipal_assessment": str(municipal_assessment)},
            tax_base,
            tax_base,
        ))

        # Build full bracket list (standard + municipality overrides)
        all_brackets = list(standard_brackets)
        muni_code_upper = municipality_code.upper()
        if muni_code_upper in muni_overrides:
            all_brackets.extend(muni_overrides[muni_code_upper]["extra_brackets"])
            warnings.append(
                f"{municipality_code} extra brackets (3% and 4%) applied per municipal by-law."
            )

        # Sort brackets by threshold ascending
        all_brackets.sort(key=lambda b: Decimal(b["threshold"]))

        # Step 2+: Apply each bracket
        total = Decimal("0")
        cumulative = tax_base  # carry tax_base as cumulative baseline for step 1

        for i, bracket in enumerate(all_brackets, start=2):
            threshold = Decimal(bracket["threshold"])
            up_to = Decimal(bracket["up_to"]) if bracket["up_to"] else None
            rate = Decimal(bracket["rate_pct"]) / Decimal("100")
            label = bracket.get("label", f"Bracket at {bracket['rate_pct']}%")

            if tax_base <= threshold:
                break

            bracket_max = min(tax_base, up_to) if up_to else tax_base
            taxable_in_bracket = bracket_max - threshold
            tax_in_bracket = self._round(taxable_in_bracket * rate)

            up_to_label = f"${up_to:,.0f}" if up_to else "no limit"
            steps.append(self._step(
                i,
                f"{label}: {bracket['rate_pct']}% on ${threshold:,.0f} – {up_to_label} "
                f"= ${taxable_in_bracket:,.2f} × {bracket['rate_pct']}%",
                f"({bracket_max} - {threshold}) × {rate}",
                {"taxable": str(taxable_in_bracket), "rate": str(rate)},
                tax_in_bracket,
                total + tax_in_bracket,
            ))
            breakdown.append(self._breakdown(label, tax_in_bracket, f"{bracket['rate_pct']}% bracket"))
            total += tax_in_bracket

        total = self._round(total)

        return CalcResult(
            calculator_id="welcome_tax",
            label="Welcome Tax (Droits de mutation immobilières)",
            value=total,
            steps=steps,
            breakdown=breakdown,
            source=self._source(SOURCE_LAW, "Art. 2", SOURCE_URL),
            data_version=data_version,
            scraped_at=scraped_at,
            warnings=warnings,
            assumptions=[f"Tax base used: {base_was} (${tax_base:,.2f})"],
        )
