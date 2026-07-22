"""
Rebuild Economics Calculator — pure Python, no LLM.

Models the "demolish and rebuild to zoning maximum" scenario: what it would
cost to replace the current structure with one that uses the full unit count
the zone permits, and what that rebuilt property would likely be worth.

This is the concrete version of the investor logic zoning potential implies —
"the land under this $1M triplex could support 12 units, so the land itself
is worth far more than the building on it today."

All figures are PLANNING-LEVEL ESTIMATES (see constants.py) — this identifies
whether a property is worth a serious feasibility look, not a substitute for
one. Never presented as a guaranteed cost or appraisal.
"""
from dataclasses import dataclass
from typing import Optional

from app.agent.constants import (
    DEFAULT_RENT_PER_UNIT,
    INSURANCE_RATE,
    MAINTENANCE_RATE,
    REBUILD_AVG_UNIT_SQFT,
    REBUILD_CONTINGENCY_PCT,
    REBUILD_DEMO_COST_PER_SQFT,
    REBUILD_FINANCING_CARRY_PCT,
    REBUILD_HARD_COST_PER_SQFT,
    REBUILD_SOFT_COST_PCT,
    REBUILD_TARGET_CAP_RATE,
    VACANCY_RATE,
)
from app.models.property import Property


@dataclass
class RebuildScenario:
    current_units:            int
    target_units:             int             # zoning max_units used for this scenario
    additional_units:         int

    estimated_new_floor_area_sqft: float
    demolition_cost:          float
    hard_construction_cost:   float
    soft_costs:                float
    contingency:               float
    financing_carry_cost:      float
    total_rebuild_cost:        float

    total_investment:          float           # purchase price + total_rebuild_cost

    projected_new_noi_annual:  Optional[float]
    projected_new_value:       Optional[float] # income-approach valuation at target cap rate
    net_upside:                 Optional[float] # projected_new_value - total_investment

    is_open_ended_target:       bool             # True when target_units is a floor, not a hard cap
    confidence:                  str              # always "planning_estimate" — see module docstring


class RebuildEconomicsCalculator:

    def calculate(
        self,
        prop: Property,
        target_units: int,
        current_units: int,
        is_open_ended_target: bool = False,
    ) -> Optional[RebuildScenario]:
        if not prop.asking_price or target_units <= current_units:
            return None

        additional_units = target_units - current_units
        new_floor_area = target_units * REBUILD_AVG_UNIT_SQFT

        existing_footprint = prop.sqft_total or (current_units * REBUILD_AVG_UNIT_SQFT)
        demolition_cost = existing_footprint * REBUILD_DEMO_COST_PER_SQFT

        cost_per_sqft_mid = sum(REBUILD_HARD_COST_PER_SQFT) / 2
        hard_cost = new_floor_area * cost_per_sqft_mid

        soft_costs  = hard_cost * REBUILD_SOFT_COST_PCT
        contingency = (hard_cost + soft_costs) * REBUILD_CONTINGENCY_PCT
        financing_carry = (hard_cost + soft_costs) * REBUILD_FINANCING_CARRY_PCT

        total_rebuild_cost = demolition_cost + hard_cost + soft_costs + contingency + financing_carry
        total_investment   = prop.asking_price + total_rebuild_cost

        # Income-approach valuation of the rebuilt asset — same operating-cost
        # ratios (vacancy, insurance, maintenance) as the main FinancialCalculator,
        # applied to the new unit count.
        new_gross_rent_annual = target_units * DEFAULT_RENT_PER_UNIT * 12
        vacancy     = new_gross_rent_annual * VACANCY_RATE
        insurance   = total_investment * INSURANCE_RATE
        maintenance = total_investment * MAINTENANCE_RATE
        # Municipal/school tax on the rebuilt asset isn't modeled here — the
        # existing per-city rate estimates are calibrated for current assessed
        # values, not a hypothetical post-rebuild valuation. Left out rather
        # than guessed; projected value below is intentionally somewhat
        # conservative as a result (before-tax income used at a higher cap rate
        # than a fully-loaded pro forma would need).
        projected_new_noi = new_gross_rent_annual - vacancy - insurance - maintenance
        projected_new_value = projected_new_noi / REBUILD_TARGET_CAP_RATE

        net_upside = projected_new_value - total_investment

        return RebuildScenario(
            current_units=current_units,
            target_units=target_units,
            additional_units=additional_units,
            estimated_new_floor_area_sqft=round(new_floor_area, 0),
            demolition_cost=round(demolition_cost, 0),
            hard_construction_cost=round(hard_cost, 0),
            soft_costs=round(soft_costs, 0),
            contingency=round(contingency, 0),
            financing_carry_cost=round(financing_carry, 0),
            total_rebuild_cost=round(total_rebuild_cost, 0),
            total_investment=round(total_investment, 0),
            projected_new_noi_annual=round(projected_new_noi, 0),
            projected_new_value=round(projected_new_value, 0),
            net_upside=round(net_upside, 0),
            is_open_ended_target=is_open_ended_target,
            confidence="planning_estimate",
        )
