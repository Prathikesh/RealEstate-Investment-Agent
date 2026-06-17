"""
5-Year Investment Projector — pure Python, no LLM.

Projects property value, rent, NOI, cash flow, equity, and cumulative returns
over a 5-year holding period using conservative but reasonable assumptions.
"""
from dataclasses import dataclass, field
from typing import Optional

from app.agent.calculator import FinancialProfile
from app.models.property import Property

# ── Projection assumptions ────────────────────────────────────────────────────
# These are conservative Quebec market averages. Adjust as market conditions change.
ANNUAL_APPRECIATION  = 0.020   # 2.0 % property value growth/year
ANNUAL_RENT_GROWTH   = 0.015   # 1.5 % rent increase/year (Quebec rent board avg)
ANNUAL_EXPENSE_INFL  = 0.030   # 3.0 % operating expense inflation/year


@dataclass
class YearSnapshot:
    year:                 int
    property_value:       float
    monthly_rent:         float
    noi:                  float
    monthly_cash_flow:    float
    equity:               float           # property value − remaining loan balance
    cumulative_cash_flow: float           # running total of annual cash flows


@dataclass
class FiveYearProjection:
    snapshots:          list[YearSnapshot] = field(default_factory=list)
    total_return_pct:   Optional[float] = None   # total return on invested cash
    annualized_return:  Optional[float] = None   # CAGR equivalent


class FiveYearProjector:

    def project(self, prop: Property, fp: FinancialProfile) -> FiveYearProjection:
        # Need at minimum: asking_price, gross_rent_monthly, monthly_mortgage,
        # total_expenses_annual, total_cash_needed
        price            = fp.asking_price
        rent_monthly     = fp.gross_rent_monthly
        expenses_annual  = fp.total_expenses_annual
        mortgage_monthly = fp.monthly_mortgage
        total_cash       = fp.total_cash_needed
        loan             = fp.loan_amount

        if not all([price, rent_monthly, mortgage_monthly, total_cash, loan]):
            return FiveYearProjection()

        snapshots: list[YearSnapshot] = []
        cumulative_cf = 0.0

        for y in range(1, 6):
            # Compounding growth
            value_y    = price * (1 + ANNUAL_APPRECIATION) ** y
            rent_y     = rent_monthly * (1 + ANNUAL_RENT_GROWTH) ** y
            expenses_y = expenses_annual * (1 + ANNUAL_EXPENSE_INFL) ** y

            noi_y = rent_y * 12 - expenses_y
            cf_y  = (noi_y / 12) - mortgage_monthly

            # Remaining loan balance after y * 12 payments (standard amortization)
            remaining_loan = self._remaining_balance(loan, fp, y)
            equity_y = value_y - remaining_loan

            cumulative_cf += cf_y * 12

            snapshots.append(YearSnapshot(
                year=y,
                property_value=round(value_y, 0),
                monthly_rent=round(rent_y, 0),
                noi=round(noi_y, 0),
                monthly_cash_flow=round(cf_y, 0),
                equity=round(equity_y, 0),
                cumulative_cash_flow=round(cumulative_cf, 0),
            ))

        # Total return = (equity at year 5 + cumulative cash flow - initial cash invested) / initial cash
        total_return_pct   = None
        annualized_return  = None
        if snapshots and total_cash > 0:
            equity_5 = snapshots[-1].equity
            total_gain = equity_5 + cumulative_cf - total_cash
            total_return_pct  = round((total_gain / total_cash) * 100, 1)
            # CAGR: (1 + total_return) ^ (1/5) - 1
            if total_return_pct > -100:
                annualized_return = round(
                    ((1 + total_return_pct / 100) ** 0.2 - 1) * 100, 2
                )

        return FiveYearProjection(
            snapshots=snapshots,
            total_return_pct=total_return_pct,
            annualized_return=annualized_return,
        )

    @staticmethod
    def _remaining_balance(loan: float, fp: FinancialProfile, years: int) -> float:
        """Standard amortization remaining balance after `years` years of payments."""
        from app.agent.constants import MORTGAGE_RATE, AMORTIZATION_YRS
        r = MORTGAGE_RATE / 12
        n = AMORTIZATION_YRS * 12
        p = years * 12   # payments made
        if r == 0:
            return loan * (1 - p / n)
        return loan * ((1 + r) ** n - (1 + r) ** p) / ((1 + r) ** n - 1)
