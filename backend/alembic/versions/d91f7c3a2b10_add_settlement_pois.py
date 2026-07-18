"""add settlement POIs

Revision ID: d91f7c3a2b10
Revises: c8d1fdce5a91
"""

from typing import Sequence, Union

from alembic import op
from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d91f7c3a2b10"
down_revision: Union[str, None] = "c8d1fdce5a91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settlement_pois",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "settlement_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("settlements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("poi_type", sa.String(32), nullable=False),
        sa.Column("custom_type_label", sa.String(100)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("geometry", Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "poi_type IN ('shop', 'playground', 'sports', 'checkpoint', 'entrance', "
            "'exit', 'parking', 'school', 'kindergarten', 'cafe', 'medical', "
            "'sales_office', 'other')",
            name="ck_settlement_pois_poi_type",
        ),
        sa.CheckConstraint(
            "btrim(name) <> ''",
            name="ck_settlement_pois_name_not_blank",
        ),
        sa.CheckConstraint(
            "poi_type <> 'other' OR "
            "(custom_type_label IS NOT NULL AND btrim(custom_type_label) <> '')",
            name="ck_settlement_pois_other_label",
        ),
    )
    op.create_index("idx_settlement_pois_geometry", "settlement_pois", ["geometry"], postgresql_using="gist")
    op.create_index("idx_settlement_pois_tenant_published", "settlement_pois", ["tenant_id", "is_published"])
    op.create_index("idx_settlement_pois_settlement_id", "settlement_pois", ["settlement_id"])


def downgrade() -> None:
    op.drop_index("idx_settlement_pois_settlement_id", table_name="settlement_pois")
    op.drop_index("idx_settlement_pois_tenant_published", table_name="settlement_pois")
    op.drop_index("idx_settlement_pois_geometry", table_name="settlement_pois")
    op.drop_table("settlement_pois")
