"""
CalcResult — the universal return type for every calculator.

Every number returned by this engine includes:
- The computed value
- Step-by-step breakdown of how it was derived
- Source law / regulation
- Which scraped data version was used
- When that data was last fetched from the official source

This makes every result independently verifiable.
"""
from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class CalculationStep(BaseModel):
    """One atomic step in a multi-step calculation."""

    step_number: int
    description: str    # "Apply 1.5% bracket on the portion $258,600 – $500,000"
    formula: str        # "(500000 - 258600) × 0.015"
    inputs: dict[str, Any]   # Exact numeric values substituted into the formula
    result: Decimal          # Result of this step alone
    cumulative: Decimal      # Running total through this step


class BreakdownItem(BaseModel):
    """A named row in a summary table (e.g., one bracket row in Welcome Tax)."""

    label: str
    value: Decimal
    note: str | None = None


class SourceReference(BaseModel):
    law: str                # "Loi concernant les droits sur les mutations immobilières, RLRQ c D-15.1"
    section: str | None = None
    url: str | None = None
    notes: str | None = None


class CalcResult(BaseModel):
    """
    Universal return type from every calculator.
    A raw number is never enough — breakdown and source make it auditable.
    """

    calculator_id: str      # "welcome_tax", "cmhc_insurance", "municipal_tax", etc.
    label: str              # "Welcome Tax (Droits de mutation)"
    value: Decimal          # Final computed value
    currency: str = "CAD"

    steps: list[CalculationStep]
    breakdown: list[BreakdownItem]
    source: SourceReference

    data_version: str       # "2025.1" — matches the rate record version in DB
    scraped_at: str         # ISO timestamp of when the rate was last fetched

    warnings: list[str] = []       # Edge cases, assumptions made
    assumptions: list[str] = []    # Defaults applied (e.g., "Vacancy assumed 5%")
    is_estimate: bool = False       # True for fee ranges vs. exact rates
