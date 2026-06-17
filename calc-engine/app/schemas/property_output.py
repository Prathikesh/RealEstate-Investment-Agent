from decimal import Decimal

from pydantic import BaseModel

from .calculation_result import CalcResult


class ResolvedLocation(BaseModel):
    address: str
    city: str
    province: str
    postal_code: str
    municipality_code: str
    municipality_name: str
    school_board_code: str
    school_board_name: str


class RatesUsed(BaseModel):
    welcome_tax_version: str
    municipal_mill_rate: str | None = None
    school_tax_rate: str | None = None
    gst_rate: str
    qst_rate: str
    cmhc_premium_pct: str | None = None
    scraped_at: str
    sources: list[str]


class TaxSummary(BaseModel):
    welcome_tax: CalcResult
    municipal_tax: CalcResult | None = None
    school_tax: CalcResult | None = None
    gst: CalcResult | None = None
    qst: CalcResult | None = None
    new_housing_rebate: CalcResult | None = None
    total_taxes: Decimal


class MortgageSummary(BaseModel):
    mortgage_amount: Decimal
    monthly_payment: CalcResult
    cmhc_insurance: CalcResult | None = None
    insurance_premium_tax: CalcResult | None = None
    total_insured_mortgage: Decimal   # principal + CMHC premium added


class FeesSummary(BaseModel):
    notary_fees: CalcResult
    appraisal_fee: CalcResult
    inspection_fee: CalcResult
    closing_cost_reserve: Decimal


class InvestmentSummary(BaseModel):
    noi: CalcResult
    cap_rate: CalcResult
    cash_flow: CalcResult | None = None
    dscr: CalcResult | None = None


class LegalFlagsSummary(BaseModel):
    flipping_tax_risk: bool
    flipping_tax_detail: CalcResult | None = None
    capital_gains_exposure: CalcResult | None = None
    principal_residence_exemption: bool
    non_resident_withholding: bool
    non_resident_detail: CalcResult | None = None
    foreign_buyer_restriction: bool
    foreign_buyer_detail: CalcResult | None = None


class DataFreshness(BaseModel):
    last_checked: str       # ISO timestamp
    next_check_due: str     # ISO timestamp (last_checked + 3 weeks)
    rates_changed_since_last_check: bool
    changes_detected: list[str] = []   # Friendly descriptions of any changes


class PropertyOutput(BaseModel):
    property: ResolvedLocation
    rates_used: RatesUsed
    taxes: TaxSummary
    mortgage: MortgageSummary | None = None
    fees: FeesSummary
    investment: InvestmentSummary | None = None
    legal_flags: LegalFlagsSummary
    grand_total_upfront: Decimal    # purchase_price + all taxes + fees + CMHC
    monthly_carrying_cost: Decimal | None = None   # mortgage + condo fees etc.
    data_freshness: DataFreshness
