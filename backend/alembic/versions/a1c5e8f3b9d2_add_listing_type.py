"""add_listing_type

Revision ID: a1c5e8f3b9d2
Revises: f3a7c1d9e6b2
Create Date: 2026-08-11 00:00:00.000000

Adds Property.listing_type (for_sale/for_rent) so rental listings (currently
merged into unrelated for-sale properties by ReMax's scraper — see
deduplicator.py's tightened dedup cascade in this same change) can be tracked
as their own category instead of contaminating investment scoring.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1c5e8f3b9d2"
down_revision: Union[str, None] = "f3a7c1d9e6b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False: created/dropped explicitly below, same pattern as
# 2b7e4f1a9c3d_add_auth_fields_to_brokers.py's user_role_enum.
listing_type_enum = postgresql.ENUM("FOR_SALE", "FOR_RENT", name="listingtype", create_type=False)


def upgrade() -> None:
    listing_type_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "properties",
        sa.Column(
            "listing_type", listing_type_enum, nullable=False, server_default="FOR_SALE"
        ),
    )
    op.create_index("ix_properties_listing_type", "properties", ["listing_type"])


def downgrade() -> None:
    op.drop_index("ix_properties_listing_type", table_name="properties")
    op.drop_column("properties", "listing_type")

    listing_type_enum.drop(op.get_bind(), checkfirst=True)
