"""
Risk Assessor — pure Python, no LLM.

Analyses a property's FinancialProfile and flags specific risk factors with
severity levels.  Used by the full-analysis pipeline to give brokers a clear
picture of what could go wrong before they commit to an investment.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from app.agent.calculator import FinancialProfile
from app.models.property import Property


class RiskSeverity(str, Enum):
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"


_SEVERITY_ORDER = {
    RiskSeverity.LOW:      0,
    RiskSeverity.MEDIUM:   1,
    RiskSeverity.HIGH:     2,
    RiskSeverity.CRITICAL: 3,
}


@dataclass
class RiskItem:
    label:       str
    severity:    RiskSeverity
    description: str
    mitigation:  str


@dataclass
class RiskAssessment:
    items:        list[RiskItem] = field(default_factory=list)
    overall_risk: RiskSeverity   = RiskSeverity.LOW


class RiskAssessor:

    def assess(self, prop: Property, fp: FinancialProfile) -> RiskAssessment:
        checks = [
            self._check_negative_noi,
            self._check_cap_rate,
            self._check_cash_flow,
            self._check_above_market,
            self._check_comp_confidence,
            self._check_hot_market,
            self._check_property_age,
            self._check_vacancy_exposure,
            self._check_rent_estimated,
        ]

        items: list[RiskItem] = []
        for check in checks:
            result = check(prop, fp)
            if result is not None:
                items.append(result)

        # Overall risk = highest severity found, or LOW if no items
        if items:
            overall = max(items, key=lambda r: _SEVERITY_ORDER[r.severity]).severity
        else:
            overall = RiskSeverity.LOW

        return RiskAssessment(items=items, overall_risk=overall)

    # ── Individual risk checks ────────────────────────────────────────────────

    @staticmethod
    def _check_negative_noi(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if fp.noi_annual is not None and fp.noi_annual < 0:
            return RiskItem(
                label="Negative Net Operating Income",
                severity=RiskSeverity.CRITICAL,
                description=(
                    f"The property generates a negative NOI of {fp.noi_annual:,.0f} $/yr, "
                    "meaning operating expenses exceed rental income before financing costs."
                ),
                mitigation=(
                    "Verify the rent estimate against current market rates. "
                    "Negotiate price reduction or identify expense cuts before proceeding."
                ),
            )
        return None

    @staticmethod
    def _check_cap_rate(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if fp.cap_rate is not None and fp.cap_rate < 3.0:
            sev = RiskSeverity.HIGH if fp.cap_rate < 2.0 else RiskSeverity.MEDIUM
            return RiskItem(
                label="Low Cap Rate",
                severity=sev,
                description=(
                    f"Cap rate of {fp.cap_rate:.2f}% is below the Quebec investment threshold. "
                    "Quebec average is ~2.3 %; strong investments typically exceed 4 %."
                ),
                mitigation=(
                    "Evaluate whether appreciation potential justifies the compressed yield. "
                    "Consider negotiating a lower purchase price to improve returns."
                ),
            )
        return None

    @staticmethod
    def _check_cash_flow(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if fp.monthly_cash_flow is not None and fp.monthly_cash_flow < -500:
            sev = RiskSeverity.HIGH if fp.monthly_cash_flow < -1_500 else RiskSeverity.MEDIUM
            return RiskItem(
                label="Negative Monthly Cash Flow",
                severity=sev,
                description=(
                    f"Property requires a top-up of {abs(fp.monthly_cash_flow):,.0f} $/mo "
                    "from personal funds after mortgage payments."
                ),
                mitigation=(
                    "Ensure sufficient personal income to sustain negative cash flow. "
                    "Model scenario with higher rents or lower mortgage rate to find break-even."
                ),
            )
        return None

    @staticmethod
    def _check_above_market(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if fp.discount_pct is not None and fp.discount_pct < -5:
            return RiskItem(
                label="Priced Above Market",
                severity=RiskSeverity.MEDIUM,
                description=(
                    f"Asking price is {abs(fp.discount_pct):.1f}% above the comparable median "
                    f"({fp.comparable_median_price:,.0f} $ median). "
                    "You would be paying a premium over current market conditions."
                ),
                mitigation=(
                    "Negotiate price down to median or justify premium with superior location, "
                    "condition, or rental income above market."
                ),
            )
        return None

    @staticmethod
    def _check_comp_confidence(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if fp.analysis_confidence == "low" or fp.comparable_count == 0:
            return RiskItem(
                label="Low Comparable Data Confidence",
                severity=RiskSeverity.MEDIUM,
                description=(
                    f"Only {fp.comparable_count} comparable properties found. "
                    "Financial metrics (cap rate, value gap) may not reflect true market conditions."
                ),
                mitigation=(
                    "Commission an independent appraisal or consult a local broker for a manual "
                    "comparative market analysis before making an offer."
                ),
            )
        return None

    @staticmethod
    def _check_hot_market(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if prop.days_on_market is not None and prop.days_on_market < 7:
            return RiskItem(
                label="Very Recent Listing (< 7 Days)",
                severity=RiskSeverity.MEDIUM,
                description=(
                    "Property listed less than 7 days ago. Seller is unlikely to negotiate "
                    "and may receive multiple offers at asking price."
                ),
                mitigation=(
                    "Move quickly if fundamentals are strong. "
                    "Be prepared to offer at or above asking price in competitive markets."
                ),
            )
        return None

    @staticmethod
    def _check_property_age(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if prop.year_built is not None:
            age = 2026 - prop.year_built
            if age > 50:
                return RiskItem(
                    label=f"Older Building (Built {prop.year_built})",
                    severity=RiskSeverity.MEDIUM,
                    description=(
                        f"At {age} years old, the building may require significant capital "
                        "expenditure: roof, plumbing, electrical, insulation updates."
                    ),
                    mitigation=(
                        "Budget 2–3 % of property value per year for maintenance (vs. the "
                        "standard 1 % model assumption). Commission a pre-purchase inspection."
                    ),
                )
        return None

    @staticmethod
    def _check_vacancy_exposure(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        units = prop.unit_count or 0
        if units >= 5:
            return RiskItem(
                label="High Unit Count — Vacancy Exposure",
                severity=RiskSeverity.HIGH,
                description=(
                    f"With {units} units, even 1–2 vacancies can materially impact cash flow. "
                    "Concentrated vacancy risk in a single asset."
                ),
                mitigation=(
                    "Review local vacancy rates (SCHL data) for this property type. "
                    "Confirm current occupancy and lease terms before closing."
                ),
            )
        if units >= 3:
            return RiskItem(
                label="Multi-Unit Vacancy Risk",
                severity=RiskSeverity.MEDIUM,
                description=(
                    f"With {units} units, a single vacancy reduces income by "
                    f"{100/units:.0f}%. Quebec rental laws limit rent increases, "
                    "which can make re-leasing at market rates challenging."
                ),
                mitigation=(
                    "Verify current leases, tenant status, and whether any units are vacant. "
                    "Confirm rents are at or near market rate."
                ),
            )
        return None

    @staticmethod
    def _check_rent_estimated(prop: Property, fp: FinancialProfile) -> Optional[RiskItem]:
        if fp.rent_is_estimated:
            return RiskItem(
                label="Rental Income Not Disclosed",
                severity=RiskSeverity.LOW,
                description=(
                    "The listing does not disclose actual rental income. "
                    f"All financial metrics use an estimate of {fp.gross_rent_monthly:,.0f} $/mo "
                    "(SCHL Quebec averages). Actual income may differ significantly."
                ),
                mitigation=(
                    "Request current leases and rent rolls from the seller before making an offer. "
                    "Actual income can be higher or lower than the estimate."
                ),
            )
        return None
