"""add_market_benchmark

Revision ID: 006db69ca02f
Revises: 5861f27a487a
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '006db69ca02f'
down_revision: Union[str, None] = '5861f27a487a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('properties', sa.Column('market_benchmark', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('properties', 'market_benchmark')
