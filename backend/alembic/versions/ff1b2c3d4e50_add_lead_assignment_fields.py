"""add lead assignment and response tracking fields

Revision ID: ff1b2c3d4e50
Revises: a43c91fd7b20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "ff1b2c3d4e50"
down_revision: str | None = "a43c91fd7b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("leads", sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_leads_assigned_user_id", "leads", "users", ["assigned_user_id"], ["id"])
    op.create_index("idx_leads_tenant_status_created", "leads", ["tenant_id", "status", "created_at"])
    op.create_index("idx_leads_assigned_user", "leads", ["tenant_id", "assigned_user_id"])


def downgrade() -> None:
    op.drop_index("idx_leads_assigned_user", table_name="leads")
    op.drop_index("idx_leads_tenant_status_created", table_name="leads")
    op.drop_constraint("fk_leads_assigned_user_id", "leads", type_="foreignkey")
    op.drop_column("leads", "first_response_at")
    op.drop_column("leads", "assigned_at")
    op.drop_column("leads", "assigned_user_id")
