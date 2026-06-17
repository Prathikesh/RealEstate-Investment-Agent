"""
Mortgage Calculator — Canadian semi-annual compounding convention.

IMPORTANT: Canada mandates semi-annual compounding for fixed-rate mortgages
under the Interest Act, RSC 1985, c I-15, s 6.
The effective monthly rate is NOT annual_rate / 12.
It is: (1 + annual_rate/2)^(1/6) - 1

This is the single most common error in mortgage calculators.
The conversion step is always written explicitly in the calculation steps.

Formula: M = P × [r(1+r)^n] / [(1+r)^n - 1]
where r = effective monthly rate, n = total monthly payments
"""
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult

SOURCE_LAW = "Interest Act, RSC 1985, c I-15, s 6 (Canadian semi-annual compounding)"
SOURCE_URL = "https://laws-lois.justice.gc.ca/eng/acts/I-15/page-1.html"

PAYMENTS_PER_YEAR = {
    "monthly": 12,
    "bi_weekly": 26,
    "weekly": 52,
}


class MortgageCalculator(BaseCalculator):

    def calculate(
        self,
        principal: Decimal,
        annual_rate_pct: Decimal,
        amortization_years: int,
        payment_frequency: str = "monthly",
    ) -> CalcResult:
        annual_rate = annual_rate_pct / Decimal("100")
        payments_per_year = PAYMENTS_PER_YEAR.get(payment_frequency, 12)
        n_total = amortization_years * payments_per_year

        steps = []
        warnings = []

        # Step 1: Convert nominal annual rate to semi-annual effective rate
        # Canadian law: advertised rate is nominal, compounded semi-annually
        semi_annual_rate = annual_rate / Decimal("2")
        steps.append(self._step(
            1,
            f"Semi-annual rate = annual_rate / 2 = {annual_rate_pct}% / 2",
            "annual_rate / 2",
            {"annual_rate": str(annual_rate)},
            semi_annual_rate,
            semi_annual_rate,
        ))

        # Step 2: Compute effective rate per payment period
        # For monthly: (1 + semi_annual_rate)^(1/6) - 1
        exponent = Decimal("1") / Decimal(str(12 // (payments_per_year // payments_per_year)))
        if payment_frequency == "monthly":
            period_exponent = Decimal("1") / Decimal("6")
        elif payment_frequency == "bi_weekly":
            period_exponent = Decimal("1") / Decimal("13")
        else:
            period_exponent = Decimal("1") / Decimal("26")

        effective_period_rate = Decimal(str(
            round((1 + float(semi_annual_rate)) ** float(period_exponent) - 1, 10)
        ))

        steps.append(self._step(
            2,
            f"Effective {payment_frequency} rate = (1 + {semi_annual_rate})^(1/{int(1/float(period_exponent))}) - 1",
            f"(1 + semi_annual_rate)^({period_exponent}) - 1",
            {"semi_annual_rate": str(semi_annual_rate), "exponent": str(period_exponent)},
            effective_period_rate,
            effective_period_rate,
        ))

        # Step 3: Compute payment using standard amortization formula
        # M = P × [r(1+r)^n] / [(1+r)^n - 1]
        r = float(effective_period_rate)
        n = n_total
        P = float(principal)

        if r == 0:
            payment = P / n
        else:
            payment = P * (r * (1 + r) ** n) / ((1 + r) ** n - 1)

        payment_dec = self._round(Decimal(str(payment)))

        steps.append(self._step(
            3,
            f"Payment = P × [r(1+r)^n] / [(1+r)^n - 1] "
            f"= {principal:,.2f} × [{r:.8f} × (1+{r:.8f})^{n}] / [(1+{r:.8f})^{n} - 1]",
            "P × [r(1+r)^n] / [(1+r)^n - 1]",
            {"P": str(principal), "r": str(r), "n": str(n)},
            payment_dec,
            payment_dec,
        ))

        # Step 4: Total cost over amortization period
        total_cost = self._round(payment_dec * n)
        total_interest = self._round(total_cost - principal)

        steps.append(self._step(
            4,
            f"Total cost = payment × n = {payment_dec:,.2f} × {n}",
            "payment × n",
            {"payment": str(payment_dec), "n": str(n)},
            total_cost,
            total_cost,
        ))

        return CalcResult(
            calculator_id="mortgage_payment",
            label=f"Mortgage Payment ({payment_frequency.replace('_', '-')})",
            value=payment_dec,
            steps=steps,
            breakdown=[
                self._breakdown("Principal", principal),
                self._breakdown(f"{payment_frequency.replace('_', '-').title()} payment", payment_dec),
                self._breakdown("Total paid over amortization", total_cost),
                self._breakdown("Total interest paid", total_interest),
            ],
            source=self._source(SOURCE_LAW, "s 6", SOURCE_URL),
            data_version="formula",
            scraped_at="N/A",
            warnings=[
                "Uses Canadian semi-annual compounding as mandated by the Interest Act. "
                "Most online calculators use incorrect monthly compounding — this one is correct."
            ],
            assumptions=[
                f"Amortization: {amortization_years} years ({n_total} payments)",
                f"Payment frequency: {payment_frequency}",
                f"Nominal annual rate: {annual_rate_pct}%",
            ],
        )
