"""add remax scraper source

Same class of gap as c7d2f9a4b8e1 (fix delisted outcome casing): production's
`scrapersource` enum already has a 'REMAX' label — confirmed live, restoring
a production backup's property_snapshots/property_sources/
property_verification_log tables against a database built purely from
`alembic upgrade head` fails with `invalid input value for enum
scrapersource: "REMAX"` — but no migration in this history ever added it.
Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction
block, hence the COMMIT first (same pattern as c7d2f9a4b8e1).

Checking for the label first, same reasoning as 801f9670c1aa: `ADD VALUE IF
NOT EXISTS` still requires ownership of the type to attempt the statement —
confirmed on this same production database that the app's connection role
doesn't own `properties` (a sibling migration hit
`psycopg2.errors.InsufficientPrivilege` there), so the same is plausible for
`scrapersource`. Skip entirely when the label is already present.

Revision ID: 471f39843736
Revises: 801f9670c1aa
Create Date: 2026-09-09 11:27:14.686069

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '471f39843736'
down_revision: Union[str, None] = '801f9670c1aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(sa.text(
        "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
        "WHERE t.typname = 'scrapersource' AND e.enumlabel = 'REMAX'"
    )).first()
    if not exists:
        op.execute("COMMIT")
        op.execute("ALTER TYPE scrapersource ADD VALUE 'REMAX'")


def downgrade() -> None:
    pass
