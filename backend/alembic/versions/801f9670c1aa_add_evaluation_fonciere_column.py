"""add evaluation_fonciere column

`Property.evaluation_fonciere` (app/models/property.py) has never had a
migration since the column was added to the model — confirmed by grepping
every file under alembic/versions/ for "evaluation" (zero matches). It
already exists on the production database via an out-of-band `ALTER TABLE`
at some point outside migration history, which is exactly why every INSERT
against `properties` hasn't been failing — but that means a fresh database
built purely from `alembic upgrade head` (a new environment, a disaster
recovery restore, a local dev setup) would be missing it. `IF NOT EXISTS`
makes this safe to run against production as a no-op, and correct for any
environment that doesn't have it yet.

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
    op.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS evaluation_fonciere FLOAT")


def downgrade() -> None:
    pass
