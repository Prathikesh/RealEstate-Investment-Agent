"""add score_components and custom_score_weights

Revision ID: c3f8a1d9e2b6
Revises: a7c2e5f9d1b4
Create Date: 2026-08-05 00:00:00.000000

Property.score_components stores the per-factor breakdown (discount, cap_rate,
cash_flow, grm, confidence, dom_bonus, price_history, plus the risk/neighbourhood/
unverified-income modifiers) that OpportunityScorer.score() already computes but
previously discarded after writing the final total/category. Needed so the
frontend can show an accurate "Score Breakdown" and let a broker recombine the
same components with their own weights ("Your Verdict").

Broker.custom_score_weights stores an optional per-broker override of the
scorer's weight dict (see app/agent/scorer.py WEIGHTS). Null means "use my
investment_strategy's preset weights".
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3f8a1d9e2b6"
down_revision: Union[str, None] = "a7c2e5f9d1b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column("score_components", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "brokers",
        sa.Column("custom_score_weights", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("brokers", "custom_score_weights")
    op.drop_column("properties", "score_components")
