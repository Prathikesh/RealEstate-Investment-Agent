"""add auth fields to brokers

Revision ID: 2b7e4f1a9c3d
Revises: 8c4819d1256d
Create Date: 2026-07-27 00:00:00.000000

Adds email/password + role-based auth on top of the existing Google-OAuth
scaffold: google_id becomes optional, password_hash/role/is_verified/
last_active_at are added.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "2b7e4f1a9c3d"
down_revision: Union[str, None] = "8c4819d1256d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False: created/dropped explicitly below so we control the
# exact point in the migration it happens (op.add_column won't do it for us
# on an ALTER, only implicitly during op.create_table).
user_role_enum = postgresql.ENUM("USER", "ADMIN", name="userrole", create_type=False)


def upgrade() -> None:
    user_role_enum.create(op.get_bind(), checkfirst=True)

    op.alter_column("brokers", "google_id", existing_type=sa.String(100), nullable=True)

    op.add_column("brokers", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("brokers", sa.Column("role", user_role_enum, nullable=False, server_default="USER"))
    op.add_column("brokers", sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("brokers", sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("brokers", "last_active_at")
    op.drop_column("brokers", "is_verified")
    op.drop_column("brokers", "role")
    op.drop_column("brokers", "password_hash")

    op.alter_column("brokers", "google_id", existing_type=sa.String(100), nullable=False)

    user_role_enum.drop(op.get_bind(), checkfirst=True)
