import asyncio
import base64
import hashlib
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from geoalchemy2 import shape
from shapely.geometry import mapping
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from ...core.config import settings
from ...core.database import get_session
from ...core.exceptions import BadRequestException, NotFoundException
from ...metrics import CACHE_HITS, CACHE_MISSES, PLOTS_GEO_TOTAL
from ...models import Plot, PlotStatus, Settlement, User, UserRole
from ...schemas import BulkPlotDelete, BulkPlotStatusUpdate, PlotCreate, PlotGeoJSON, PlotListResponse, PlotResponse, PlotStatsResponse, PlotUpdate
from ...services.cadastre import (
    NSPD_WMS_LAYERS,
    batch_enrich,
    enrich_from_cadastre,
    fetch_nspd_wms_tile,
    lookup_cadastre,
)
from ...services.similar import find_similar_plots
from ...utils.plot_helpers import plot_to_response
from ...services.vri import normalize_vri
from ..deps import get_current_user, get_tenant_scope_optional, require_role

import redis.asyncio as aioredis

ALLOWED_SORT_FIELDS = {"created_at", "price", "area_m2", "cadastral_number"}
PLOT_SEARCH_MIN_LENGTH = 2

router = APIRouter(prefix="/plots", tags=["plots"])
logger = logging.getLogger(__name__)

# One map viewport can request many raster tiles at once. Keep the upstream
# NSPD client bounded per worker so a tile burst cannot exhaust threads or
# make ordinary plot requests wait behind remote WMS calls.
_NSPD_WMS_CONCURRENCY = 2
_nspd_wms_semaphore = asyncio.BoundedSemaphore(_NSPD_WMS_CONCURRENCY)


def _parse_uuid(value: str, field_name: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise BadRequestException(f"Invalid {field_name}")


def _normalized_search_query(query: str | None) -> str | None:
    if query is None:
        return None
    term = query.strip()
    return term if len(term) >= PLOT_SEARCH_MIN_LENGTH else None


def _status_values(status: str | None) -> list[str]:
    """Parse the public comma-separated status filter without changing bulk API semantics."""
    if not status:
        return []
    return list(dict.fromkeys(value.strip() for value in status.split(",") if value.strip()))


def _apply_plot_search(stmt, query: str | None):
    term = _normalized_search_query(query)
    if not term:
        return stmt

    like = f"%{term}%"
    return stmt.outerjoin(Settlement, Plot.settlement_id == Settlement.id).where(
        or_(
            Plot.cadastral_number.ilike(like),
            Plot.address.ilike(like),
            Plot.title.ilike(like),
            Settlement.name.ilike(like),
            Settlement.address.ilike(like),
        )
    )


async def _resolve_owned_settlement_id(
    session: AsyncSession,
    settlement_id: str | None,
    tenant_id,
) -> UUID | None:
    if not settlement_id:
        return None

    settlement_uuid = _parse_uuid(settlement_id, "settlement_id")
    result = await session.execute(
        select(Settlement.id).where(
            Settlement.id == settlement_uuid,
            Settlement.tenant_id == tenant_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundException("Settlement not found")
    return settlement_uuid


def _apply_settlement_boundary_scope(stmt, settlement_id: str | UUID, tenant_id: UUID):
    """Restrict plots to parcels fully covered by the selected settlement boundary."""
    settlement_uuid = settlement_id if isinstance(settlement_id, UUID) else _parse_uuid(settlement_id, "settlement_id")
    boundary = aliased(Settlement, name="boundary")
    return stmt.join(
        boundary,
        and_(
            boundary.id == settlement_uuid,
            boundary.tenant_id == tenant_id,
        ),
    ).where(
        boundary.geometry.isnot(None),
        Plot.geometry.isnot(None),
        func.ST_CoveredBy(Plot.geometry, boundary.geometry),
    )


@router.get("", response_model=PlotListResponse)
async def list_plots(
    query: str | None = Query(None),
    settlement_id: str | None = None,
    status: str | None = None,
    permitted_use: str | None = None,
    category: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    area_min: float | None = None,
    area_max: float | None = None,
    region: str | None = None,
    district: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    include_geometry: bool = Query(default=True),
    sort_by: str = "created_at",
    sort_order: str = "desc",
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
):
    if tenant_id is None:
        return PlotListResponse(items=[], total=0, page=page, page_size=page_size)

    stmt = select(Plot).where(Plot.is_active, Plot.tenant_id == tenant_id)

    if settlement_id:
        stmt = _apply_settlement_boundary_scope(stmt, settlement_id, tenant_id)
    stmt = _apply_plot_search(stmt, query)
    status_values = _status_values(status)
    if status_values:
        stmt = stmt.where(Plot.status.in_(status_values))
    if permitted_use:
        stmt = stmt.where(Plot.permitted_use.ilike(f"%{permitted_use}%"))
    if category:
        stmt = stmt.where(Plot.category.ilike(f"%{category}%"))
    if price_min is not None:
        stmt = stmt.where(Plot.price >= price_min)
    if price_max is not None:
        stmt = stmt.where(Plot.price <= price_max)
    if area_min is not None:
        stmt = stmt.where(Plot.area_m2 >= area_min)
    if area_max is not None:
        stmt = stmt.where(Plot.area_m2 <= area_max)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar() or 0

    if sort_by not in ALLOWED_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(Plot, sort_by, Plot.created_at)
    order_fn = sort_col.desc() if sort_order == "desc" else sort_col.asc()
    stmt = stmt.order_by(order_fn).offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(stmt.options(selectinload(Plot.settlement)))
    plots = result.scalars().all()

    return PlotListResponse(
        items=[plot_to_response(p, include_geometry=include_geometry) for p in plots],
        total=total,
        page=page,
        page_size=page_size,
    )


def _cache_key(prefix: str, **kwargs) -> str:
    raw = json.dumps(kwargs, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    tenant_part = str(kwargs.get("tenant_id") or "none")
    return f"landsearch:{prefix}:{tenant_part}:{h}"


async def _invalidate_plot_map_cache(tenant_id: UUID) -> None:
    cache = await _get_redis()
    if not cache:
        return

    patterns = (
        f"landsearch:plots:geo:{tenant_id}:*",
        f"landsearch:tiles:{tenant_id}:*",
    )
    try:
        keys = []
        for pattern in patterns:
            async for key in cache.scan_iter(match=pattern, count=500):
                keys.append(key)
        if keys:
            await cache.delete(*keys)
    except Exception:
        # Cache invalidation must never turn a successful status update into a 500.
        return


async def _get_redis():
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await r.ping()
        return r
    except Exception:
        return None


@router.get("/geo", response_model=PlotGeoJSON)
async def plots_geojson(
    bbox: str | None = Query(None, description="min_lng,min_lat,max_lng,max_lat"),
    query: str | None = None,
    settlement_id: str | None = None,
    status: str | None = None,
    permitted_use: str | None = None,
    category: str | None = None,
    cad_unit: str | None = None,
    region: str | None = None,
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
):
    cache = await _get_redis()
    cache_key = _cache_key(
        "plots:geo",
        boundary_scope="covered-v1",
        tenant_id=tenant_id,
        bbox=bbox,
        query=query,
        settlement_id=settlement_id,
        status=status,
        permitted_use=permitted_use,
        category=category,
        cad_unit=cad_unit,
    )

    if cache:
        try:
            cached = await cache.get(cache_key)
            if cached:
                CACHE_HITS.labels(cache_type="redis").inc()
                return PlotGeoJSON(**json.loads(cached))
        except Exception:
            pass
    CACHE_MISSES.labels(cache_type="redis").inc()

    if tenant_id is None:
        return PlotGeoJSON(type="FeatureCollection", features=[])

    stmt = select(Plot).where(
        Plot.is_active,
        Plot.geometry.isnot(None),
        Plot.tenant_id == tenant_id,
    )

    if settlement_id:
        stmt = _apply_settlement_boundary_scope(stmt, settlement_id, tenant_id)

    stmt = _apply_plot_search(stmt, query)

    if bbox:
        try:
            parts = [float(x.strip()) for x in bbox.split(",")]
            if len(parts) == 4:
                min_lng, min_lat, max_lng, max_lat = parts
                bbox_geom = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
                stmt = stmt.where(func.ST_Intersects(Plot.geometry, bbox_geom))
        except (ValueError, IndexError):
            pass

    status_values = _status_values(status)
    if status_values:
        stmt = stmt.where(Plot.status.in_(status_values))
    if permitted_use:
        stmt = stmt.where(Plot.permitted_use.ilike(f"%{permitted_use}%"))
    if category:
        stmt = stmt.where(Plot.category.ilike(f"%{category}%"))
    if cad_unit:
        stmt = stmt.where(Plot.cad_unit.like(f"{cad_unit}%"))

    stmt = stmt.limit(5000)

    result = await session.execute(stmt)
    plots = result.scalars().all()

    features = []
    for p in plots:
        geom = None
        center_lng, center_lat = None, None
        if p.geometry:
            try:
                s = shape.to_shape(p.geometry)
                geom = mapping(s)
                centroid = s.centroid
                center_lng, center_lat = centroid.x, centroid.y
            except Exception:
                continue
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": str(p.id),
                "cadastral_number": p.cadastral_number,
                "settlement_id": str(p.settlement_id) if p.settlement_id else None,
                "price": p.price,
                "price_per_hectare": p.price_per_hectare,
                "area_m2": p.area_m2,
                "address": p.address,
                "permitted_use": p.permitted_use,
                "center_lng": center_lng,
                "center_lat": center_lat,
                "status": p.status.value if isinstance(p.status, PlotStatus) else p.status,
                "title": p.title,
                "description": p.description,
                "object_type": p.object_type,
                "land_plot_type": p.land_plot_type,
                "registration_date": p.registration_date,
                "ownership_form": p.ownership_form,
                "cad_unit": p.cad_unit,
                "category": p.category,
                "cadastral_value": p.cadastral_value,
                "vri_code": normalize_vri(p.permitted_use),
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}

    PLOTS_GEO_TOTAL.set(len(features))

    if cache:
        try:
            await cache.setex(cache_key, 300, json.dumps(geojson, default=str))
        except Exception:
            pass

    return PlotGeoJSON(**geojson)


@router.get("/lookup")
async def lookup_plot_data(
    cadastral_number: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    data = await lookup_cadastre(cadastral_number.strip())
    if data is None:
        raise NotFoundException("Кадастровый номер не найден в ЕГРН/Росреестр")
    return data


@router.post("/batch-enrich")
async def batch_enrich_plots(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    enriched = await batch_enrich(session, str(current_user.tenant_id))
    return {"enriched": enriched}


@router.get("/tiles/{z}/{x}/{y}.mvt")
async def plot_tiles(
    z: int,
    x: int,
    y: int,
    query: str | None = None,
    settlement_id: str | None = None,
    status: str | None = None,
    permitted_use: str | None = None,
    category: str | None = None,
    cad_unit: str | None = None,
    region: str | None = None,
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
):
    """MVT vector tiles for map rendering."""
    from fastapi.responses import Response

    cache = await _get_redis()
    tenant_cache_part = str(tenant_id) if tenant_id else "none"
    normalized_query = _normalized_search_query(query)
    settlement_uuid = _parse_uuid(settlement_id, "settlement_id") if settlement_id else None
    cache_key = (
        f"landsearch:tiles:{tenant_cache_part}:boundary-covered-v3:{z}/{x}/{y}:"
        f"{normalized_query or ''}:{settlement_uuid or ''}:{status or ''}:{permitted_use or ''}:{category or ''}:{cad_unit or ''}:{region or ''}"
    )

    if cache:
        try:
            cached = await cache.get(cache_key)
            if cached:
                CACHE_HITS.labels(cache_type="redis").inc()
                return Response(content=cached, media_type="application/vnd.mapbox-vector-tile")
        except Exception:
            pass
    CACHE_MISSES.labels(cache_type="redis").inc()

    where_clauses = ["p.geometry IS NOT NULL", "p.is_active = true",
                     "ST_Intersects(ST_Transform(p.geometry, 3857), ST_TileEnvelope(:z, :x, :y))"]
    params = {"z": z, "x": x, "y": y, "tenant_id": tenant_id}
    if tenant_id is None:
        where_clauses.append("false")
    else:
        where_clauses.append("p.tenant_id = :tenant_id")
    boundary_join = ""
    if settlement_uuid:
        boundary_join = """
        JOIN settlements boundary
          ON boundary.id = :settlement_id
         AND boundary.tenant_id = :tenant_id
         AND boundary.geometry IS NOT NULL
        """
        where_clauses.append("ST_CoveredBy(p.geometry, boundary.geometry)")
        params["settlement_id"] = settlement_uuid
    status_values = _status_values(status)
    if len(status_values) == 1:
        where_clauses.append("p.status = :status")
        params["status"] = status_values[0]
    elif status_values:
        status_params = []
        for index, status_value in enumerate(status_values):
            param_name = f"status_{index}"
            status_params.append(f":{param_name}")
            params[param_name] = status_value
        where_clauses.append(f"p.status IN ({', '.join(status_params)})")
    if permitted_use:
        where_clauses.append("p.permitted_use ILIKE :permitted_use")
        params["permitted_use"] = f"%{permitted_use}%"
    if category:
        where_clauses.append("p.category ILIKE :category")
        params["category"] = f"%{category}%"
    if cad_unit:
        where_clauses.append("p.cad_unit LIKE :cad_unit")
        params["cad_unit"] = f"{cad_unit}%"
    normalized_region = region.strip() if region else None
    if normalized_region:
        # NSPD's cadastral zone prefix is the reliable region key. Settlement
        # metadata remains a fallback for imported records with non-standard numbers.
        where_clauses.append("(p.cadastral_number LIKE '16:%' OR s.region = :region)")
        params["region"] = normalized_region
    if normalized_query:
        where_clauses.append(
            "(p.cadastral_number ILIKE :query OR p.address ILIKE :query "
            "OR p.title ILIKE :query OR s.name ILIKE :query OR s.address ILIKE :query)"
        )
        params["query"] = f"%{normalized_query}%"

    vri_case = """
        CASE
            WHEN p.permitted_use ILIKE '%ижс%' OR p.permitted_use ILIKE '%индивидуального жилищного%'
                OR p.permitted_use ILIKE '%индивидуальное жилищное%' OR p.permitted_use ILIKE '%индивидуальный жилой%' THEN 'ИЖС'
            WHEN p.permitted_use ILIKE '%лпх%' OR p.permitted_use ILIKE '%личного подсобного%'
                OR p.permitted_use ILIKE '%личное подсобное%' OR p.permitted_use ILIKE '%приусадебн%'
                OR p.permitted_use ILIKE '%подсобного хозяйства%' THEN 'ЛПХ'
            WHEN p.permitted_use ILIKE '%снт%' OR p.permitted_use ILIKE '%садоводств%'
                OR p.permitted_use ILIKE '%садов%' THEN 'СНТ'
            WHEN p.permitted_use ILIKE '%огород%' THEN 'ОГОРОД'
            WHEN p.permitted_use ILIKE '%днп%' OR p.permitted_use ILIKE '%дачн%' THEN 'ДНП'
            WHEN p.permitted_use ILIKE '%многоквартирн%' OR p.permitted_use ILIKE '%среднеэтажн%'
                OR p.permitted_use ILIKE '%малоэтажн%' OR p.permitted_use ILIKE '%блокированн%'
                OR p.permitted_use ILIKE '%жилищное строительств%' THEN 'ЖИЛОЙ'
            WHEN p.permitted_use ILIKE '%общего пользования%' OR p.permitted_use ILIKE '%благоустройство территории%' THEN 'ОГП'
            WHEN p.permitted_use ILIKE '%гараж%' OR p.permitted_use ILIKE '%стоянк%'
                OR p.permitted_use ILIKE '%хранение автотранспорт%' THEN 'ГАРАЖ'
            WHEN p.permitted_use ILIKE '%транспорт%' OR p.permitted_use ILIKE '%автомобиль%'
                OR p.permitted_use ILIKE '%автодорог%' OR p.permitted_use ILIKE '%дорожн%'
                OR p.permitted_use ILIKE '%дорог%' THEN 'ТРАНСПОРТ'
            WHEN p.permitted_use ILIKE '%торгов%' OR p.permitted_use ILIKE '%магазин%'
                OR p.permitted_use ILIKE '%общественного питания%' OR p.permitted_use ILIKE '%предпринимат%'
                OR p.permitted_use ILIKE '%делов%' OR p.permitted_use ILIKE '%банк%'
                OR p.permitted_use ILIKE '%гостинич%' OR p.permitted_use ILIKE '%офис%'
                OR p.permitted_use ILIKE '%рынок%' OR p.permitted_use ILIKE '%развлечен%'
                OR p.permitted_use ILIKE '%бытовое обслуживание%' OR p.permitted_use ILIKE '%сервис%' THEN 'КОМ'
            WHEN p.permitted_use ILIKE '%склад%' THEN 'СКЛАД'
            WHEN p.permitted_use ILIKE '%промышлен%' OR p.permitted_use ILIKE '%производствен%'
                OR p.permitted_use ILIKE '%недропользован%' THEN 'ПРОМ'
            WHEN p.permitted_use ILIKE '%коммунальн%' OR p.permitted_use ILIKE '%энергетик%'
                OR p.permitted_use ILIKE '%электро%' OR p.permitted_use ILIKE '%инженерн%'
                OR p.permitted_use ILIKE '%газоснабж%' OR p.permitted_use ILIKE '%водоснабж%'
                OR p.permitted_use ILIKE '%теплоснабж%' THEN 'КОММУН'
            WHEN p.permitted_use ILIKE '%связь%' THEN 'СВЯЗЬ'
            WHEN p.permitted_use ILIKE '%сельскохозяйствен%' OR p.permitted_use ILIKE '%животноводств%'
                OR p.permitted_use ILIKE '%растениеводств%' OR p.permitted_use ILIKE '%выращивани%'
                OR p.permitted_use ILIKE '%сенокош%' OR p.permitted_use ILIKE '%выпас%'
                OR p.permitted_use ILIKE '%фермерск%' OR p.permitted_use ILIKE '%кфх%' THEN 'СХ'
            WHEN p.permitted_use ILIKE '%спорт%' OR p.permitted_use ILIKE '%физкультур%' THEN 'СПОРТ'
            WHEN p.permitted_use ILIKE '%отдых%' OR p.permitted_use ILIKE '%рекреац%'
                OR p.permitted_use ILIKE '%турист%' OR p.permitted_use ILIKE '%санатор%' THEN 'ОТДЫХ'
            WHEN p.permitted_use ILIKE '%ритуальн%' OR p.permitted_use ILIKE '%кладбищ%' THEN 'РИТУАЛ'
            WHEN p.permitted_use ILIKE '%социальн%' OR p.permitted_use ILIKE '%образован%'
                OR p.permitted_use ILIKE '%здравоохранен%' OR p.permitted_use ILIKE '%больниц%'
                OR p.permitted_use ILIKE '%медицин%' OR p.permitted_use ILIKE '%культур%'
                OR p.permitted_use ILIKE '%библиотек%' THEN 'СОЦИАЛЬНЫЙ'
            WHEN p.permitted_use ILIKE '%лесн%' THEN 'ЛЕСНОЙ'
            WHEN p.permitted_use ILIKE '%водн%' OR p.permitted_use ILIKE '%гидротехн%' THEN 'ВОДНЫЙ'
            WHEN p.permitted_use ILIKE '%оборон%' OR p.permitted_use ILIKE '%безопасность%' THEN 'ОБОРОНА'
            WHEN p.permitted_use ILIKE '%специальн%' THEN 'СПЕЦИАЛЬНЫЙ'
            WHEN p.permitted_use ILIKE '%запас%' THEN 'ЗАПАС'
            WHEN p.permitted_use ILIKE '%пустыр%' OR p.permitted_use IS NULL OR p.permitted_use = '' THEN 'ПУСТЫРЬ'
            ELSE 'ДРУГОЕ'
        END
    """

    sql = f"""
    SELECT ST_AsMVT(mvt, 'plots', 4096, 'mvtgeom')
    FROM (
        SELECT
            ST_AsMVTGeom(ST_Transform(p.geometry, 3857), ST_TileEnvelope(:z, :x, :y), 4096, 256, true) AS mvtgeom,
            p.id::text AS id,
            p.cadastral_number AS cad_num,
            regexp_replace(p.cadastral_number, '^.*:', '') AS cad_num_short,
            p.status::text AS status,
            p.price AS price,
            p.area_m2 AS area,
            p.permitted_use AS use,
            {vri_case} AS vri_code,
            p.object_type AS obj_type,
            p.cad_unit AS cad_unit,
            p.category AS category,
            p.cadastral_value AS cad_value,
            p.settlement_id::text AS settlement_id
        FROM plots p
        {boundary_join}
        LEFT JOIN settlements s ON p.settlement_id = s.id
        WHERE {' AND '.join(where_clauses)}
    ) AS mvt
    """

    result = await session.execute(text(sql), params)
    mvt_data = result.scalar() or b""

    if cache and mvt_data:
        try:
            await cache.setex(cache_key, 600, mvt_data)
        except Exception:
            pass

    return Response(
        content=mvt_data,
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/tiles/nspd/{layer_id}/{z}/{x}/{y}.png")
async def nspd_cadastre_tile(layer_id: int, z: int, x: int, y: int):
    """Proxy official NSPD polygon WMS tiles for the regional map overlay."""
    from fastapi.responses import Response

    if layer_id not in NSPD_WMS_LAYERS:
        raise BadRequestException("Unsupported NSPD cadastral layer")

    cache = await _get_redis()
    cache_key = f"landsearch:nspd:wms:{layer_id}:{z}:{x}:{y}:v1"
    try:
        if cache:
            try:
                cached = await cache.get(cache_key)
                if cached:
                    return Response(
                        content=base64.b64decode(cached),
                        media_type="image/png",
                        headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=600"},
                    )
            except Exception:
                pass

        async with _nspd_wms_semaphore:
            tile = await asyncio.to_thread(fetch_nspd_wms_tile, layer_id, z, x, y)

        if cache:
            try:
                await cache.setex(cache_key, 600, base64.b64encode(tile).decode("ascii"))
            except Exception:
                pass

        return Response(
            content=tile,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=600"},
        )
    except ValueError as exc:
        raise BadRequestException(str(exc)) from exc
    except Exception as exc:
        logger.warning("NSPD WMS tile failed layer=%s z=%s x=%s y=%s: %s", layer_id, z, x, y, exc)
        raise BadRequestException("NSPD cadastral layer is temporarily unavailable") from exc
    finally:
        if cache:
            try:
                await cache.aclose()
            except Exception:
                pass


@router.get("/stats", response_model=PlotStatsResponse)
async def plot_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    filters = (Plot.tenant_id == current_user.tenant_id, Plot.is_active)

    totals_result = await session.execute(
        select(
            func.count(Plot.id),
            func.coalesce(func.sum(Plot.area_m2), 0),
            func.coalesce(func.sum(Plot.price), 0),
        ).where(*filters)
    )
    total, total_area_m2, total_price = totals_result.one()

    status_result = await session.execute(
        select(Plot.status, func.count(Plot.id))
        .where(*filters)
        .group_by(Plot.status)
    )
    by_status = {
        status.value if isinstance(status, PlotStatus) else str(status): count
        for status, count in status_result.all()
    }
    for status in PlotStatus:
        by_status.setdefault(status.value, 0)

    quality_result = await session.execute(
        select(
            func.count(Plot.id).filter(Plot.geometry.is_(None)),
            func.count(Plot.id).filter(Plot.price.is_(None)),
            func.count(Plot.id).filter(Plot.area_m2.is_(None)),
            func.count(Plot.id).filter(Plot.category.is_(None)),
        ).where(*filters)
    )
    missing_geometry, missing_price, missing_area, missing_category = quality_result.one()

    total_area_m2 = float(total_area_m2 or 0)
    total_price = float(total_price or 0)

    return PlotStatsResponse(
        total=total,
        by_status=by_status,
        total_area_m2=total_area_m2,
        total_area_ha=total_area_m2 / 10000,
        total_price=total_price,
        avg_price_per_m2=total_price / total_area_m2 if total_area_m2 else None,
        data_quality={
            "missing_geometry": missing_geometry,
            "missing_price": missing_price,
            "missing_area": missing_area,
            "missing_category": missing_category,
        },
    )


@router.get("/{plot_id}", response_model=PlotResponse)
async def get_plot(
    plot_id: str,
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
):
    if tenant_id is None:
        raise NotFoundException("Plot not found")
    result = await session.execute(
        select(Plot).where(
            Plot.id == _parse_uuid(plot_id, "plot_id"),
            Plot.tenant_id == tenant_id,
            Plot.is_active,
        )
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise NotFoundException("Plot not found")
    return plot_to_response(plot)


@router.post("/{plot_id}/enrich", response_model=PlotResponse)
async def enrich_plot(
    plot_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await session.execute(
            select(Plot).where(
                Plot.id == UUID(plot_id),
                Plot.tenant_id == current_user.tenant_id,
                Plot.is_active,
            )
        )
    except ValueError:
        raise BadRequestException("Invalid plot_id")
    plot = result.scalar_one_or_none()
    if not plot:
        raise NotFoundException("Plot not found")

    ok = await enrich_from_cadastre(session, plot)
    if ok:
        await session.commit()
        await session.refresh(plot)
    return plot_to_response(plot)


@router.get("/{plot_id}/similar", response_model=list[PlotResponse])
async def similar_plots(
    plot_id: str,
    session: AsyncSession = Depends(get_session),
    tenant_id: UUID | None = Depends(get_tenant_scope_optional),
):
    if tenant_id is None:
        return []
    results = await find_similar_plots(
        session,
        _parse_uuid(plot_id, "plot_id"),
        tenant_id=tenant_id,
    )
    return [plot_to_response(p) for p in results]


@router.post("", response_model=PlotResponse, status_code=201)
async def create_plot(
    body: PlotCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    settlement_id = await _resolve_owned_settlement_id(
        session,
        body.settlement_id,
        current_user.tenant_id,
    )
    plot = Plot(
        tenant_id=current_user.tenant_id,
        cadastral_number=body.cadastral_number,
        address=body.address,
        area_m2=body.area_m2,
        category=body.category,
        permitted_use=body.permitted_use,
        cadastral_value=body.cadastral_value,
        cad_unit=body.cad_unit,
        object_type=body.object_type,
        land_plot_type=body.land_plot_type,
        registration_date=body.registration_date,
        ownership_form=body.ownership_form,
        price=body.price,
        status=body.status,
        title=body.title,
        description=body.description,
        settlement_id=settlement_id,
    )
    if body.area_m2 and body.price:
        plot.price_per_hectare = body.price / (body.area_m2 / 10000)

    session.add(plot)
    await session.flush()

    await session.commit()
    await session.refresh(plot)
    return plot_to_response(plot)


@router.patch("/{plot_id}", response_model=PlotResponse)
async def update_plot(
    plot_id: str,
    body: PlotUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Plot).where(
            Plot.id == _parse_uuid(plot_id, "plot_id"),
            Plot.tenant_id == current_user.tenant_id,
        )
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise NotFoundException("Plot not found")

    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data:
        new_status = update_data["status"]
        new_status_value = new_status.value if isinstance(new_status, PlotStatus) else new_status
    else:
        new_status_value = None
    current_status_value = plot.status.value if isinstance(plot.status, PlotStatus) else plot.status
    if new_status_value is not None and new_status_value != current_status_value:
        from ...models import PlotStatusHistory
        history = PlotStatusHistory(
            plot_id=plot.id,
            old_status=current_status_value,
            new_status=new_status_value,
            changed_by=current_user.id,
        )
        session.add(history)

    for key, value in update_data.items():
        setattr(plot, key, value)

    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)

    await session.commit()
    if "status" in update_data:
        await _invalidate_plot_map_cache(current_user.tenant_id)
    await session.refresh(plot)
    return plot_to_response(plot)


@router.patch("/bulk/status")
async def bulk_update_plot_status(
    body: BulkPlotStatusUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    if body.all_plots:
        stmt = select(Plot).where(
            Plot.tenant_id == current_user.tenant_id,
            Plot.is_active,
        )
        stmt = _apply_plot_search(stmt, body.query)
    else:
        parsed_plot_ids = [_parse_uuid(plot_id, "plot_id") for plot_id in body.plot_ids or []]
        stmt = select(Plot).where(
            Plot.id.in_(parsed_plot_ids),
            Plot.tenant_id == current_user.tenant_id,
            Plot.is_active,
        )

    if body.filter_status is not None:
        stmt = stmt.where(Plot.status == body.filter_status)

    result = await session.execute(stmt)
    plots = result.scalars().all()
    status_value = body.status.value
    changed = 0

    from ...models import PlotStatusHistory

    for plot in plots:
        current_status_value = plot.status.value if isinstance(plot.status, PlotStatus) else plot.status
        if current_status_value == status_value:
            continue
        session.add(PlotStatusHistory(
            plot_id=plot.id,
            old_status=current_status_value,
            new_status=status_value,
            changed_by=current_user.id,
        ))
        plot.status = body.status
        changed += 1

    await session.commit()
    if changed:
        await _invalidate_plot_map_cache(current_user.tenant_id)
    return {"updated": changed, "status": status_value}


@router.delete("/bulk", status_code=200)
async def bulk_delete_plots(
    body: BulkPlotDelete,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    if body.all_plots:
        stmt = select(Plot).where(
            Plot.tenant_id == current_user.tenant_id,
            Plot.is_active,
        )
        stmt = _apply_plot_search(stmt, body.query)
    else:
        parsed_plot_ids = [_parse_uuid(plot_id, "plot_id") for plot_id in body.plot_ids or []]
        stmt = select(Plot).where(
            Plot.id.in_(parsed_plot_ids),
            Plot.tenant_id == current_user.tenant_id,
            Plot.is_active,
        )

    if body.filter_status is not None:
        stmt = stmt.where(Plot.status == body.filter_status)

    result = await session.execute(stmt)
    plots = result.scalars().all()
    for plot in plots:
        plot.is_active = False
    await session.commit()
    if plots:
        await _invalidate_plot_map_cache(current_user.tenant_id)
    return {"deleted": len(plots)}


@router.delete("/{plot_id}", status_code=204)
async def delete_plot(
    plot_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Plot).where(
            Plot.id == _parse_uuid(plot_id, "plot_id"),
            Plot.tenant_id == current_user.tenant_id,
        )
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise NotFoundException("Plot not found")
    plot.is_active = False
    await session.commit()
