"""
Risk Flags Calculator — Legal and tax risk checks.

Each flag returns a CalcResult with:
  value = Decimal("1") if risk flag is triggered
  value = Decimal("0") if not triggered
  warnings explain the risk in plain language
  source references the applicable law
"""
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult
from app.schemas.common import OwnershipType
from app.schemas.property_input import PropertyInput


class RiskFlagCalculator(BaseCalculator):

    def calculate(self, prop: PropertyInput) -> dict[str, CalcResult | bool]:
        """
        Returns dict with all risk flags.
        """
        results = {}

        # 1. Flipping Tax Risk
        results["flipping_tax_risk"] = self._check_flipping(prop)

        # 2. Capital Gains Exposure
        results["capital_gains_exposure"] = self._check_capital_gains(prop)

        # 3. Principal Residence Exemption
        results["principal_residence_exemption"] = (
            prop.ownership_intent == OwnershipType.PRIMARY_RESIDENCE
        )

        # 4. Non-Resident Withholding
        results["non_resident_withholding"] = self._check_non_resident(prop)

        # 5. Foreign Buyer Restriction
        results["foreign_buyer_restriction"] = self._check_foreign_buyer(prop)

        return results

    def _check_flipping(self, prop: PropertyInput) -> CalcResult:
        """Flag if intended ownership < 365 days (treated as business income, not capital gains)."""
        from dateutil.relativedelta import relativedelta
        from datetime import date

        triggered = False
        warnings = []
        assumptions = []

        if prop.purchase_date and prop.intended_sale_date:
            try:
                purchase = date.fromisoformat(prop.purchase_date)
                sale = date.fromisoformat(prop.intended_sale_date)
                days = (sale - purchase).days
                if days < 365:
                    triggered = True
                    warnings.append(
                        f"Ownership duration {days} days < 365 days. "
                        "CRA may treat the gain as business income (100% taxable) rather than "
                        "a capital gain (50% taxable). This is known as the 'flipping rule' "
                        "introduced in Budget 2022."
                    )
                    warnings.append(
                        "Exceptions may apply (employment relocation, death, divorce, etc.). "
                        "Consult a tax accountant."
                    )
            except ValueError:
                assumptions.append("Could not parse purchase_date or intended_sale_date.")
        else:
            assumptions.append("No sale date provided. Flipping risk not assessed.")

        return CalcResult(
            calculator_id="flipping_tax_risk",
            label="Flipping Tax Risk",
            value=Decimal("1") if triggered else Decimal("0"),
            steps=[],
            breakdown=[],
            source=self._source(
                "Income Tax Act, RSC 1985, c 1 (5th Supp), s 12(12) — Residential Property Flipping Rule",
                notes="Budget 2022. Ownership < 365 days = deemed business income.",
            ),
            data_version="statute",
            scraped_at="N/A",
            warnings=warnings,
            assumptions=assumptions,
        )

    def _check_capital_gains(self, prop: PropertyInput) -> CalcResult:
        """Estimate capital gains exposure on resale."""
        warnings = []
        value = Decimal("0")

        if prop.ownership_intent == OwnershipType.PRIMARY_RESIDENCE:
            warnings.append(
                "Principal Residence Exemption may shelter full capital gain. "
                "Designate on T1 return in the year of sale."
            )
        elif prop.original_cost_basis and prop.purchase_price:
            gain = prop.purchase_price - prop.original_cost_basis
            if gain > 0:
                # 50% inclusion rate (as of 2024; Budget 2024 proposed 2/3 on gains > $250K)
                taxable = self._round(gain * Decimal("0.5"))
                value = taxable
                warnings.append(
                    f"Estimated taxable capital gain: ${taxable:,.2f} (50% inclusion rate). "
                    "If gain > $250,000, Budget 2024 proposed 2/3 inclusion — consult accountant."
                )
        else:
            warnings.append("Provide original_cost_basis to calculate capital gains exposure.")

        return CalcResult(
            calculator_id="capital_gains_exposure",
            label="Capital Gains Exposure",
            value=value,
            steps=[],
            breakdown=[],
            source=self._source(
                "Income Tax Act, RSC 1985, c 1 (5th Supp), s 38 — capital gains inclusion rate",
            ),
            data_version="statute",
            scraped_at="N/A",
            warnings=warnings,
            is_estimate=True,
        )

    def _check_non_resident(self, prop: PropertyInput) -> CalcResult:
        triggered = not prop.is_canadian_resident
        warnings = []
        if triggered:
            warnings = [
                "Non-resident: 25% withholding tax applies on gross rental income (ITA s.212(1)(d)).",
                "File NR6 form before year-end to reduce withholding to net income basis.",
                "Must file Section 216 return annually.",
                "Non-resident disposition: 25% withholding on proceeds (ITA s.116). "
                "Clearance certificate required before sale.",
            ]
        return CalcResult(
            calculator_id="non_resident_withholding",
            label="Non-Resident Tax Rules",
            value=Decimal("1") if triggered else Decimal("0"),
            steps=[],
            breakdown=[],
            source=self._source(
                "Income Tax Act, RSC 1985, c 1 (5th Supp), s 212(1)(d) and s 116",
            ),
            data_version="statute",
            scraped_at="N/A",
            warnings=warnings,
        )

    def _check_foreign_buyer(self, prop: PropertyInput) -> CalcResult:
        triggered = prop.is_foreign_buyer
        warnings = []
        if triggered:
            warnings = [
                "Federal foreign buyer ban: Prohibition on the Purchase of Residential Property "
                "by Non-Canadians Act, SC 2022, c 10, s 235.",
                "Ban applies to residential property in census agglomerations and metropolitan areas.",
                "Exceptions: refugee claimants, temporary residents meeting criteria, "
                "certain work permit holders. Consult immigration and real estate lawyer.",
            ]
        return CalcResult(
            calculator_id="foreign_buyer_restriction",
            label="Foreign Buyer Restriction",
            value=Decimal("1") if triggered else Decimal("0"),
            steps=[],
            breakdown=[],
            source=self._source(
                "Prohibition on the Purchase of Residential Property by Non-Canadians Act, SC 2022, c 10, s 235",
                url="https://laws-lois.justice.gc.ca/eng/acts/P-25.2/",
            ),
            data_version="statute",
            scraped_at="N/A",
            warnings=warnings,
        )
