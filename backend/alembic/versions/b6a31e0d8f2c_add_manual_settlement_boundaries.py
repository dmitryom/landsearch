"""add manual settlement boundary metadata

Revision ID: b6a31e0d8f2c
Revises: 9475ddaeb0ab
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6a31e0d8f2c"
down_revision: Union[str, None] = "9475ddaeb0ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("settlements", sa.Column("boundary_source", sa.String(length=32), nullable=True))
    op.add_column("settlements", sa.Column("boundary_radius_m", sa.Float(), nullable=True))
    op.add_column("settlements", sa.Column("boundary_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("settlements", "boundary_updated_at")
    op.drop_column("settlements", "boundary_radius_m")
    op.drop_column("settlements", "boundary_source")
