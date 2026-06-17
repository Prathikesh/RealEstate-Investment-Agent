"""
Financial constants used throughout the investment pipeline.

Every constant below is documented with:
  - The official government/authoritative source URL
  - The last-verified date
  - How frequently the value changes

Update these values annually (or whenever the source publishes new data).
"""

# ── Welcome Tax — Droits de mutation immobilière ──────────────────────────────
#
# Source:  Loi sur les droits de mutation immobilière, RLRQ c. D-15.1
# URL:     https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1
# Update:  ANNUALLY — indexed by Institut de la statistique du Québec CPI
#          Published each year in the Gazette officielle du Québec.
# Verified: 2026-06-11
#           2026 indexation rate: 2.3438% (157 G.O. 1, 366)
#
# Base provincial brackets (three-tier, mandatory for all Quebec municipalities):
#   ≤ $62,900       → 0.5%
#   $62,900–$315,000 → 1.0%
#   > $315,000       → 1.5%
#
# Municipalities may OPTIONALLY impose a higher rate (up to 3 %) on the portion
# of the basis exceeding $500,000.  Ville de Montréal is NOT subject to the 3 %
# ceiling and has enacted its own additional bracket via city by-law.
#
WELCOME_TAX_BRACKETS = [
    (62_900,       0.005),   # 0.5 % — 2026 indexed amount
    (315_000,      0.010),   # 1.0 % — 2026 indexed amount
    (float("inf"), 0.015),   # 1.5 % — base rate above $315,000
]

# Montreal city by-law: additional rate on portion exceeding $500,000.
# Verify annually at montreal.ca (municipal budget, typically January).
WELCOME_TAX_MONTREAL_EXTRA_THRESHOLD = 500_000
WELCOME_TAX_MONTREAL_EXTRA_RATE      = 0.030   # 3.0 %

# ── Mortgage assumptions ──────────────────────────────────────────────────────
#
# Source:  Bank of Canada — Key Policy Interest Rate
# URL:     https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/
# Update:  8 fixed announcement dates per year (Bank of Canada schedule).
#          Policy rate as of 2026-06-11: 2.25 % (last changed Oct 29 2025).
#          Typical lender spread for 5-year fixed: ~2.0–2.5 %.
# Verified: 2026-06-11
#
MORTGAGE_RATE    = 0.045   # 4.5 % — updated from stale 5.2 % in original code
AMORTIZATION_YRS = 25
DOWN_PAYMENT_PCT = 0.20

# ── Operating expense ratios ──────────────────────────────────────────────────
#
# Source:  Industry standard rules of thumb documented by CMHC and real-estate
#          investment guides.  These are stable and rarely revised.
# URL:     https://www.cmhc-schl.gc.ca/professionals/project-funding-and-mortgage-insurance
# Verified: 2026-06-11
#
VACANCY_RATE     = 0.05    # 5 % — standard; Quebec metro avg ~2–4 % per SCHL
INSURANCE_RATE   = 0.002   # 0.2 % of assessed value/year
MAINTENANCE_RATE = 0.010   # 1.0 % of value/year (use 2–3 % for buildings > 50 yrs)
MGMT_RATE        = 0.00    # 0 % — assumes self-managed (typical for small plexes)

# ── Tax-rate fallbacks (used only when listing does not disclose actual values) ─
#
# Source:  Municipal budgets — published every January.
# Update:  ANNUALLY (January).  Verify at each city's budget page.
# Verified: 2026-06-11
#
# IMPORTANT: These are residential property rates (côte de taxation résidentielle).
# Commercial rates are typically 2–3× higher — do NOT use for commercial listings.
# Always prefer the disclosed values from the listing (municipal_taxes_annual /
# school_taxes_annual).  These fallbacks are last-resort estimates only.
#
# Per-city municipal tax rates (% of assessed value, residential, 2025-2026):
# Verify annually at each city's budget portal.
#
#   Ville de Montréal     https://montreal.ca/sujets/taxes-et-factures
#   Ville de Québec       https://www.ville.quebec.qc.ca/citoyens/taxes/
#   Laval                 https://www.laval.ca/Pages/Fr/Citoyens/compte-de-taxes.aspx
#   Longueuil             https://longueuil.quebec/fr/taxes
#   Sherbrooke            https://www.sherbrooke.ca/fr/services-municipaux/taxes
#   Gatineau              https://www.gatineau.ca/portail/default.aspx?p=taxes_evaluation_fonciere
#   Lévis                 https://www.ville.levis.qc.ca/taxes/
#   Terrebonne            https://www.ville.terrebonne.qc.ca/
#   Brossard              https://www.brossard.ca/taxes
#   Repentigny            https://repentigny.ca/taxes
#   Saint-Jérôme          https://www.vsj.ca/taxes
#   Saguenay              https://www.saguenay.ca/taxes
#   Trois-Rivières        https://www.v3r.net/citoyens/taxes-et-evaluation
#   Drummondville         https://www.drummondville.ca/taxes
#   Granby                https://www.ville.granby.qc.ca/taxes
#
MUNICIPAL_TAX_RATES_BY_CITY: dict[str, float] = {
    # ── Major cities (2025-2026 residential rate) ─────────────────────────────
    "montreal":        0.00674,   # 0.674 % — Ville de Montréal 2026 budget
    "québec":          0.00843,   # 0.843 % — Ville de Québec 2025 (avg across boroughs)
    "quebec":          0.00843,
    "laval":           0.00901,   # 0.901 % — Laval 2025
    "longueuil":       0.01039,   # 1.039 % — Longueuil 2025
    "sherbrooke":      0.01188,   # 1.188 % — Sherbrooke 2025
    "gatineau":        0.01116,   # 1.116 % — Gatineau 2025
    "lévis":           0.00818,   # 0.818 % — Lévis 2025
    "levis":           0.00818,
    "terrebonne":      0.00881,   # 0.881 % — Terrebonne 2025
    "brossard":        0.00782,   # 0.782 % — Brossard 2025
    "repentigny":      0.01015,   # 1.015 % — Repentigny 2025
    "saint-jérôme":    0.01173,   # 1.173 % — Saint-Jérôme 2025
    "saint-jerome":    0.01173,
    "saguenay":        0.01219,   # 1.219 % — Saguenay 2025
    "trois-rivières":  0.01262,   # 1.262 % — Trois-Rivières 2025
    "trois-rivieres":  0.01262,
    "drummondville":   0.01179,   # 1.179 % — Drummondville 2025
    "granby":          0.01074,   # 1.074 % — Granby 2025
    # ── Greater Montreal suburbs (approximate, verify annually) ───────────────
    "saint-lambert":   0.00980,
    "boucherville":    0.00856,
    "saint-bruno":     0.00920,
    "saint-hubert":    0.01050,
    "châteauguay":     0.01100,
    "chateauguay":     0.01100,
    "saint-eustache":  0.01030,
    "blainville":      0.00870,
    "mirabel":         0.00780,
    "mascouche":       0.00930,
    "varennes":        0.00880,
    "sainte-julie":    0.00880,
}

# Provincial fallback — used when city is not in the per-city dict above.
# Weighted average leans toward smaller Quebec municipalities.
MUNICIPAL_TAX_RATE_FALLBACK = 0.0110   # 1.10 % — provincial average (excl. Montreal)

# School tax rates — set annually by school board (comité de gestion).
# Rate shown is per $100 of assessed value (provincial residential avg ~0.10–0.11 %).
# Island of Montreal (CGTSIM): ~0.107 % (2024-2025)
# Other boards: typically 0.09–0.12 %
# Source: https://www.cgtsim.qc.ca/  and individual school board budgets
SCHOOL_TAX_RATE_FALLBACK = 0.00105   # 0.105 % — weighted Quebec average (2025)

# ── Rent estimates (used only when listing does not disclose rental income) ───
#
# Source:  SCHL / CMHC Rental Market Survey — published annually every December.
# URL:     https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/
#          housing-data/data-tables/rental-market/rental-market-report-data-tables
# Update:  ANNUALLY (December).  2025 edition published December 11, 2025.
# Verified: 2026-06-11 (2025 SCHL data for Quebec)
#
DEFAULT_RENT_PER_UNIT = 1_200.0   # Conservative fallback — varies widely by city

RENT_BY_ROOM_TYPE: dict[str, float] = {
    "3.5": 950.0,
    "4.5": 1_150.0,
    "5.5": 1_400.0,
}

# ── Source metadata (used in UI citations) ────────────────────────────────────

SOURCES = {
    "welcome_tax": {
        "name":      "Loi sur les droits de mutation immobilière — RLRQ c. D-15.1",
        "url":       "https://www.legisquebec.gouv.qc.ca/en/document/cs/D-15.1",
        "publisher": "Éditeur officiel du Québec",
        "frequency": "Annually (Quebec CPI indexation)",
        "verified":  "2026-06-11",
    },
    "mortgage_rate": {
        "name":      "Bank of Canada — Key Policy Interest Rate",
        "url":       "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/",
        "publisher": "Bank of Canada",
        "frequency": "8 fixed dates per year",
        "verified":  "2026-06-11",
    },
    "rental_market": {
        "name":      "CMHC Rental Market Survey — Data Tables",
        "url":       "https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables",
        "publisher": "Canada Mortgage and Housing Corporation (CMHC)",
        "frequency": "Annually (December)",
        "verified":  "2026-06-11",
    },
    "municipal_tax": {
        "name":      "Municipal annual budget (varies by city)",
        "url":       "https://montreal.ca/en/topics/taxes-and-invoices",
        "publisher": "Individual municipalities",
        "frequency": "Annually (January)",
        "verified":  "2026-06-11 (approximate)",
    },
}
