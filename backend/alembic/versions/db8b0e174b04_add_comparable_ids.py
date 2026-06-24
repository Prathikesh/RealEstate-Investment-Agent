"""add_comparable_ids

Revision ID: db8b0e174b04
Revises: a1b2c3d4e5f6
Create Date: 2026-06-24 18:28:13.747260

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql


revision: str = 'db8b0e174b04'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'properties',
        sa.Column('comparable_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('properties', 'comparable_ids')
