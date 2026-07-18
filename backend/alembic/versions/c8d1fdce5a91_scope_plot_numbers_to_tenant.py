"""scope plot cadastral numbers to a tenant

Revision ID: c8d1fdce5a91
Revises: b6a31e0d8f2c
"""

from alembic import op
import sqlalchemy as sa


revision = "c8d1fdce5a91"
down_revision = "b6a31e0d8f2c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    legacy_constraints = bind.execute(sa.text("""
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'plots'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (cadastral_number)'
    """)).scalars()
    for constraint_name in legacy_constraints:
        op.drop_constraint(constraint_name, "plots", type_="unique")
    op.create_unique_constraint("uq_plots_tenant_cadastral_number", "plots", ["tenant_id", "cadastral_number"])


def downgrade() -> None:
    op.drop_constraint("uq_plots_tenant_cadastral_number", "plots", type_="unique")
    op.create_unique_constraint("plots_cadastral_number_key", "plots", ["cadastral_number"])
