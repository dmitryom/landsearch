"""add nspd fields: object_type, land_plot_type, registration_date, ownership_form

Revision ID: 7990c2c7c37f
Revises: 25f047cef674
Create Date: 2026-07-01 20:13:19.860825

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7990c2c7c37f'
down_revision: Union[str, None] = '25f047cef674'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plots', sa.Column('object_type', sa.String(length=100), nullable=True))
    op.add_column('plots', sa.Column('land_plot_type', sa.String(length=100), nullable=True))
    op.add_column('plots', sa.Column('registration_date', sa.String(length=50), nullable=True))
    op.add_column('plots', sa.Column('ownership_form', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('plots', 'ownership_form')
    op.drop_column('plots', 'registration_date')
    op.drop_column('plots', 'land_plot_type')
    op.drop_column('plots', 'object_type')
