"""merge broker_recent_analyses and constraint_zones heads

Reconciles two independently-created migration heads:
  - f2a4c8b1d6e3 (add_broker_recent_analysis_ids), off 471f39843736
  - 8c4819d1256d (add_constraint_zones), off b4677d03e016

A prior migration in this history (since removed) was itself named
f2a4c8b1d6e3 under the mistaken belief that production's existing
alembic_version of that value was an undocumented/orphaned merge of
471f39843736 and 8c4819d1256d. It wasn't — that value was legitimately
the add_broker_recent_analysis_ids migration (confirmed live:
broker_recent_analyses already exists in production), which happened to
land on the exact same randomly-generated 12-hex revision id as the
mistaken merge migration. Two files sharing one revision id broke the
whole migration graph ("Revision f2a4c8b1d6e3 is present more than once"),
which is what this migration (with a freshly-generated, collision-free id)
actually fixes — production already has both heads' schema changes
(broker_recent_analyses table + constraint_zones table, both confirmed
live), so this merge carries no schema changes of its own, like any other
pure merge revision.

Revision ID: adedb4b3afe0
Revises: f2a4c8b1d6e3, 8c4819d1256d
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'adedb4b3afe0'
down_revision: Union[str, Sequence[str], None] = ('f2a4c8b1d6e3', '8c4819d1256d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
