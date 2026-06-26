from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PlotBase(BaseModel):
    cadastral_number: str
    address: str | None = None
    area_m2: float | None = None
    category: str | None = None
    permitted_use: str | None = None
    cadastral_value: float | None = None
    cad_unit: str | None = None
    price: float | None = None
    status: str = "free"
    title: str | None = None
    description: str | None = None
    settlement_id: str | None = None


class PlotCreate(PlotBase):
    pass


class PlotUpdate(BaseModel):
    price: float | None = None
    status: str | None = None
    title: str | None = None
    description: str | None = None
    photos: list[str] | None = None


class PlotResponse(PlotBase):
    id: str
    tenant_id: str
    price_per_hectare: float | None = None
    geometry: Any = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlotListResponse(BaseModel):
    items: list[PlotResponse]
    total: int
    page: int
    page_size: int


class PlotGeoJSON(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict]


class SettlementBase(BaseModel):
    name: str
    description: str | None = None
    address: str | None = None
    region: str | None = None
    district: str | None = None


class SettlementResponse(SettlementBase):
    id: str
    tenant_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class LoginRequest(BaseModel):
    email: str
    password: str


class PlotSearchParams(BaseModel):
    query: str | None = None
    settlement_id: str | None = None
    status: str | None = None
    permitted_use: str | None = None
    price_min: float | None = None
    price_max: float | None = None
    area_min: float | None = None
    area_max: float | None = None
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

    class Config:
        from_attributes = True


class LeadCreate(BaseModel):
    plot_id: str
    buyer_name: str | None = None
    buyer_phone: str | None = None
    buyer_email: str | None = None
    message: str | None = None
