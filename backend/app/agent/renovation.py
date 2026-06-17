"""
Renovation ROI Analyzer — pure Python, no LLM.

Models three renovation scenarios (light / medium / heavy) and calculates
the impact on rent, cap rate, cash flow, payback period, and ROI.
Useful for identifying value-add opportunities in older or under-rented properties.
"""
from dataclasses import dataclass, field
from typing import Optional

from app.agent.calculator import FinancialProfile
from app.models.property import Property

# ── Renovation cost ranges ($ per sqft of gross floor area) ──────────────────
SCENARIOS = {
    "light":  {"cost_per_sqft": (15, 25),  "rent_increase_per_unit": 100},
    "medium": {"cost_per_sqft": (40, 70),  "rent_increase_per_unit": 250},
    "heavy":  {"cost_per_sqft": (80, 150), "rent_increase_per_unit": 400},
}

# Default sqft when listing does not disclose square footage
SQFT_FALLBACK = 1_200

# Age-based cost multiplier — older buildings cost more to renovate
def _age_factor(year_built: Optional[int]) -> float:
    if year_built is None:
        return 1.0
    age = 2026 - year_built
    if age > 50:
        return 1.2
    if age > 30:
        return 1.1
    return 1.0


@dataclass
class RenovationScenario:
    label:                  str             # "light" | "medium" | "heavy"
    renovation_cost:        float
    rent_increase_per_unit: float
    new_monthly_rent:       Optional[float]
    new_noi:                Optional[float]
    new_cap_rate:           Optional[float]
    new_cash_flow:          Optional[float]
    payback_years:          Optional[float]
    roi_pct:                Optional[float]


@dataclass
class RenovationROI:
    scenarios: list[RenovationScenario] = field(default_factory=list)


class RenovationAnalyzer:

    def analyze(self, prop: Property, fp: FinancialProfile) -> RenovationROI:
        sqft      = prop.sqft_total or SQFT_FALLBACK
        age_mult  = _age_factor(prop.year_built)
        units     = prop.unit_count or self._infer_units(prop.property_type)

        scenarios: list[RenovationScenario] = []
        for label, cfg in SCENARIOS.items():
            low, high = cfg["cost_per_sqft"]
            mid_cost  = (low + high) / 2
            reno_cost = mid_cost * sqft * age_mult

            rent_inc = cfg["rent_increase_per_unit"] * units

            new_monthly_rent = None
            new_noi          = None
            new_cap_rate     = None
            new_cash_flow    = None
            payback_years    = None
            roi_pct          = None

            if fp.gross_rent_monthly is not None and fp.asking_price:
                new_monthly_rent = fp.gross_rent_monthly + rent_inc
                new_noi          = new_monthly_rent * 12 - fp.total_expenses_annual
                new_cap_rate     = (new_noi / fp.asking_price) * 100

                if fp.monthly_mortgage is not None:
                    new_cash_flow = (new_noi / 12) - fp.monthly_mortgage

                    if fp.monthly_cash_flow is not None:
                        annual_improvement = (new_cash_flow - fp.monthly_cash_flow) * 12
                        if annual_improvement > 0:
                            payback_years = round(reno_cost / annual_improvement, 1)
                            roi_pct       = round((annual_improvement / reno_cost) * 100, 1)

            scenarios.append(RenovationScenario(
                label=label,
                renovation_cost=round(reno_cost, 0),
                rent_increase_per_unit=cfg["rent_increase_per_unit"],
                new_monthly_rent=round(new_monthly_rent, 0) if new_monthly_rent else None,
                new_noi=round(new_noi, 0) if new_noi is not None else None,
                new_cap_rate=round(new_cap_rate, 2) if new_cap_rate is not None else None,
                new_cash_flow=round(new_cash_flow, 0) if new_cash_flow is not None else None,
                payback_years=payback_years,
                roi_pct=roi_pct,
            ))

        return RenovationROI(scenarios=scenarios)

    @staticmethod
    def _infer_units(property_type) -> int:
        from app.models.property import PropertyType
        unit_map = {
            PropertyType.DUPLEX:          2,
            PropertyType.TRIPLEX:         3,
            PropertyType.QUADRUPLEX:      4,
            PropertyType.QUINTUPLEX_PLUS: 5,
            PropertyType.SINGLE_FAMILY:   1,
            PropertyType.CONDO:           1,
            PropertyType.TOWNHOUSE:       1,
        }
        return unit_map.get(property_type, 2)
