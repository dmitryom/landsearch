import json
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import shape
from geoalchemy2.elements import WKTElement
from shapely.geometry import Point
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...core.database import get_session
from ...models import Settlement, SettlementPoi, User, UserRole
from ...schemas import PoiType, SettlementPoiCreate, SettlementPoiResponse, SettlementPoiUpdate
from ..deps import get_tenant_scope_optional, require_role


router = APIRouter(prefix="/pois", tags=["pois"])


async def _get_redis():
    try:
        cache = aioredis.from_url(settings.redis_url, decode_responses=True)
        await cache.ping()
        return cache
    except Exception:
        return None


async def _invalidate_poi_cache(tenant_id: UUID) -> None:
    cache = await _get_redis()
    if cache is None:
        return
    try:
        keys = [key async for key in cache.scan_iter(match=f"landsearch:pois:{tenant_id}:*", count=500)]
        if keys:
            await cache.delete(*keys)
    except Exception:
        return


def _parse_uuid(value: str, field: str) -> UUID:
    try:
        return UUID(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {field}") from exc


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        min_lng, min_lat, max_lng, max_lat = (float(value) for value in bbox.split(","))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="bbox must be minLng,minLat,maxLng,maxLat") from exc
    if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
        raise HTTPException(status_code=422, detail="bbox must be a valid WGS84 extent")
    return min_lng, min_lat, max_lng, max_lat


def _parse_types(types: str | None) -> list[str]:
    if not types:
        return []
    parsed: list[str] = []
    for value in types.split(","):
        try:
            parsed.append(PoiType(value.strip()).value)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Unknown POI type: {value}") from exc
    return sorted(set(parsed))


def _cache_key(tenant_id: UUID | None, bbox: tuple[float, float, float, float], types: list[str]) -> str:
    rounded_bbox = ",".join(f"{value:.4f}" for value in bbox)
    type_filter = ",".join(types) if types else "all"
    return f"landsearch:pois:{tenant_id or 'none'}:{rounded_bbox}:{type_filter}"


def _poi_coordinates(poi: SettlementPoi) -> tuple[float, float]:
    point = shape.to_shape(poi.geometry)
    return float(point.x), float(point.y)


def _poi_to_response(poi: SettlementPoi) -> SettlementPoiResponse:
    longitude, latitude = _poi_coordinates(poi)
    return SettlementPoiResponse(
        id=str(poi.id),
        tenant_id=str(poi.tenant_id),
        settlement_id=str(poi.settlement_id),
        poi_type=PoiType(poi.poi_type),
        custom_type_label=poi.custom_type_label,
        name=poi.name,
        description=poi.description,
        longitude=longitude,
        latitude=latitude,
        is_published=poi.is_published,
        created_at=poi.created_at,
        updated_at=poi.updated_at,
    )


async def _get_owned_settlement(session: AsyncSession, settlement_id: str, tenant_id: UUID) -> Settlement:
    result = await session.execute(
        select(Settlement).where(
            Settlement.id == _parse_uuid(settlement_id, "settlement_id"),
            Settlement.tenant_id == tenant_id,
        )
    )
    settlement = result.scalar_one_or_none()
    if settlement is None:
        raise HTTPException(status_code=404, detail="Settlement not found")
    return settlement


async def _get_owned_poi(session: AsyncSession, poi_id: str, tenant_id: UUID) -> SettlementPoi:
    result = await session.execute(
        select(SettlementPoi).where(
            SettlementPoi.id == _parse_uuid(poi_id, "poi_id"),
            SettlementPoi.tenant_id == tenant_id,
        )
    )
    poi = result.scalar_one_or_none()
    if poi is None:
        raise HTTPException(status_code=404, detail="POI not found")
    return poi


def _point_element(longitude: float, latitude: float) -> WKTElement:
    return WKTElement(Point(longitude, latitude).wkt, srid=4326)


def _validate_effective_type(poi_type: PoiType | str, custom_type_label: str | None) -> None:
    if poi_type == PoiType.other or poi_type == PoiType.other.value:
        if not (custom_type_label or "").strip():
            raise HTTPException(status_code=422, detail="Custom type label is required for other POIs")


@router.get("")
async def list_public_pois(
    bbox: str = Query(...),
    types: str | None = None,
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
):
    parsed_bbox = _parse_bbox(bbox)
    parsed_types = _parse_types(types)
    cache_key = _cache_key(tenant_id, parsed_bbox, parsed_types)
    cache = await _get_redis()
    if cache is not None:
        try:
            cached = await cache.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    if tenant_id is None:
        return {"type": "FeatureCollection", "features": []}

    min_lng, min_lat, max_lng, max_lat = parsed_bbox
    envelope = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    stmt = (
        select(SettlementPoi, Settlement.name)
        .join(Settlement, Settlement.id == SettlementPoi.settlement_id)
        .where(
            SettlementPoi.tenant_id == tenant_id,
            Settlement.tenant_id == tenant_id,
            SettlementPoi.is_published.is_(True),
            SettlementPoi.geometry.op("&&")(envelope),
        )
        .order_by(SettlementPoi.created_at.desc())
        .limit(2000)
    )
    if parsed_types:
        stmt = stmt.where(SettlementPoi.poi_type.in_(parsed_types))
    rows = (await session.execute(stmt)).all()
    features = []
    for poi, settlement_name in rows:
        longitude, latitude = _poi_coordinates(poi)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                "properties": {
                    "id": str(poi.id),
                    "settlement_id": str(poi.settlement_id),
                    "settlement_name": settlement_name,
                    "poi_type": poi.poi_type,
                    "custom_type_label": poi.custom_type_label,
                    "name": poi.name,
                    "description": poi.description,
                },
            }
        )
    response = {"type": "FeatureCollection", "features": features}
    if cache is not None:
        try:
            await cache.setex(cache_key, 300, json.dumps(response))
        except Exception:
            pass
    return response


@router.get("/admin", response_model=list[SettlementPoiResponse])
async def list_admin_pois(
    settlement_id: str = Query(...),
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    settlement = await _get_owned_settlement(session, settlement_id, current_user.tenant_id)
    result = await session.execute(
        select(SettlementPoi)
        .where(
            SettlementPoi.tenant_id == current_user.tenant_id,
            SettlementPoi.settlement_id == settlement.id,
        )
        .order_by(SettlementPoi.created_at.desc())
    )
    return [_poi_to_response(poi) for poi in result.scalars().all()]


@router.post("", response_model=SettlementPoiResponse, status_code=201)
async def create_poi(
    body: SettlementPoiCreate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    settlement = await _get_owned_settlement(session, body.settlement_id, current_user.tenant_id)
    poi = SettlementPoi(
        tenant_id=current_user.tenant_id,
        settlement_id=settlement.id,
        poi_type=body.poi_type.value,
        custom_type_label=body.custom_type_label,
        name=body.name,
        description=body.description,
        geometry=_point_element(body.longitude, body.latitude),
        is_published=body.is_published,
    )
    session.add(poi)
    await session.commit()
    await session.refresh(poi)
    await _invalidate_poi_cache(current_user.tenant_id)
    return _poi_to_response(poi)


@router.patch("/{poi_id}", response_model=SettlementPoiResponse)
async def update_poi(
    poi_id: str,
    body: SettlementPoiUpdate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    poi = await _get_owned_poi(session, poi_id, current_user.tenant_id)
    fields = body.model_fields_set
    longitude, latitude = _poi_coordinates(poi)
    if "longitude" in fields:
        longitude = body.longitude
    if "latitude" in fields:
        latitude = body.latitude
    poi_type = body.poi_type.value if "poi_type" in fields else poi.poi_type
    custom_type_label = body.custom_type_label if "custom_type_label" in fields else poi.custom_type_label
    _validate_effective_type(poi_type, custom_type_label)

    for field in ("custom_type_label", "name", "description", "is_published"):
        if field in fields:
            setattr(poi, field, getattr(body, field))
    if "poi_type" in fields:
        poi.poi_type = poi_type
    if "longitude" in fields or "latitude" in fields:
        poi.geometry = _point_element(longitude, latitude)
    await session.commit()
    await session.refresh(poi)
    await _invalidate_poi_cache(current_user.tenant_id)
    return _poi_to_response(poi)


@router.delete("/{poi_id}", status_code=204)
async def delete_poi(
    poi_id: str,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    poi = await _get_owned_poi(session, poi_id, current_user.tenant_id)
    await session.delete(poi)
    await session.commit()
    await _invalidate_poi_cache(current_user.tenant_id)
