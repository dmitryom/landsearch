"""repair settlement POI schema for databases stamped past the POI migration"""

from typing import Sequence, Union

from alembic import op
from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "ff2c3d4e5f60"
down_revision: Union[str, None] = "ff1b2c3d4e50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "settlement_pois" not in tables:
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
            sa.CheckConstraint("btrim(name) <> ''", name="ck_settlement_pois_name_not_blank"),
            sa.CheckConstraint(
                "poi_type <> 'other' OR "
                "(custom_type_label IS NOT NULL AND btrim(custom_type_label) <> '')",
                name="ck_settlement_pois_other_label",
            ),
        )

    indexes = {item["name"] for item in inspector.get_indexes("settlement_pois")}
    if "idx_settlement_pois_geometry" not in indexes:
        op.create_index("idx_settlement_pois_geometry", "settlement_pois", ["geometry"], postgresql_using="gist")
    if "idx_settlement_pois_tenant_published" not in indexes:
        op.create_index("idx_settlement_pois_tenant_published", "settlement_pois", ["tenant_id", "is_published"])
    if "idx_settlement_pois_settlement_id" not in indexes:
        op.create_index("idx_settlement_pois_settlement_id", "settlement_pois", ["settlement_id"])


def downgrade() -> None:
    # This repair may have restored a table that existed before the migration was stamped.
    # Keeping downgrade non-destructive avoids deleting operator-created POIs.
    pass
