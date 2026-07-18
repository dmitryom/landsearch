import enum
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..models import PlotStatus


class UserCreate(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str | None = Field(None, max_length=255)


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


class SettlementResponse(SettlementBase):
    id: str
    tenant_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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
