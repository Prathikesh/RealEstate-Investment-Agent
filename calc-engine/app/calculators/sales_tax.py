"""
Sales Tax Calculator (GST + QST + New Housing Rebate)

Applies only to new construction in Quebec.
GST = 5%, QST = 9.975% (charged on GST-inclusive price)
New Housing Rebate reduces GST for prices under $450,000.

Law:
- GST: Excise Tax Act, RSC 1985, c E-15
- QST: Act Respecting the Québec Sales Tax, CQLR c T-0.1
- Rebate: Excise Tax Act, RSC 1985, c E-15, s 254
"""
import json
from decimal import Decimal

from app.calculators.base import BaseCalculator
from app.schemas.calculation_result import CalcResult
from app.schemas.common import PropertyType


class SalesTaxCalculator(BaseCalculator):

    def calculate(
        self,
        purchase_price: Decimal,
        is_new_construction: bool,
        property_type: PropertyType,
        gst_record_value: str,
        rebate_record_value: str,
        qst_record_value: str,
        gst_data_version: str,
        qst_data_version: str,
        scraped_at: str,
    ) -> tuple[CalcResult | None, CalcResult | None, CalcResult | None]:
        """
        Returns (gst_result, qst_result, rebate_result).
        All are None if not new construction.
        """
        if not is_new_construction:
            return None, None, None

        if property_type == PropertyType.COMMERCIAL:
            # Commercial: GST/QST applies but buyer typically claims ITCs
            # Too fact-specific to compute — return flag only
            warning = CalcResult(
                calculator_id="commercial_sales_tax",
                label="Commercial Property — GST/QST",
                value=Decimal("0"),
                steps=[],
                breakdown=[],
                source=self._source(
                    "Excise Tax Act, RSC 1985, c E-15",
                    url="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html",
                ),
                data_version="N/A",
                scraped_at=scraped_at,
                warnings=[
                    "Commercial property: GST (5%) and QST (9.975%) apply to purchase price.",
                    "As a registered business, you may claim Input Tax Credits (ITC) for GST "
                    "and Input Tax Refunds (ITR) for QST. Consult a tax accountant.",
                ],
                is_estimate=True,
            )
            return warning, None, None

        gst_data = json.loads(gst_record_value)
        qst_data = json.loads(qst_record_value)
        rebate_data = json.loads(rebate_record_value)

        gst_rate = Decimal(gst_data["rate_pct"]) / Decimal("100")
        qst_rate = Decimal(qst_data["rate_pct"]) / Decimal("100")
        full_rebate_threshold = Decimal(rebate_data["full_rebate_threshold"])
        phase_out_end = Decimal(rebate_data["phase_out_end"])
        max_rebate = Decimal(rebate_data["max_gst_rebate"])
        rebate_rate = Decimal(rebate_data["rebate_rate_pct"]) / Decimal("100")

        # GST
        gst_amount = self._round(purchase_price * gst_rate)
        gst_result = CalcResult(
            calculator_id="gst",
            label="GST (Goods and Services Tax)",
            value=gst_amount,
            steps=[self._step(
                1,
                f"GST {gst_data['rate_pct']}% on purchase price ${purchase_price:,.2f}",
                "purchase_price × gst_rate",
                {"purchase_price": str(purchase_price), "gst_rate": str(gst_rate)},
                gst_amount,
                gst_amount,
            )],
            breakdown=[self._breakdown("GST (5%)", gst_amount)],
            source=self._source(
                "Excise Tax Act, RSC 1985, c E-15",
                url="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html",
            ),
            data_version=gst_data_version,
            scraped_at=scraped_at,
            warnings=["Applies to new construction only."],
        )

        # QST (applied to GST-inclusive price in Quebec)
        qst_base = purchase_price + gst_amount
        qst_amount = self._round(qst_base * qst_rate)
        qst_result = CalcResult(
            calculator_id="qst",
            label="QST (Quebec Sales Tax)",
            value=qst_amount,
            steps=[
                self._step(
                    1,
                    f"QST base = purchase_price + GST = ${purchase_price:,.2f} + ${gst_amount:,.2f}",
                    "purchase_price + gst_amount",
                    {"purchase_price": str(purchase_price), "gst_amount": str(gst_amount)},
                    qst_base,
                    qst_base,
                ),
                self._step(
                    2,
                    f"QST {qst_data['rate_pct']}% on ${qst_base:,.2f}",
                    "qst_base × qst_rate",
                    {"qst_base": str(qst_base), "qst_rate": str(qst_rate)},
                    qst_amount,
                    qst_amount,
                ),
            ],
            breakdown=[self._breakdown("QST (9.975%)", qst_amount)],
            source=self._source(
                "Act Respecting the Québec Sales Tax, CQLR c T-0.1, s 16",
                url="https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/",
            ),
            data_version=qst_data_version,
            scraped_at=scraped_at,
            warnings=["QST applies to new construction only. Base includes GST (tax-on-tax)."],
        )

        # New Housing Rebate (GST portion)
        rebate_amount = Decimal("0")
        rebate_steps = []
        rebate_warnings = []

        if purchase_price <= full_rebate_threshold:
            rebate_amount = self._round(gst_amount * rebate_rate)
            rebate_steps = [self._step(
                1,
                f"Full rebate: price ${purchase_price:,.2f} ≤ ${full_rebate_threshold:,.2f}. "
                f"{rebate_data['rebate_rate_pct']}% of GST",
                "gst_amount × rebate_rate",
                {"gst_amount": str(gst_amount), "rebate_rate": str(rebate_rate)},
                rebate_amount,
                rebate_amount,
            )]
        elif purchase_price < phase_out_end:
            # Linear phase-out between full_rebate_threshold and phase_out_end
            phase_range = phase_out_end - full_rebate_threshold
            excess = purchase_price - full_rebate_threshold
            phase_factor = (phase_out_end - purchase_price) / phase_range
            rebate_amount = self._round(min(max_rebate, gst_amount * rebate_rate) * phase_factor)
            rebate_steps = [
                self._step(
                    1,
                    f"Partial rebate: price ${purchase_price:,.2f} is in phase-out zone "
                    f"(${full_rebate_threshold:,.0f}–${phase_out_end:,.0f})",
                    "(phase_out_end - price) / (phase_out_end - full_threshold)",
                    {"price": str(purchase_price), "phase_factor": str(phase_factor)},
                    phase_factor,
                    phase_factor,
                ),
                self._step(
                    2,
                    f"Apply phase factor {phase_factor:.4f} to max rebate ${max_rebate:,.2f}",
                    "max_rebate × phase_factor",
                    {"max_rebate": str(max_rebate), "phase_factor": str(phase_factor)},
                    rebate_amount,
                    rebate_amount,
                ),
            ]
            rebate_warnings.append(
                f"Partial rebate applied (linear phase-out ${full_rebate_threshold:,.0f}–${phase_out_end:,.0f})."
            )
        else:
            rebate_warnings.append(
                f"No rebate: purchase price ${purchase_price:,.2f} ≥ ${phase_out_end:,.0f}."
            )

        rebate_result = CalcResult(
            calculator_id="new_housing_rebate",
            label="New Housing Rebate (GST)",
            value=rebate_amount,
            steps=rebate_steps,
            breakdown=[self._breakdown("GST rebate", rebate_amount)],
            source=self._source(
                "Excise Tax Act, RSC 1985, c E-15, s 254",
                "s 254",
                "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-new-housing-rebate.html",
            ),
            data_version=gst_data_version,
            scraped_at=scraped_at,
            warnings=rebate_warnings,
        )

        return gst_result, qst_result, rebate_result
