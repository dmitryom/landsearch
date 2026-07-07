"""add settlement_id index on plots

Revision ID: 9475ddaeb0ab
Revises: 7990c2c7c37f
Create Date: 2026-07-06 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9475ddaeb0ab'
down_revision: Union[str, None] = '7990c2c7c37f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "idx_plots_settlement_id"


def upgrade() -> None:
    op.create_index(INDEX_NAME, "plots", ["settlement_id"])


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="plots")
