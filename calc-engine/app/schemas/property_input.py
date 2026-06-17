from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from .common import Money, OwnershipType, PropertyType


class MortgageInput(BaseModel):
    down_payment: Money
    interest_rate: Decimal = Field(ge=0, le=30, decimal_places=4)   # annual %
    amortization_years: int = Field(ge=1, le=35, default=25)
    payment_frequency: str = Field(
        default="monthly", pattern="^(monthly|bi_weekly|weekly)$"
    )


class RentalInput(BaseModel):
    gross_monthly_rent: Money
    vacancy_rate_pct: Decimal = Field(default=Decimal("5.0"), ge=0, le=100)
    management_fee_pct: Decimal = Field(default=Decimal("8.0"), ge=0, le=100)
    annual_maintenance: Money | None = None   # None = use 1% of purchase price
    annual_insurance: Money | None = None     # None = estimate
    annual_other_expenses: Money = Decimal("0")


class PropertyInput(BaseModel):
    # Address — used by location resolver
    address: str
    city: str
    province: str = "QC"
    postal_code: str

    # Core property values
    purchase_price: Money
    municipal_assessment: Money | None = None   # None = assume == purchase_price
    property_type: PropertyType
    ownership_intent: OwnershipType

    # Construction status
    is_new_construction: bool = False

    # Owner profile
    is_canadian_resident: bool = True
    is_foreign_buyer: bool = False

    # Optional: mortgage + rental (enable specific calculators)
    mortgage: MortgageInput | None = None
    rental: RentalInput | None = None

    # Capital gains context
    purchase_date: str | None = None           # ISO date YYYY-MM-DD
    intended_sale_date: str | None = None
    original_cost_basis: Money | None = None

    # Override location codes if resolver can't determine them
    municipality_code_override: str | None = None
    school_board_code_override: str | None = None

    @model_validator(mode="after")
    def assessment_defaults_to_price(self) -> "PropertyInput":
        if self.municipal_assessment is None:
            self.municipal_assessment = self.purchase_price
        return self
