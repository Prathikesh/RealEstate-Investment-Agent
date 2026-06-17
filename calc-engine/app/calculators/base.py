"""
BaseCalculator — contract that all calculators must satisfy.

Every calculator:
1. Receives rate data from the DB (never hardcoded values)
2. Returns a CalcResult — never a raw number
3. Always populates steps[], breakdown[], and source
4. Never raises for normal business logic — returns CalcResult with warnings instead
"""
from abc import ABC, abstractmethod
from decimal import ROUND_HALF_UP, Decimal

from app.schemas.calculation_result import (
    BreakdownItem,
    CalcResult,
    CalculationStep,
    SourceReference,
)


class BaseCalculator(ABC):

    @abstractmethod
    def calculate(self, **kwargs) -> CalcResult:
        """Return a full CalcResult. Never raise for normal business logic."""
        ...

    # -----------------------------------------------------------------------
    # Shared helpers
    # -----------------------------------------------------------------------

    def _round(self, value: Decimal, places: int = 2) -> Decimal:
        """Round to the given decimal places using ROUND_HALF_UP (standard financial rounding)."""
        quantize = Decimal("0." + "0" * places) if places > 0 else Decimal("1")
        return value.quantize(quantize, rounding=ROUND_HALF_UP)

    def _step(
        self,
        step_number: int,
        description: str,
        formula: str,
        inputs: dict,
        result: Decimal,
        cumulative: Decimal,
    ) -> CalculationStep:
        return CalculationStep(
            step_number=step_number,
            description=description,
            formula=formula,
            inputs=inputs,
            result=self._round(result),
            cumulative=self._round(cumulative),
        )

    def _breakdown(self, label: str, value: Decimal, note: str | None = None) -> BreakdownItem:
        return BreakdownItem(label=label, value=self._round(value), note=note)

    def _source(self, law: str, section: str | None = None, url: str | None = None, notes: str | None = None) -> SourceReference:
        return SourceReference(law=law, section=section, url=url, notes=notes)
