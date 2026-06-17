"""
School Tax Calculator

Formula: Municipal Assessment × School Tax Rate per $100

School tax is based on the standardized assessment value.
Rate is published annually by each school board.
"""
import json
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult

SOURCE_LAW = "Education Act, CQLR c I-13.3, s 308"


class SchoolTaxCalculator(BaseCalculator):

    def calculate(
        self,
        municipal_assessment: Decimal,
        rate_record_value: str,
        data_version: str,
        scraped_at: str,
        school_board_name: str = "",
    ) -> CalcResult:
        data = json.loads(rate_record_value)
        rate_per_100 = Decimal(data["rate_per_100"])
        annual_tax = self._round(municipal_assessment * rate_per_100 / Decimal("100"))

        steps = [
            self._step(
                1,
                f"Apply school tax rate ${rate_per_100} per $100 to assessment ${municipal_assessment:,.2f}",
                "(assessment × rate_per_100) / 100",
                {"assessment": str(municipal_assessment), "rate_per_100": str(rate_per_100)},
                annual_tax,
                annual_tax,
            )
        ]

        return CalcResult(
            calculator_id="school_tax",
            label=f"School Tax — {school_board_name}",
            value=annual_tax,
            steps=steps,
            breakdown=[self._breakdown("Annual school tax", annual_tax)],
            source=self._source(SOURCE_LAW, "s 308"),
            data_version=data_version,
            scraped_at=scraped_at,
            assumptions=[f"Rate: ${rate_per_100} per $100 of assessment"],
        )
