"""
Stage 2 — Financial Calculator.
Pure math, no LLM. All Quebec-specific formulas.

Inputs:  Property record + ComparableSet
Outputs: FinancialProfile dataclass with every metric the brief and scorer need

All financial constants are imported from constants.py, which documents
the official government source and last-verified date for each value.
"""
from dataclasses import dataclass
from typing import Optional

from app.agent.comparables import ComparableSet
from app.agent.constants import (
    AMORTIZATION_YRS,
    DEFAULT_RENT_PER_UNIT,
    DOWN_PAYMENT_PCT,
    INSURANCE_RATE,
    MAINTENANCE_RATE,
    MGMT_RATE,
    MORTGAGE_RATE,
    MUNICIPAL_TAX_RATE_FALLBACK,
    MUNICIPAL_TAX_RATES_BY_CITY,
    SCHOOL_TAX_RATE_FALLBACK,
    VACANCY_RATE,
    WELCOME_TAX_BRACKETS,
    WELCOME_TAX_MONTREAL_EXTRA_RATE,
    WELCOME_TAX_MONTREAL_EXTRA_THRESHOLD,
)
from app.models.property import Property


@dataclass
class FinancialProfile:
    # Comparable analysis
    comparable_count: int
    comparable_median_price: Optional[float]
    comparable_mean_price:   Optional[float]
    value_gap: Optional[float]          # positive = below market (good)
    discount_pct: Optional[float]       # positive = discount
    analysis_confidence: str            # "high" | "medium" | "low"
    search_radius_km: Optional[float]

    # Income
    gross_rent_monthly: Optional[float]
    gross_rent_annual:  Optional[float]
    rent_is_estimated:  bool

    # Operating expenses
    vacancy_loss_annual:        float
    municipal_taxes_annual:     float
    school_taxes_annual:        float
    insurance_annual:           float
    maintenance_annual:         float
    total_expenses_annual:      float

    # Core investment metrics
    noi_annual:           Optional[float]
    cap_rate:             Optional[float]   # %
    grm:                  Optional[float]   # gross rent multiplier
    monthly_cash_flow:    Optional[float]
    cash_on_cash_return:  Optional[float]   # %

    # Acquisition costs
    asking_price:         Optional[float]
    down_payment:         Optional[float]
    loan_amount:          Optional[float]
    monthly_mortgage:     Optional[float]
    welcome_tax:          Optional[float]
    total_cash_needed:    Optional[float]   # down + welcome_tax + ~1% closing

    # True when taxes were estimated from city rate; False = taken from listing
    taxes_are_estimated:  bool = True


class FinancialCalculator:

    def calculate(self, prop: Property, comp_set: ComparableSet) -> FinancialProfile:
        price = prop.asking_price

        # ── Comparable analysis ───────────────────────────────────────────────
        value_gap    = None
        discount_pct = None
        if price and comp_set.median_price:
            value_gap    = comp_set.median_price - price
            discount_pct = (value_gap / comp_set.median_price) * 100

        # ── Income estimation ─────────────────────────────────────────────────
        rent_monthly, rent_estimated = self._estimate_rent(prop)
        rent_annual = rent_monthly * 12 if rent_monthly else None

        # ── Operating expenses ────────────────────────────────────────────────
        taxes_from_listing = bool(prop.municipal_taxes_annual or prop.school_taxes_annual)
        vacancy    = (rent_annual or 0) * VACANCY_RATE
        # Tax estimation priority:
        #   1. Disclosed annual tax from listing   ← most accurate
        #   2. evaluation_fonciere × city rate     ← good (assessed value, not asking price)
        #   3. asking_price × city rate            ← rough fallback
        eval_fonciere = getattr(prop, "evaluation_fonciere", None)
        if prop.municipal_taxes_annual:
            muni_tax = prop.municipal_taxes_annual
        elif eval_fonciere:
            muni_tax = self._estimate_muni_tax(eval_fonciere, prop.city)
        else:
            muni_tax = self._estimate_muni_tax(price, prop.city)
        school_tax = (
            prop.school_taxes_annual or
            ((eval_fonciere or price or 0) * SCHOOL_TAX_RATE_FALLBACK)
        )
        insurance  = (price or 0) * INSURANCE_RATE
        maintenance = (price or 0) * MAINTENANCE_RATE
        total_expenses = vacancy + muni_tax + school_tax + insurance + maintenance

        # ── NOI ───────────────────────────────────────────────────────────────
        noi_annual = None
        if rent_annual:
            noi_annual = rent_annual - total_expenses

        # ── Cap rate ──────────────────────────────────────────────────────────
        cap_rate = None
        if noi_annual and price:
            cap_rate = (noi_annual / price) * 100

        # ── GRM ───────────────────────────────────────────────────────────────
        grm = None
        if rent_annual and rent_annual > 0 and price:
            grm = price / rent_annual

        # ── Mortgage ──────────────────────────────────────────────────────────
        down_payment     = (price * DOWN_PAYMENT_PCT) if price else None
        loan_amount      = (price * (1 - DOWN_PAYMENT_PCT)) if price else None
        monthly_mortgage = self._monthly_mortgage(loan_amount) if loan_amount else None

        # ── Cash flow ─────────────────────────────────────────────────────────
        monthly_cash_flow = None
        if noi_annual is not None and monthly_mortgage is not None:
            monthly_cash_flow = (noi_annual / 12) - monthly_mortgage

        # ── Cash-on-cash ──────────────────────────────────────────────────────
        cash_on_cash = None
        welcome_tax  = self._welcome_tax(price, prop.city, getattr(prop, "evaluation_fonciere", None)) if price else None
        if monthly_cash_flow is not None and down_payment:
            total_cash = down_payment + (welcome_tax or 0) + ((price or 0) * 0.01)
            annual_cf  = monthly_cash_flow * 12
            cash_on_cash = (annual_cf / total_cash) * 100 if total_cash > 0 else None

        total_cash_needed = None
        if down_payment:
            total_cash_needed = down_payment + (welcome_tax or 0) + ((price or 0) * 0.01)

        return FinancialProfile(
            # Comparables
            comparable_count=comp_set.count,
            comparable_median_price=comp_set.median_price,
            comparable_mean_price=comp_set.mean_price,
            value_gap=round(value_gap, 0) if value_gap is not None else None,
            discount_pct=round(discount_pct, 2) if discount_pct is not None else None,
            analysis_confidence=comp_set.confidence,
            search_radius_km=comp_set.search_radius_km,
            # Income
            gross_rent_monthly=round(rent_monthly, 0) if rent_monthly else None,
            gross_rent_annual=round(rent_annual, 0) if rent_annual else None,
            rent_is_estimated=rent_estimated,
            # Expenses
            vacancy_loss_annual=round(vacancy, 0),
            municipal_taxes_annual=round(muni_tax, 0),
            school_taxes_annual=round(school_tax, 0),
            insurance_annual=round(insurance, 0),
            maintenance_annual=round(maintenance, 0),
            total_expenses_annual=round(total_expenses, 0),
            taxes_are_estimated=not taxes_from_listing,
            # Metrics
            noi_annual=round(noi_annual, 0) if noi_annual is not None else None,
            cap_rate=round(cap_rate, 2) if cap_rate is not None else None,
            grm=round(grm, 2) if grm is not None else None,
            monthly_cash_flow=round(monthly_cash_flow, 0) if monthly_cash_flow is not None else None,
            cash_on_cash_return=round(cash_on_cash, 2) if cash_on_cash is not None else None,
            # Acquisition
            asking_price=price,
            down_payment=round(down_payment, 0) if down_payment else None,
            loan_amount=round(loan_amount, 0) if loan_amount else None,
            monthly_mortgage=round(monthly_mortgage, 0) if monthly_mortgage else None,
            welcome_tax=round(welcome_tax, 0) if welcome_tax else None,
            total_cash_needed=round(total_cash_needed, 0) if total_cash_needed else None,
        )

    # ── Municipal tax estimation ──────────────────────────────────────────────

    @staticmethod
    def _estimate_muni_tax(price: Optional[float], city: Optional[str]) -> float:
        """
        Estimate annual municipal tax from asking price using per-city residential
        tax rates.  City-specific rates are more accurate than the provincial average,
        especially for Montreal (0.67% vs 1.2% blanket).

        NOTE: This multiplies the ASKING PRICE by the tax rate.  Real tax bills use
        the municipal ASSESSED value (évaluation foncière), which is typically lower
        than market price (the ratio varies by city and triennial roll year).
        Use the disclosed listing value whenever possible.
        """
        if not price:
            return 0.0
        city_key = (city or "").lower().strip()
        # Try exact match first, then partial match for city variants
        rate = MUNICIPAL_TAX_RATES_BY_CITY.get(city_key)
        if rate is None:
            for key, r in MUNICIPAL_TAX_RATES_BY_CITY.items():
                if key in city_key or city_key in key:
                    rate = r
                    break
        if rate is None:
            rate = MUNICIPAL_TAX_RATE_FALLBACK
        return price * rate

    # ── Rent estimation ───────────────────────────────────────────────────────

    @staticmethod
    def _estimate_rent(prop: Property) -> tuple[Optional[float], bool]:
        """Returns (monthly_rent, is_estimated). Uses listing data when available."""
        if prop.rental_income_monthly and prop.rental_income_monthly > 0:
            return prop.rental_income_monthly, False

        units = prop.unit_count or FinancialCalculator._infer_units(prop.property_type)
        return DEFAULT_RENT_PER_UNIT * units, True

    @staticmethod
    def _infer_units(property_type) -> int:
        """Derive unit count from property type when unit_count field is null."""
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

    # ── Mortgage payment ──────────────────────────────────────────────────────

    @staticmethod
    def _monthly_mortgage(loan: float) -> float:
        r = MORTGAGE_RATE / 12
        n = AMORTIZATION_YRS * 12
        return loan * (r * (1 + r) ** n) / ((1 + r) ** n - 1)

    # ── Quebec welcome tax ────────────────────────────────────────────────────

    @staticmethod
    def _welcome_tax(
        price: float,
        city: Optional[str] = None,
        evaluation_fonciere: Optional[float] = None,
    ) -> float:
        """
        Droits de mutation immobilière — RLRQ c. D-15.1 (2026 indexed brackets).
        Source: https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1
        Brackets are indexed annually by Quebec CPI.
        Last verified: 2026-06-11

        The tax base ("base d'imposition") is the GREATER of the purchase
        price and the municipal assessed value (évaluation foncière) —
        using price alone under-counts tax when a property sells below
        its assessed value, which happens often for older plexes.

        Montreal may apply up to 3 % on the portion exceeding $500,000 (city by-law).
        """
        basis = max(price, evaluation_fonciere) if evaluation_fonciere else price
        is_montreal = city and "montr" in city.lower()

        # Build bracket list — add Montreal extra rate if applicable
        brackets = list(WELCOME_TAX_BRACKETS)
        if is_montreal:
            # Replace the infinite bracket with a $500k ceiling, then add 3 % above
            brackets = [
                (WELCOME_TAX_MONTREAL_EXTRA_THRESHOLD, 0.015),
                (float("inf"), WELCOME_TAX_MONTREAL_EXTRA_RATE),
            ]
            # Prepend the base brackets up to $315,000
            brackets = list(WELCOME_TAX_BRACKETS[:-1]) + brackets

        tax  = 0.0
        prev = 0.0
        for ceiling, rate in brackets:
            if basis <= prev:
                break
            taxable = min(basis, ceiling) - prev
            tax    += taxable * rate
            prev    = ceiling

        return tax
