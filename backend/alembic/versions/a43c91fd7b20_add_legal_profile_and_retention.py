"""add legal profile and personal data retention fields

Revision ID: a43c91fd7b20
Revises: f1a7b33c4e20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "a43c91fd7b20"
down_revision: str | None = "f1a7b33c4e20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("terms_version", sa.String(length=32), nullable=True))

    op.add_column("leads", sa.Column("consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("consent_version", sa.String(length=32), nullable=True))
    op.add_column("leads", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE leads SET expires_at = created_at + interval '365 days' WHERE expires_at IS NULL")
    op.create_index("ix_leads_expires_at", "leads", ["expires_at"], unique=False)

    op.add_column("reservations", sa.Column("pii_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE reservations SET pii_expires_at = created_at + interval '365 days' WHERE pii_expires_at IS NULL")
    op.create_index("ix_reservations_pii_expires_at", "reservations", ["pii_expires_at"], unique=False)

    op.create_table(
        "tenant_legal_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operator_name", sa.String(length=500), nullable=True),
        sa.Column("legal_form", sa.String(length=255), nullable=True),
        sa.Column("inn", sa.String(length=12), nullable=True),
        sa.Column("ogrn", sa.String(length=15), nullable=True),
        sa.Column("address", sa.String(length=1000), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("rkn_registry_number", sa.String(length=100), nullable=True),
        sa.Column("rkn_registry_url", sa.String(length=1000), nullable=True),
        sa.Column("rkn_exemption_reason", sa.Text(), nullable=True),
        sa.Column("policy_effective_date", sa.Date(), nullable=True),
        sa.Column("lead_retention_days", sa.Integer(), server_default="365", nullable=False),
        sa.Column("reservation_retention_days", sa.Integer(), server_default="365", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id"),
    )
    op.create_index("ix_tenant_legal_profiles_tenant_id", "tenant_legal_profiles", ["tenant_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tenant_legal_profiles_tenant_id", table_name="tenant_legal_profiles")
    op.drop_table("tenant_legal_profiles")
    op.drop_index("ix_reservations_pii_expires_at", table_name="reservations")
    op.drop_column("reservations", "pii_expires_at")
    op.drop_index("ix_leads_expires_at", table_name="leads")
    op.drop_column("leads", "expires_at")
    op.drop_column("leads", "consent_version")
    op.drop_column("leads", "consent_at")
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
