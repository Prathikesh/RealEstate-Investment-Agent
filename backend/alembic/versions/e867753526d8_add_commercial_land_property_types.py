"""add commercial and land property types

Adds COMMERCIAL and LAND to the propertytype enum so Centris commercial
(batisse-commerciale, commerce, local-commercial, local-industriel,
batisse-industrielle) and land (terrain, terre) listings can be scraped
and stored as first-class property types, alongside the existing
residential types.

Same privilege-safe pattern as 471f39843736 (add remax scraper source):
`ADD VALUE IF NOT EXISTS` still requires ownership of the type to attempt
the statement at all, and this database's app role doesn't own these
types (confirmed via a prior production deploy failure this session) —
so check pg_enum first and only run ALTER TYPE when genuinely missing.

Revision ID: e867753526d8
Revises: f2a4c8b1d6e3
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e867753526d8'
down_revision: Union[str, None] = 'f2a4c8b1d6e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    for label in ("COMMERCIAL", "LAND"):
        exists = conn.execute(sa.text(
            "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
            "WHERE t.typname = 'propertytype' AND e.enumlabel = :label"
        ), {"label": label}).first()
        if not exists:
            op.execute("COMMIT")
            op.execute(f"ALTER TYPE propertytype ADD VALUE '{label}'")


def downgrade() -> None:
    pass
