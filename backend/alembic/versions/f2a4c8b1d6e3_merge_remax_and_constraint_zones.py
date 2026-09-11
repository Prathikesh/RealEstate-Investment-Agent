"""merge remax and constraint_zones heads

Retroactively documents a merge that was already applied to production
(alembic_version = 'f2a4c8b1d6e3') but whose file was never committed —
confirmed live: production's schema already has both the REMAX enum value
(471f39843736) and the constraint_zones table (8c4819d1256d), with nothing
else unexplained, so this merge carries no schema changes of its own, same
as any other pure merge revision.

Revision ID: f2a4c8b1d6e3
Revises: 471f39843736, 8c4819d1256d
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a4c8b1d6e3'
down_revision: Union[str, Sequence[str], None] = ('471f39843736', '8c4819d1256d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
