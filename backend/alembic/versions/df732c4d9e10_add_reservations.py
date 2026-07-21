"""add conflict-safe plot reservations

Revision ID: df732c4d9e10
Revises: d91f7c3a2b10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "df732c4d9e10"
down_revision: Union[str, None] = "d91f7c3a2b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


reservation_status = postgresql.ENUM(
    "active", "confirmed", "cancelled", "expired", name="reservationstatus", create_type=False
)


def upgrade() -> None:
    reservation_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("responsible_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("buyer_name", sa.String(length=255), nullable=True),
        sa.Column("buyer_phone", sa.String(length=50), nullable=True),
        sa.Column("buyer_email", sa.String(length=255), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", reservation_status, nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.ForeignKeyConstraint(["plot_id"], ["plots.id"]),
        sa.ForeignKeyConstraint(["responsible_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_reservations_tenant_status", "reservations", ["tenant_id", "status"])
    op.create_index("idx_reservations_expires_at", "reservations", ["expires_at"])
    op.create_index(
        "uq_reservations_active_plot",
        "reservations",
        ["plot_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_table("reservations")
    reservation_status.drop(op.get_bind(), checkfirst=True)
