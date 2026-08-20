"""fix delisted outcome casing

SQLAlchemy's Enum(PythonEnumClass) serializes native Python enums by member
NAME, not .value, by default — the existing verificationoutcome labels are
uppercase ('VERIFIED_MATCH', 'CORRECTED', ...) to match. The previous
migration (b4f8e1c6a9d3) added a lowercase 'delisted' label instead, which
doesn't match what SQLAlchemy actually inserts ('DELISTED') and left the
outcome unusable — confirmed live: every DELISTED insert failed with
InvalidTextRepresentationError. This adds the correctly-cased value; the
stray lowercase 'delisted' label is harmless and left in place (Postgres
has no DROP VALUE for enums).

Revision ID: c7d2f9a4b8e1
Revises: b4f8e1c6a9d3
Create Date: 2026-08-20 04:35:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c7d2f9a4b8e1'
down_revision: Union[str, None] = 'b4f8e1c6a9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute("ALTER TYPE verificationoutcome ADD VALUE IF NOT EXISTS 'DELISTED'")


def downgrade() -> None:
    pass
