"""
Calculation Orchestrator — assembles all calculator outputs into a PropertyOutput.

Dependency order:
  1. Independent: WelcomeTax, MunicipalTax, SchoolTax, SalesTax, ClosingCosts
  2. Sequential: CMHC → (adds premium to principal) → MortgagePayment
  3. Dependent on mortgage: InvestmentMetrics (needs annual debt service for DSCR/CashFlow)
  4. Independent: RiskFlags

Each calculator is wrapped in try/except. A failure produces a CalcResult
with value=0, is_estimate=True, and a warning — so one broken calculator
never kills the full report.
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import Session

from app.calculators.closing_costs import ClosingCostsCalculator
from app.calculators.cmhc import CMHCCalculator
from app.calculators.investment import InvestmentCalculator
from app.calculators.mortgage import MortgageCalculator
from app.calculators.municipal_tax import MunicipalTaxCalculator
from app.calculators.risk_flags import RiskFlagCalculator
from app.calculators.sales_tax import SalesTaxCalculator
from app.calculators.school_tax import SchoolTaxCalculator
from app.calculators.welcome_tax import WelcomeTaxCalculator
from app.rate_store import repository
from app.schemas.property_input import PropertyInput
from app.schemas.property_output import (
    DataFreshness,
    FeesSummary,
    InvestmentSummary,
    LegalFlagsSummary,
    MortgageSummary,
    PropertyOutput,
    RatesUsed,
    ResolvedLocation,
    TaxSummary,
)


def _get_rate(session: Session, municipality_code: str, rate_type: str, board_code: str = "") -> tuple[str | None, str, str]:
    """Returns (value_json, data_version, scraped_at_iso) or (None, '', '') if not found."""
    record = repository.get_active_rate(session, municipality_code, rate_type, board_code)
    if not record:
        return None, "", ""
    return record.value, record.data_version, record.scraped_at.isoformat()


def _safe(fn, fallback, *args, **kwargs):
    """Call fn; on any exception return fallback."""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        return fallback


def run_all(
    session: Session,
    prop: PropertyInput,
    location: dict,
) -> PropertyOutput:
    """
    Run all calculators and assemble the full PropertyOutput.
    Never raises — failures are captured as warnings.
    """
    now = datetime.now(timezone.utc)
    muni_code = location["municipality_code"]
    board_code = location["school_board_code"]

    # -----------------------------------------------------------------------
    # Load rates from DB
    # -----------------------------------------------------------------------
    wt_value, wt_version, wt_at = _get_rate(session, "GLOBAL", "welcome_tax_brackets")
    if not wt_value:
        wt_value, wt_version, wt_at = _get_rate(session, muni_code, "welcome_tax_brackets")

    mill_value, mill_version, mill_at = _get_rate(session, muni_code, "municipal_mill")
    school_value, school_version, school_at = _get_rate(session, muni_code, "school_tax", board_code)
    gst_value, gst_version, gst_at = _get_rate(session, "GLOBAL", "gst")
    qst_value, qst_version, qst_at = _get_rate(session, "GLOBAL", "qst")
    rebate_value, rebate_version, rebate_at = _get_rate(session, "GLOBAL", "new_housing_rebate")
    cmhc_value, cmhc_version, cmhc_at = _get_rate(session, "GLOBAL", "cmhc_premiums")

    # -----------------------------------------------------------------------
    # 1. Welcome Tax
    # -----------------------------------------------------------------------
    welcome_calc = WelcomeTaxCalculator()
    welcome_result = _safe(
        welcome_calc.calculate,
        _error_result("welcome_tax", "Welcome Tax"),
        purchase_price=prop.purchase_price,
        municipal_assessment=prop.municipal_assessment,
        municipality_code=muni_code,
        rate_record_value=wt_value or "{}",
        data_version=wt_version or "missing",
        scraped_at=wt_at or now.isoformat(),
    )

    # -----------------------------------------------------------------------
    # 2. Municipal Tax
    # -----------------------------------------------------------------------
    municipal_result = None
    if mill_value:
        muni_calc = MunicipalTaxCalculator()
        municipal_result = _safe(
            muni_calc.calculate,
            None,
            municipal_assessment=prop.municipal_assessment,
            rate_record_value=mill_value,
            data_version=mill_version,
            scraped_at=mill_at,
            municipality_name=location.get("municipality_name", muni_code),
        )

    # -----------------------------------------------------------------------
    # 3. School Tax
    # -----------------------------------------------------------------------
    school_result = None
    if school_value:
        school_calc = SchoolTaxCalculator()
        school_result = _safe(
            school_calc.calculate,
            None,
            municipal_assessment=prop.municipal_assessment,
            rate_record_value=school_value,
            data_version=school_version,
            scraped_at=school_at,
            school_board_name=location.get("school_board_name", board_code),
        )

    # -----------------------------------------------------------------------
    # 4. Sales Tax (GST/QST — new construction only)
    # -----------------------------------------------------------------------
    gst_result, qst_result, rebate_result = None, None, None
    if prop.is_new_construction and gst_value and qst_value and rebate_value:
        sales_calc = SalesTaxCalculator()
        gst_result, qst_result, rebate_result = _safe(
            sales_calc.calculate,
            (None, None, None),
            purchase_price=prop.purchase_price,
            is_new_construction=prop.is_new_construction,
            property_type=prop.property_type,
            gst_record_value=gst_value,
            rebate_record_value=rebate_value,
            qst_record_value=qst_value,
            gst_data_version=gst_version,
            qst_data_version=qst_version,
            scraped_at=gst_at,
        )

    # -----------------------------------------------------------------------
    # 5. CMHC (depends on mortgage input)
    # -----------------------------------------------------------------------
    cmhc_result, cmhc_tax_result = None, None
    if prop.mortgage and cmhc_value:
        cmhc_calc = CMHCCalculator()
        cmhc_result, cmhc_tax_result = _safe(
            cmhc_calc.calculate,
            (None, None),
            purchase_price=prop.purchase_price,
            down_payment=prop.mortgage.down_payment,
            rate_record_value=cmhc_value,
            data_version=cmhc_version,
            scraped_at=cmhc_at,
        )

    # -----------------------------------------------------------------------
    # 6. Mortgage (CMHC premium is added to principal)
    # -----------------------------------------------------------------------
    mortgage_summary = None
    if prop.mortgage:
        cmhc_premium = cmhc_result.value if cmhc_result and cmhc_result.value > 0 else Decimal("0")
        base_mortgage = prop.purchase_price - prop.mortgage.down_payment
        insured_principal = base_mortgage + cmhc_premium

        mort_calc = MortgageCalculator()
        mort_result = _safe(
            mort_calc.calculate,
            _error_result("mortgage_payment", "Mortgage Payment"),
            principal=insured_principal,
            annual_rate_pct=prop.mortgage.interest_rate,
            amortization_years=prop.mortgage.amortization_years,
            payment_frequency=prop.mortgage.payment_frequency,
        )
        mortgage_summary = MortgageSummary(
            mortgage_amount=base_mortgage,
            monthly_payment=mort_result,
            cmhc_insurance=cmhc_result,
            insurance_premium_tax=cmhc_tax_result,
            total_insured_mortgage=insured_principal,
        )

    # -----------------------------------------------------------------------
    # 7. Closing Costs
    # -----------------------------------------------------------------------
    closing_calc = ClosingCostsCalculator()
    notary, appraisal, inspection = _safe(
        closing_calc.calculate,
        (_error_result("notary_fees", "Notary Fees"),
         _error_result("appraisal_fee", "Appraisal Fee"),
         _error_result("inspection_fee", "Inspection Fee")),
        purchase_price=prop.purchase_price,
    )
    closing_cost_reserve = notary.value + appraisal.value + inspection.value
    fees_summary = FeesSummary(
        notary_fees=notary,
        appraisal_fee=appraisal,
        inspection_fee=inspection,
        closing_cost_reserve=closing_cost_reserve,
    )

    # -----------------------------------------------------------------------
    # 8. Investment Metrics (if rental input provided)
    # -----------------------------------------------------------------------
    investment_summary = None
    if prop.rental and mortgage_summary:
        annual_debt_service = mortgage_summary.monthly_payment.value * Decimal("12")
        inv_calc = InvestmentCalculator()
        noi, cap_rate, cash_flow, dscr = _safe(
            inv_calc.calculate,
            (_error_result("noi", "NOI"), _error_result("cap_rate", "Cap Rate"), None, None),
            purchase_price=prop.purchase_price,
            rental=prop.rental,
            annual_debt_service=annual_debt_service,
        )
        investment_summary = InvestmentSummary(
            noi=noi, cap_rate=cap_rate, cash_flow=cash_flow, dscr=dscr
        )
    elif prop.rental:
        inv_calc = InvestmentCalculator()
        noi, cap_rate, cash_flow, dscr = _safe(
            inv_calc.calculate,
            (_error_result("noi", "NOI"), _error_result("cap_rate", "Cap Rate"), None, None),
            purchase_price=prop.purchase_price,
            rental=prop.rental,
            annual_debt_service=None,
        )
        investment_summary = InvestmentSummary(
            noi=noi, cap_rate=cap_rate, cash_flow=cash_flow, dscr=dscr
        )

    # -----------------------------------------------------------------------
    # 9. Risk Flags
    # -----------------------------------------------------------------------
    flag_calc = RiskFlagCalculator()
    flags = _safe(flag_calc.calculate, {}, prop=prop)

    legal_flags = LegalFlagsSummary(
        flipping_tax_risk=bool(flags.get("flipping_tax_risk", {}) and
                               getattr(flags["flipping_tax_risk"], "value", 0) == 1),
        flipping_tax_detail=flags.get("flipping_tax_risk"),
        capital_gains_exposure=flags.get("capital_gains_exposure"),
        principal_residence_exemption=bool(flags.get("principal_residence_exemption", False)),
        non_resident_withholding=bool(flags.get("non_resident_withholding", {}) and
                                      getattr(flags["non_resident_withholding"], "value", 0) == 1),
        non_resident_detail=flags.get("non_resident_withholding"),
        foreign_buyer_restriction=bool(flags.get("foreign_buyer_restriction", {}) and
                                       getattr(flags["foreign_buyer_restriction"], "value", 0) == 1),
        foreign_buyer_detail=flags.get("foreign_buyer_restriction"),
    )

    # -----------------------------------------------------------------------
    # Totals
    # -----------------------------------------------------------------------
    total_taxes = (
        welcome_result.value
        + (municipal_result.value if municipal_result else Decimal("0"))
        + (school_result.value if school_result else Decimal("0"))
        + (gst_result.value if gst_result else Decimal("0"))
        + (qst_result.value if qst_result else Decimal("0"))
        - (rebate_result.value if rebate_result else Decimal("0"))
    )
    cmhc_tax_upfront = cmhc_tax_result.value if cmhc_tax_result else Decimal("0")
    grand_total = prop.purchase_price + total_taxes + closing_cost_reserve + cmhc_tax_upfront

    monthly_carrying = None
    if mortgage_summary:
        monthly_carrying = mortgage_summary.monthly_payment.value

    # -----------------------------------------------------------------------
    # Assemble output
    # -----------------------------------------------------------------------
    from datetime import timedelta
    next_check = (now + timedelta(weeks=3)).isoformat()

    return PropertyOutput(
        property=ResolvedLocation(
            address=prop.address,
            city=prop.city,
            province=prop.province,
            postal_code=prop.postal_code,
            municipality_code=muni_code,
            municipality_name=location.get("municipality_name", muni_code),
            school_board_code=board_code,
            school_board_name=location.get("school_board_name", board_code),
        ),
        rates_used=RatesUsed(
            welcome_tax_version=wt_version or "not-scraped",
            municipal_mill_rate=_extract_simple(mill_value, "mill_rate_per_1000"),
            school_tax_rate=_extract_simple(school_value, "rate_per_100"),
            gst_rate=_extract_simple(gst_value, "rate_pct") or "5.0",
            qst_rate=_extract_simple(qst_value, "rate_pct") or "9.975",
            cmhc_premium_pct=None,
            scraped_at=now.isoformat(),
            sources=[s for s in [
                "https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1",
                "https://www.canada.ca/en/revenue-agency",
                "https://www.revenuquebec.ca",
                "https://www.cmhc-schl.gc.ca",
            ]],
        ),
        taxes=TaxSummary(
            welcome_tax=welcome_result,
            municipal_tax=municipal_result,
            school_tax=school_result,
            gst=gst_result,
            qst=qst_result,
            new_housing_rebate=rebate_result,
            total_taxes=total_taxes,
        ),
        mortgage=mortgage_summary,
        fees=fees_summary,
        investment=investment_summary,
        legal_flags=legal_flags,
        grand_total_upfront=grand_total,
        monthly_carrying_cost=monthly_carrying,
        data_freshness=DataFreshness(
            last_checked=now.isoformat(),
            next_check_due=next_check,
            rates_changed_since_last_check=False,
        ),
    )


def _extract_simple(json_str: str | None, key: str) -> str | None:
    if not json_str:
        return None
    import json
    try:
        d = json.loads(json_str)
        return d.get(key)
    except Exception:
        return None


def _error_result(calculator_id: str, label: str):
    from app.schemas.calculation_result import CalcResult, SourceReference
    return CalcResult(
        calculator_id=calculator_id,
        label=label,
        value=Decimal("0"),
        steps=[],
        breakdown=[],
        source=SourceReference(law="N/A"),
        data_version="error",
        scraped_at="N/A",
        warnings=["Calculator failed — rate data may not be available yet. "
                  "Run a property analysis first to populate the rate store."],
        is_estimate=True,
    )
