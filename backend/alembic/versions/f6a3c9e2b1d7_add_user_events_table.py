"""add user_events table

Revision ID: f6a3c9e2b1d7
Revises: 9d4c6a2f0e8b
Create Date: 2026-07-27 00:00:02.000000

First-party activity log (app.analytics.models.UserEvent) — backs the admin
dashboard's active-users / most-used-pages / most-searched-properties views.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a3c9e2b1d7"
down_revision: Union[str, None] = "9d4c6a2f0e8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

event_type_enum = postgresql.ENUM(
    "LOGIN", "PAGE_VIEW", "SEARCH", "PROPERTY_VIEW", name="eventtype", create_type=False
)


def upgrade() -> None:
    event_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "user_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", event_type_enum, nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["brokers.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_events_user_id_created_at", "user_events", ["user_id", "created_at"])
    op.create_index("ix_user_events_event_type_created_at", "user_events", ["event_type", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_user_events_event_type_created_at", table_name="user_events")
    op.drop_index("ix_user_events_user_id_created_at", table_name="user_events")
    op.drop_table("user_events")
    event_type_enum.drop(op.get_bind(), checkfirst=True)
