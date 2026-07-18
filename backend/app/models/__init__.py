from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..core.database import Base

import enum
import uuid


class PlotStatus(str, enum.Enum):
    free = "free"
    reserved = "reserved"
    booked = "booked"
    sold = "sold"


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    manager = "manager"
    buyer = "buyer"


class ImportSource(str, enum.Enum):
    excel = "excel"
    csv = "csv"
    google_sheets = "google_sheets"
    yandex_table = "yandex_table"


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    config = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    users = relationship("User", back_populates="tenant")
    settlements = relationship("Settlement", back_populates="tenant")
    plots = relationship("Plot", back_populates="tenant")
    leads = relationship("Lead", back_populates="tenant")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(Enum(UserRole), default=UserRole.buyer)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="users")


class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (
        Index("idx_settlements_geometry", "geometry", postgresql_using="gist"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    geometry = Column(Geometry(srid=4326, spatial_index=False), nullable=True)
    boundary_source = Column(String(32), nullable=True, default="nspd")
    boundary_radius_m = Column(Float, nullable=True)
    boundary_updated_at = Column(DateTime(timezone=True), nullable=True)
    address = Column(String(500))
    region = Column(String(100))
    district = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="settlements")
    plots = relationship("Plot", back_populates="settlement")


class Plot(Base):
    __tablename__ = "plots"
    __table_args__ = (
        Index("idx_plots_geometry", "geometry", postgresql_using="gist"),
        Index("idx_plots_tenant_status", "tenant_id", "status"),
        Index("idx_plots_price", "price"),
        Index("idx_plots_area", "area_m2"),
        Index("idx_plots_permitted_use", "permitted_use"),
        Index("idx_plots_settlement_id", "settlement_id"),
        UniqueConstraint("tenant_id", "cadastral_number", name="uq_plots_tenant_cadastral_number"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    settlement_id = Column(UUID(as_uuid=True), ForeignKey("settlements.id"), nullable=True)
    cadastral_number = Column(String(100), nullable=False, index=True)

    address = Column(String(500))
    area_m2 = Column(Float)
    category = Column(String(100))
    permitted_use = Column(String(255))
    cadastral_value = Column(Float)
    geometry = Column(Geometry(srid=4326, spatial_index=False), nullable=True)
    cad_unit = Column(String(100))
    cad_status = Column(String(100))

    object_type = Column(String(100))
    land_plot_type = Column(String(100))
    registration_date = Column(String(50))
    ownership_form = Column(String(100))

    price = Column(Float)
    price_per_hectare = Column(Float)
    status = Column(Enum(PlotStatus), default=PlotStatus.free)
    title = Column(String(500))
    description = Column(Text)
    photos = Column(JSON, default=list)

    plot_metadata = Column("plot_metadata", JSON, default=dict)
    imported_from = Column(String(50))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="plots")
    settlement = relationship("Settlement", back_populates="plots")
    status_history = relationship("PlotStatusHistory", back_populates="plot")


class PlotStatusHistory(Base):
    __tablename__ = "plot_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    old_status = Column(String(50))
    new_status = Column(String(50), nullable=False)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

    plot = relationship("Plot", back_populates="status_history")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    buyer_name = Column(String(255))
    buyer_phone = Column(String(50))
    buyer_email = Column(String(255))
    message = Column(Text)
    status = Column(String(50), default="new")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="leads")


class Import(Base):
    __tablename__ = "imports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    source = Column(Enum(ImportSource), nullable=False)
    file_url = Column(String(500))
    import_data = Column(JSON)
    status = Column(String(50), default="pending")
    error = Column(Text)
    total_rows = Column(Integer, default=0)
    success_rows = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))


class CadastreCache(Base):
    __tablename__ = "cadastre_cache"
    __table_args__ = (
        Index("idx_cadastre_cache_geometry", "geometry", postgresql_using="gist"),
    )

    cadastral_number = Column(String(100), primary_key=True)
    data = Column(JSON, nullable=False)
    geometry = Column(Geometry(srid=4326, spatial_index=False), nullable=True)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
