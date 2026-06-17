"""
Investment Metrics Calculator — NOI, Cap Rate, Cash Flow, DSCR

All defaults (vacancy, management fee, maintenance) are echoed in the
assumptions list so the user knows what was applied.
"""
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult
from app.schemas.property_input import RentalInput


class InvestmentCalculator(BaseCalculator):

    def calculate(
        self,
        purchase_price: Decimal,
        rental: RentalInput,
        annual_debt_service: Decimal | None = None,
    ) -> tuple[CalcResult, CalcResult, CalcResult | None, CalcResult | None]:
        """
        Returns (noi_result, cap_rate_result, cash_flow_result, dscr_result).
        cash_flow and dscr are None if no mortgage input.
        """
        assumptions = []
        now_iso = "N/A"

        # Gross annual rent
        gross_annual = self._round(rental.gross_monthly_rent * Decimal("12"))

        # Vacancy
        vacancy_pct = rental.vacancy_rate_pct / Decimal("100")
        vacancy_loss = self._round(gross_annual * vacancy_pct)
        effective_gross = gross_annual - vacancy_loss
        assumptions.append(f"Vacancy rate: {rental.vacancy_rate_pct}%")

        # Management fee (on effective gross income)
        mgmt_pct = rental.management_fee_pct / Decimal("100")
        mgmt_fee = self._round(effective_gross * mgmt_pct)
        assumptions.append(f"Property management fee: {rental.management_fee_pct}%")

        # Maintenance (default: 1% of purchase price)
        if rental.annual_maintenance is not None:
            maintenance = rental.annual_maintenance
        else:
            maintenance = self._round(purchase_price * Decimal("0.01"))
            assumptions.append("Annual maintenance: 1% of purchase price (default)")

        # Insurance
        if rental.annual_insurance is not None:
            insurance = rental.annual_insurance
        else:
            insurance = self._round(purchase_price * Decimal("0.005"))
            assumptions.append("Annual insurance: 0.5% of purchase price (estimate)")

        other = rental.annual_other_expenses

        # NOI
        noi = self._round(effective_gross - mgmt_fee - maintenance - insurance - other)
        noi_steps = [
            self._step(1, f"Gross annual rent = ${rental.gross_monthly_rent:,.2f} × 12",
                       "monthly_rent × 12", {"monthly_rent": str(rental.gross_monthly_rent)},
                       gross_annual, gross_annual),
            self._step(2, f"Vacancy loss = ${gross_annual:,.2f} × {rental.vacancy_rate_pct}%",
                       "gross_annual × vacancy_pct",
                       {"gross_annual": str(gross_annual), "vacancy_pct": str(vacancy_pct)},
                       -vacancy_loss, effective_gross),
            self._step(3, f"Effective gross income = ${gross_annual:,.2f} - ${vacancy_loss:,.2f}",
                       "gross_annual - vacancy_loss", {}, effective_gross, effective_gross),
            self._step(4, f"Management fee = ${effective_gross:,.2f} × {rental.management_fee_pct}%",
                       "egi × mgmt_pct", {"egi": str(effective_gross), "mgmt_pct": str(mgmt_pct)},
                       -mgmt_fee, effective_gross - mgmt_fee),
            self._step(5, f"Maintenance = ${maintenance:,.2f}", "annual_maintenance", {},
                       -maintenance, effective_gross - mgmt_fee - maintenance),
            self._step(6, f"Insurance = ${insurance:,.2f}", "annual_insurance", {},
                       -insurance, noi + other),
            self._step(7, f"Other expenses = ${other:,.2f}", "other_expenses", {}, -other, noi),
        ]
        noi_result = CalcResult(
            calculator_id="noi",
            label="Net Operating Income (NOI)",
            value=noi,
            steps=noi_steps,
            breakdown=[
                self._breakdown("Gross annual rent", gross_annual),
                self._breakdown("Less: vacancy loss", -vacancy_loss),
                self._breakdown("Less: management fee", -mgmt_fee),
                self._breakdown("Less: maintenance", -maintenance),
                self._breakdown("Less: insurance", -insurance),
                self._breakdown("Less: other expenses", -other),
                self._breakdown("NOI", noi),
            ],
            source=self._source("Standard real estate investment analysis — no statutory source"),
            data_version="formula",
            scraped_at=now_iso,
            assumptions=assumptions,
        )

        # Cap Rate
        cap_rate = self._round((noi / purchase_price) * Decimal("100"), places=4)
        cap_rate_result = CalcResult(
            calculator_id="cap_rate",
            label="Capitalization Rate (Cap Rate)",
            value=cap_rate,
            steps=[self._step(
                1, f"Cap Rate = NOI / Purchase Price × 100 = ${noi:,.2f} / ${purchase_price:,.2f} × 100",
                "(noi / purchase_price) × 100",
                {"noi": str(noi), "purchase_price": str(purchase_price)},
                cap_rate, cap_rate,
            )],
            breakdown=[self._breakdown("Cap Rate (%)", cap_rate)],
            source=self._source("Standard real estate investment analysis"),
            data_version="formula",
            scraped_at=now_iso,
        )

        # Cash Flow and DSCR (only if mortgage provided)
        cash_flow_result = None
        dscr_result = None

        if annual_debt_service is not None and annual_debt_service > 0:
            cash_flow = self._round(noi - annual_debt_service)
            cash_flow_result = CalcResult(
                calculator_id="cash_flow",
                label="Annual Cash Flow",
                value=cash_flow,
                steps=[self._step(
                    1, f"Cash Flow = NOI - Annual Debt Service = ${noi:,.2f} - ${annual_debt_service:,.2f}",
                    "noi - annual_debt_service",
                    {"noi": str(noi), "annual_debt_service": str(annual_debt_service)},
                    cash_flow, cash_flow,
                )],
                breakdown=[
                    self._breakdown("NOI", noi),
                    self._breakdown("Annual debt service", -annual_debt_service),
                    self._breakdown("Cash flow", cash_flow),
                ],
                source=self._source("Standard real estate investment analysis"),
                data_version="formula",
                scraped_at=now_iso,
                warnings=["Negative cash flow means property does not self-fund."] if cash_flow < 0 else [],
            )

            dscr = self._round(noi / annual_debt_service, places=4)
            dscr_result = CalcResult(
                calculator_id="dscr",
                label="Debt Service Coverage Ratio (DSCR)",
                value=dscr,
                steps=[self._step(
                    1, f"DSCR = NOI / Annual Debt Service = ${noi:,.2f} / ${annual_debt_service:,.2f}",
                    "noi / annual_debt_service",
                    {"noi": str(noi), "annual_debt_service": str(annual_debt_service)},
                    dscr, dscr,
                )],
                breakdown=[self._breakdown("DSCR", dscr)],
                source=self._source("Standard lender underwriting metric"),
                data_version="formula",
                scraped_at=now_iso,
                warnings=["Lenders typically require DSCR ≥ 1.20 for investment properties."] if dscr < Decimal("1.20") else [],
            )

        return noi_result, cap_rate_result, cash_flow_result, dscr_result
