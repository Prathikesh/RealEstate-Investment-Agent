"""add broker_recent_analyses table

Backs the "My recent analyses" dashboard section — a per-broker history of
properties analyzed via the on-demand analyze bar. Implemented as its OWN table
(not a column on `brokers`) on purpose: the app's `collaborator` DB role isn't
the owner of `brokers`, so it can't ALTER it — but it can CREATE (and thus own)
a new table. No foreign keys, for the same privilege reason (can't add
REFERENCES to tables it doesn't own); integrity is enforced in the app layer.

Idempotent (checks table existence first) to match the other migrations here
and stay a safe no-op where the table already exists.

Revision ID: f2a4c8b1d6e3
Revises: 471f39843736
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'f2a4c8b1d6e3'
down_revision: Union[str, None] = '471f39843736'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "broker_recent_analyses" in inspector.get_table_names():
        return

    op.create_table(
        "broker_recent_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("broker_id", UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", UUID(as_uuid=True), nullable=False),
        sa.Column("analyzed_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("broker_id", "property_id", name="uq_broker_recent_analysis"),
    )
    op.create_index("ix_broker_recent_analyses_broker_id", "broker_recent_analyses", ["broker_id"])
    op.create_index("ix_broker_recent_analyses_broker_at", "broker_recent_analyses", ["broker_id", "analyzed_at"])


def downgrade() -> None:
    op.drop_table("broker_recent_analyses")
