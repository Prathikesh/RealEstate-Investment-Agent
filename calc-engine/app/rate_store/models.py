"""
SQLModel database tables for the rate store.

RateRecord   — one scraped value (e.g., Montreal mill rate = 10.2427 per $1,000)
ScrapeLog    — audit record of every scrape attempt (success or failure)
ChangeLog    — record of every rate change detected
"""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class RateRecord(SQLModel, table=True):
    """
    A single rate value scraped from an official source.
    Only the record with is_active=True is used by the calculation engine.
    Old records are deactivated (not deleted) for full history.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    municipality_code: str = Field(index=True)      # "MTL", "QC", "GLOBAL"
    school_board_code: str = Field(default="")      # "CSDM", "EMSB", "" for global rates
    rate_type: str = Field(index=True)              # "welcome_tax_brackets", "municipal_mill",
                                                    # "school_tax", "gst", "qst", "cmhc_premiums"
    value: str                                      # Stored as string — preserves Decimal precision
    unit: str                                       # "pct", "per_1000", "bracket_json"
    source_url: str
    source_law: Optional[str] = None
    scraped_at: datetime
    data_version: str                               # "2025.1", "2025.2"
    is_active: bool = Field(default=True, index=True)


class ScrapeLog(SQLModel, table=True):
    """Audit log of every scrape attempt — success or failure."""

    id: Optional[int] = Field(default=None, primary_key=True)
    run_at: datetime
    municipality_code: str
    rate_type: str
    source_url: str
    success: bool
    error_message: Optional[str] = None
    duration_ms: int
    job_id: str = ""    # "manual" or "scheduler_<timestamp>"


class ChangeLog(SQLModel, table=True):
    """Record of every rate change detected between scrape runs."""

    id: Optional[int] = Field(default=None, primary_key=True)
    detected_at: datetime
    municipality_code: str
    rate_type: str
    old_value: str
    new_value: str
    old_version: str
    new_version: str
    source_url: str
    webhook_sent: bool = False
