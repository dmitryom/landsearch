from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
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
    text,
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


class ReservationStatus(str, enum.Enum):
    active = "active"
    confirmed = "confirmed"
    cancelled = "cancelled"
    expired = "expired"


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
    pois = relationship("SettlementPoi", back_populates="tenant")
    reservations = relationship("Reservation", back_populates="tenant")
    legal_profile = relationship(
        "TenantLegalProfile",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan",
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(Enum(UserRole), default=UserRole.buyer)
    is_active = Column(Boolean, default=True)
    terms_accepted_at = Column(DateTime(timezone=True))
    terms_version = Column(String(32))
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
    public_slug = Column(String(100), unique=True, nullable=True, index=True)
    is_published = Column(Boolean, nullable=False, default=False)
    published_at = Column(DateTime(timezone=True), nullable=True)
    address = Column(String(500))
    region = Column(String(100))
    district = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="settlements")
    plots = relationship("Plot", back_populates="settlement")
    pois = relationship("SettlementPoi", back_populates="settlement", cascade="all, delete-orphan")


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
    reservations = relationship("Reservation", back_populates="plot")


class PlotStatusHistory(Base):
    __tablename__ = "plot_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    old_status = Column(String(50))
    new_status = Column(String(50), nullable=False)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

    plot = relationship("Plot", back_populates="status_history")


class SettlementPoi(Base):
    __tablename__ = "settlement_pois"
    __table_args__ = (
        Index("idx_settlement_pois_geometry", "geometry", postgresql_using="gist"),
        Index("idx_settlement_pois_tenant_published", "tenant_id", "is_published"),
        Index("idx_settlement_pois_settlement_id", "settlement_id"),
        CheckConstraint(
            "poi_type IN ('shop', 'playground', 'sports', 'checkpoint', 'entrance', "
            "'exit', 'parking', 'school', 'kindergarten', 'cafe', 'medical', "
            "'sales_office', 'other')",
            name="ck_settlement_pois_poi_type",
        ),
        CheckConstraint(
            "btrim(name) <> ''",
            name="ck_settlement_pois_name_not_blank",
        ),
        CheckConstraint(
            "poi_type <> 'other' OR "
            "(custom_type_label IS NOT NULL AND btrim(custom_type_label) <> '')",
            name="ck_settlement_pois_other_label",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    settlement_id = Column(UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="CASCADE"), nullable=False)
    poi_type = Column(String(32), nullable=False)
    custom_type_label = Column(String(100))
    name = Column(String(255), nullable=False)
    description = Column(Text)
    geometry = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False)
    is_published = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="pois")
    settlement = relationship("Settlement", back_populates="pois")


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
    consent_at = Column(DateTime(timezone=True))
    consent_version = Column(String(32))
    expires_at = Column(DateTime(timezone=True), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="leads")


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (
        Index("idx_reservations_tenant_status", "tenant_id", "status"),
        Index("idx_reservations_expires_at", "expires_at"),
        Index(
            "uq_reservations_active_plot",
            "plot_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    plot_id = Column(UUID(as_uuid=True), ForeignKey("plots.id"), nullable=False)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id"), nullable=True)
    responsible_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    buyer_name = Column(String(255))
    buyer_phone = Column(String(50))
    buyer_email = Column(String(255))
    note = Column(Text)
    status = Column(Enum(ReservationStatus), nullable=False, default=ReservationStatus.active)
    starts_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    pii_expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    confirmed_at = Column(DateTime(timezone=True))
    cancelled_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="reservations")
    plot = relationship("Plot", back_populates="reservations")


class TenantLegalProfile(Base):
    __tablename__ = "tenant_legal_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    operator_name = Column(String(500))
    legal_form = Column(String(255))
    inn = Column(String(12))
    ogrn = Column(String(15))
    address = Column(String(1000))
    email = Column(String(255))
    phone = Column(String(50))
    rkn_registry_number = Column(String(100))
    rkn_registry_url = Column(String(1000))
    rkn_exemption_reason = Column(Text)
    policy_effective_date = Column(Date)
    lead_retention_days = Column(Integer, nullable=False, default=365, server_default="365")
    reservation_retention_days = Column(Integer, nullable=False, default=365, server_default="365")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="legal_profile")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("idx_audit_events_tenant_created", "tenant_id", "created_at"),
        Index("idx_audit_events_entity", "tenant_id", "entity_type", "entity_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TenantWebhookConfig(Base):
    __tablename__ = "tenant_webhook_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, unique=True)
    url = Column(String(1000), nullable=False)
    secret_encrypted = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WebhookOutbox(Base):
    __tablename__ = "webhook_outbox"
    __table_args__ = (
        Index("idx_webhook_outbox_due", "status", "next_attempt_at"),
        Index("idx_webhook_outbox_tenant_created", "tenant_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("audit_events.id"), nullable=False, unique=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_http_status = Column(Integer)
    last_error_code = Column(String(100))
    delivered_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


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
