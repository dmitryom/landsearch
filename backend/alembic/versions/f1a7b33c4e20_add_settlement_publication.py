"""add settlement publication fields

Revision ID: f1a7b33c4e20
Revises: e8c2a921ab44
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a7b33c4e20"
down_revision: Union[str, None] = "e8c2a921ab44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("settlements", sa.Column("public_slug", sa.String(length=100), nullable=True))
    op.add_column("settlements", sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("settlements", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_settlements_public_slug", "settlements", ["public_slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_settlements_public_slug", table_name="settlements")
    op.drop_column("settlements", "published_at")
    op.drop_column("settlements", "is_published")
    op.drop_column("settlements", "public_slug")
