"""
Municipal Property Tax Calculator

Formula: (Municipal Assessment × Mill Rate) / 1,000

Mill rate is per $1,000 of assessed value (standardized across all municipalities).
Data is scraped from each municipality's official budget publications.
"""
import json
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult

SOURCE_LAW = "Act Respecting Municipal Taxation, CQLR c F-2.1, s 244"


class MunicipalTaxCalculator(BaseCalculator):

    def calculate(
        self,
        municipal_assessment: Decimal,
        rate_record_value: str,    # JSON string from DB
        data_version: str,
        scraped_at: str,
        municipality_name: str = "",
    ) -> CalcResult:
        data = json.loads(rate_record_value)
        mill_rate = Decimal(data["mill_rate_per_1000"])
        annual_tax = self._round(municipal_assessment * mill_rate / Decimal("1000"))

        steps = [
            self._step(
                1,
                f"Apply mill rate {mill_rate} per $1,000 to assessment ${municipal_assessment:,.2f}",
                "(assessment × mill_rate) / 1000",
                {"assessment": str(municipal_assessment), "mill_rate": str(mill_rate)},
                annual_tax,
                annual_tax,
            )
        ]

        return CalcResult(
            calculator_id="municipal_tax",
            label=f"Municipal Property Tax — {municipality_name}",
            value=annual_tax,
            steps=steps,
            breakdown=[self._breakdown("Annual municipal tax", annual_tax)],
            source=self._source(
                SOURCE_LAW,
                "s 244",
                data.get("source_url", ""),
            ),
            data_version=data_version,
            scraped_at=scraped_at,
            assumptions=[f"Mill rate: {mill_rate} per $1,000 (general residential rate)"],
            warnings=data.get("note", "").split(". ") if data.get("note") else [],
        )
