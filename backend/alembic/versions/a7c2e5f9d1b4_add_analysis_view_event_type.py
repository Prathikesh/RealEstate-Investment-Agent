"""add analysis_view event type

Revision ID: a7c2e5f9d1b4
Revises: f6a3c9e2b1d7
Create Date: 2026-07-27 00:00:03.000000

Adds ANALYSIS_VIEW to the eventtype enum — logged when a user runs the full
financial analysis on a property (distinct from just viewing its listing).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a7c2e5f9d1b4"
down_revision: Union[str, None] = "f6a3c9e2b1d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on some
    # PG versions; autocommit_block() is Alembic's mechanism for exactly this.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'ANALYSIS_VIEW'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enums short of rebuilding the type;
    # left as a no-op, matching this project's other additive enum migrations.
    pass
