"""add delisted verification outcome

Revision ID: b4f8e1c6a9d3
Revises: d0ad8508bfab
Create Date: 2026-08-19 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b4f8e1c6a9d3'
down_revision: Union[str, None] = 'd0ad8508bfab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres can't add an enum value and use it in the same transaction —
    # commit first so this is safe to use immediately after.
    op.execute("COMMIT")
    op.execute("ALTER TYPE verificationoutcome ADD VALUE IF NOT EXISTS 'delisted'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enums — removing one safely requires
    # rebuilding the type, which isn't worth it for a downgrade path. No-op.
    pass
