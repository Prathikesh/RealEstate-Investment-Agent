"""add agent contact fields

Revision ID: a1b2c3d4e5f6
Revises: 48962df77669
Create Date: 2026-06-04 00:00:00.000000

Adds agent_name, agent_phone, agent_email, agency_name to both
properties and property_sources tables for multi-signal deduplication.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "48962df77669"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("agent_name",  sa.String(200), nullable=True))
    op.add_column("properties", sa.Column("agent_phone", sa.String(50),  nullable=True))
    op.add_column("properties", sa.Column("agent_email", sa.String(200), nullable=True))
    op.add_column("properties", sa.Column("agency_name", sa.String(200), nullable=True))

    op.add_column("property_sources", sa.Column("agent_name",  sa.String(200), nullable=True))
    op.add_column("property_sources", sa.Column("agent_phone", sa.String(50),  nullable=True))
    op.add_column("property_sources", sa.Column("agent_email", sa.String(200), nullable=True))
    op.add_column("property_sources", sa.Column("agency_name", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("property_sources", "agency_name")
    op.drop_column("property_sources", "agent_email")
    op.drop_column("property_sources", "agent_phone")
    op.drop_column("property_sources", "agent_name")

    op.drop_column("properties", "agency_name")
    op.drop_column("properties", "agent_email")
    op.drop_column("properties", "agent_phone")
    op.drop_column("properties", "agent_name")
