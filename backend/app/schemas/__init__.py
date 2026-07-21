import enum
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..models import PlotStatus


class UserCreate(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str | None = Field(None, max_length=255)
    terms_accepted: Literal[True]
    terms_version: str = Field(default="2026-07-20", max_length=32)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    role: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PlotCreate(BaseModel):
    cadastral_number: str = Field(..., min_length=1, max_length=100)
    address: str | None = Field(None, max_length=500)
    area_m2: float | None = Field(None, ge=0)
    category: str | None = Field(None, max_length=100)
    permitted_use: str | None = Field(None, max_length=255)
    cadastral_value: float | None = Field(None, ge=0)
    cad_unit: str | None = Field(None, max_length=100)
    object_type: str | None = Field(None, max_length=100)
    land_plot_type: str | None = Field(None, max_length=100)
    registration_date: str | None = Field(None, max_length=50)
    ownership_form: str | None = Field(None, max_length=100)
    price: float | None = Field(None, ge=0)
    status: PlotStatus = PlotStatus.free
    title: str | None = Field(None, max_length=500)
    description: str | None = None
    settlement_id: str | None = None


class PlotUpdate(BaseModel):
    price: float | None = Field(None, ge=0)
    status: PlotStatus | None = None
    title: str | None = Field(None, max_length=500)
    description: str | None = None
    photos: list[str] | None = None

    # Cadastral fields are read-only in the API: NSPD is the source of truth.
    model_config = ConfigDict(extra="forbid")


class BulkPlotStatusUpdate(BaseModel):
    plot_ids: list[str] | None = Field(default=None, max_length=1000)
    status: PlotStatus
    all_plots: bool = False
    query: str | None = Field(default=None, max_length=500)
    filter_status: PlotStatus | None = None

    @model_validator(mode="after")
    def validate_target(self):
        if self.all_plots:
            if self.plot_ids:
                raise ValueError("plot_ids cannot be combined with all_plots")
            return self
        if not self.plot_ids:
            raise ValueError("plot_ids or all_plots is required")
        return self


class BulkPlotDelete(BaseModel):
    plot_ids: list[str] | None = Field(default=None, max_length=1000)
    all_plots: bool = False
    query: str | None = Field(default=None, max_length=500)
    filter_status: PlotStatus | None = None

    @model_validator(mode="after")
    def validate_target(self):
        if self.all_plots:
            if self.plot_ids:
                raise ValueError("plot_ids cannot be combined with all_plots")
            return self
        if not self.plot_ids:
            raise ValueError("plot_ids or all_plots is required")
        return self


class PlotResponse(BaseModel):
    id: str
    tenant_id: str
    cadastral_number: str
    address: str | None = None
    area_m2: float | None = None
    category: str | None = None
    permitted_use: str | None = None
    cadastral_value: float | None = None
    cad_unit: str | None = None
    cad_status: str | None = None
    object_type: str | None = None
    land_plot_type: str | None = None
    registration_date: str | None = None
    ownership_form: str | None = None
    price: float | None = None
    price_per_hectare: float | None = None
    status: str = "free"
    title: str | None = None
    description: str | None = None
    geometry: Any = None
    center_lng: float | None = None
    center_lat: float | None = None
    is_active: bool = True
    settlement_id: str | None = None
    vri_code: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PlotListResponse(BaseModel):
    items: list[PlotResponse]
    total: int
    page: int
    page_size: int


class PlotStatsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    total_area_m2: float
    total_area_ha: float
    total_price: float
    avg_price_per_m2: float | None = None
    data_quality: dict[str, int]


class PlotGeoJSON(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict]


class SettlementBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    address: str | None = Field(None, max_length=500)
    region: str | None = Field(None, max_length=100)
    district: str | None = Field(None, max_length=100)


class SettlementCreate(SettlementBase):
    pass


class SettlementBulkCreate(BaseModel):
    items: list[SettlementCreate] = Field(..., min_length=1, max_length=100)


class SettlementBoundaryUpdate(BaseModel):
    mode: Literal["polygon", "radius", "clear"]
    geometry: dict[str, Any] | None = None
    radius_m: float | None = Field(None, ge=0, le=100_000)


class SettlementBoundaryPreview(BaseModel):
    plot_count: int
    by_status: dict[str, int]


class SettlementNspdImportRequest(BaseModel):
    min_coverage: float = Field(default=0.5, ge=0.5, le=1.0)
    dry_run: bool = False


class SettlementNspdImportResult(BaseModel):
    discovered: int
    eligible: int
    created: int
    updated: int
    skipped: int
    failed: int
    dry_run: bool
    errors: list[str] = Field(default_factory=list)


class SettlementResponse(SettlementBase):
    id: str
    tenant_id: str
    created_at: datetime
    public_slug: str | None = None
    is_published: bool = False
    published_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SettlementPublicationUpdate(BaseModel):
    is_published: bool
    public_slug: str | None = Field(None, min_length=3, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class PublicSettlementResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    address: str | None = None
    region: str | None = None
    district: str | None = None
    geometry: dict[str, Any]
    public_slug: str
    stats: dict[str, Any]


class PlotSearchParams(BaseModel):
    query: str | None = None
    settlement_id: str | None = None
    status: str | None = None
    permitted_use: str | None = None
    category: str | None = None
    price_min: float | None = Field(None, ge=0)
    price_max: float | None = Field(None, ge=0)
    area_min: float | None = Field(None, ge=0)
    area_max: float | None = Field(None, ge=0)
    region: str | None = None
    district: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    sort_by: str = "created_at"
    sort_order: str = "desc"


class ImportResponse(BaseModel):
    id: str
    source: str
    status: str
    total_rows: int
    success_rows: int
    error: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeadCreate(BaseModel):
    plot_id: str
    buyer_name: str | None = Field(None, max_length=255)
    buyer_phone: str | None = Field(None, max_length=50)
    buyer_email: str | None = None
    message: str | None = None
    consent_given: Literal[True]
    consent_version: str = Field(default="2026-07-20", max_length=32)


LeadStatus = Literal["new", "in_progress", "closed", "spam"]


class LeadUpdate(BaseModel):
    status: LeadStatus


class LeadResponse(BaseModel):
    id: str
    plot_id: str
    buyer_name: str | None = None
    buyer_phone: str | None = None
    buyer_email: str | None = None
    message: str | None = None
    status: str = "new"
    plot_title: str | None = None
    plot_cadastral_number: str | None = None
    plot_status: str | None = None
    plot_price: float | None = None
    created_at: datetime
    consent_at: datetime | None = None
    consent_version: str | None = None
    expires_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class LegalProfileUpdate(BaseModel):
    operator_name: str | None = Field(None, max_length=500)
    legal_form: str | None = Field(None, max_length=255)
    inn: str | None = Field(None, pattern=r"^(?:\d{10}|\d{12})$")
    ogrn: str | None = Field(None, pattern=r"^(?:\d{13}|\d{15})$")
    address: str | None = Field(None, max_length=1000)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    rkn_registry_number: str | None = Field(None, max_length=100)
    rkn_registry_url: str | None = Field(None, max_length=1000)
    rkn_exemption_reason: str | None = Field(None, max_length=2000)
    policy_effective_date: date | None = None
    lead_retention_days: int = Field(default=365, ge=1, le=3650)
    reservation_retention_days: int = Field(default=365, ge=1, le=3650)

    @field_validator(
        "operator_name",
        "legal_form",
        "address",
        "email",
        "phone",
        "rkn_registry_number",
        "rkn_registry_url",
        "rkn_exemption_reason",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value and ("@" not in value or value.startswith("@") or value.endswith("@")):
            raise ValueError("Invalid email address")
        return value


class LegalProfileResponse(LegalProfileUpdate):
    is_complete: bool = False
    updated_at: datetime | None = None


class PoiType(str, enum.Enum):
    shop = "shop"
    playground = "playground"
    sports = "sports"
    checkpoint = "checkpoint"
    entrance = "entrance"
    exit = "exit"
    parking = "parking"
    school = "school"
    kindergarten = "kindergarten"
    cafe = "cafe"
    medical = "medical"
    sales_office = "sales_office"
    other = "other"


class _SettlementPoiFields(BaseModel):
    poi_type: PoiType | None = None
    custom_type_label: str | None = Field(None, max_length=100)
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    longitude: float | None = Field(None, ge=-180, le=180)
    latitude: float | None = Field(None, ge=-90, le=90)
    is_published: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("POI name is required")
        return value.strip() if value is not None else value

    @field_validator("custom_type_label")
    @classmethod
    def normalize_custom_type_label(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class SettlementPoiCreate(_SettlementPoiFields):
    settlement_id: str
    poi_type: PoiType
    name: str = Field(..., min_length=1, max_length=255)
    longitude: float = Field(..., ge=-180, le=180)
    latitude: float = Field(..., ge=-90, le=90)
    is_published: bool = True

    @model_validator(mode="after")
    def validate_custom_type(self):
        if self.poi_type == PoiType.other and not self.custom_type_label:
            raise ValueError("Custom type label is required for other POIs")
        return self


class SettlementPoiUpdate(_SettlementPoiFields):
    model_config = ConfigDict(extra="forbid")

    @field_validator(
        "poi_type",
        "name",
        "longitude",
        "latitude",
        "is_published",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    @model_validator(mode="after")
    def validate_custom_type(self):
        if self.poi_type == PoiType.other and not self.custom_type_label:
            raise ValueError("Custom type label is required when changing POI type to other")
        return self


class SettlementPoiResponse(BaseModel):
    id: str
    tenant_id: str
    settlement_id: str
    poi_type: PoiType
    custom_type_label: str | None = None
    name: str
    description: str | None = None
    longitude: float
    latitude: float
    is_published: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReservationCreate(BaseModel):
    plot_id: str
    lead_id: str | None = None
    buyer_name: str | None = Field(None, max_length=255)
    buyer_phone: str | None = Field(None, max_length=50)
    buyer_email: str | None = Field(None, max_length=255)
    note: str | None = Field(None, max_length=2000)
    duration_hours: int = Field(default=24, ge=1, le=720)


class ReservationExtend(BaseModel):
    duration_hours: int = Field(..., ge=1, le=720)


class ReservationResponse(BaseModel):
    id: str
    plot_id: str
    lead_id: str | None = None
    responsible_user_id: str
    buyer_name: str | None = None
    buyer_phone: str | None = None
    buyer_email: str | None = None
    note: str | None = None
    status: str
    starts_at: datetime
    expires_at: datetime
    confirmed_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    plot_cadastral_number: str | None = None
    plot_title: str | None = None
    plot_status: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditEventResponse(BaseModel):
    id: str
    actor_id: str | None = None
    entity_type: str
    entity_id: str
    action: str
    details: dict[str, Any]
    created_at: datetime


class WebhookConfigUpdate(BaseModel):
    url: str = Field(..., min_length=12, max_length=1000)
    secret: str | None = Field(None, min_length=16, max_length=500)
    enabled: bool = True


class WebhookConfigResponse(BaseModel):
    url: str | None = None
    enabled: bool = False
    has_secret: bool = False
    updated_at: datetime | None = None


class WebhookDeliveryResponse(BaseModel):
    id: str
    event_id: str
    event_type: str
    status: str
    attempts: int
    next_attempt_at: datetime
    last_http_status: int | None = None
    last_error_code: str | None = None
    delivered_at: datetime | None = None
    created_at: datetime
