"""add evaluation_fonciere column

`Property.evaluation_fonciere` (app/models/property.py) has never had a
migration since the column was added to the model — confirmed by grepping
every file under alembic/versions/ for "evaluation" (zero matches). It
already exists on the production database via an out-of-band `ALTER TABLE`
at some point outside migration history, which is exactly why every INSERT
against `properties` hasn't been failing — but that means a fresh database
built purely from `alembic upgrade head` (a new environment, a disaster
recovery restore, a local dev setup) would be missing it.

Confirmed live: `ADD COLUMN IF NOT EXISTS` still requires table-ownership
privilege just to attempt the statement, even when it would end up a no-op —
this broke the production deploy with `psycopg2.errors.InsufficientPrivilege:
must be owner of table properties` (the app's connection role isn't the
table's owner; whatever originally ran the out-of-band ALTER apparently used
a more privileged role). Checking column existence in Python first, so the
ALTER is never even attempted against a database that already has it.

Revision ID: 801f9670c1aa
Revises: c7d2f9a4b8e1
Create Date: 2026-09-09 11:27:14.515674

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '801f9670c1aa'
down_revision: Union[str, None] = 'c7d2f9a4b8e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("properties")}
    if "evaluation_fonciere" not in columns:
        op.add_column("properties", sa.Column("evaluation_fonciere", sa.Float(), nullable=True))


def downgrade() -> None:
    pass
