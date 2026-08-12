"""add custom_buy_box

Revision ID: e2f1a9c7b3d5
Revises: d4e9b2c7f1a8
Create Date: 2026-08-12 00:00:00.000000

Broker.custom_buy_box stores the broker's real-number "buy box" targets (the
client's "in numbers, not percentages" request) — the minimums a listing must
meet to pass their criteria (cash flow, cap rate, discount, days listed, price
drop, max price). Account-synced, replacing the earlier localStorage prototype
so the targets follow the user across devices. Null means "no targets set".
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f1a9c7b3d5"
down_revision: Union[str, None] = "d4e9b2c7f1a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "brokers",
        sa.Column("custom_buy_box", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("brokers", "custom_buy_box")
