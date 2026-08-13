"""add location_cities

Revision ID: f3a7c1d9e6b2
Revises: e2f1a9c7b3d5
Create Date: 2026-08-13 00:00:00.000000

Broker.location_cities stores the multi-city selection from Settings → Search
location as a JSONB list of city names (e.g. ["Montréal", "Laval"]). The existing
single location_city column is kept in sync with the first entry for back-compat.
Defaults to an empty list.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f3a7c1d9e6b2"
down_revision: Union[str, None] = "e2f1a9c7b3d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "brokers",
        sa.Column(
            "location_cities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default="[]",
        ),
    )
    # Backfill: seed the list from the existing single city where one is set.
    op.execute(
        "UPDATE brokers SET location_cities = jsonb_build_array(location_city) "
        "WHERE location_city IS NOT NULL AND location_city <> ''"
    )


def downgrade() -> None:
    op.drop_column("brokers", "location_cities")
