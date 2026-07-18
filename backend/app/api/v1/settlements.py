import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import shape
from geoalchemy2.elements import WKTElement
from shapely.geometry import mapping, shape as shapely_shape
from shapely.validation import make_valid
from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import Plot, Settlement
from ...models import User, UserRole
from ...schemas import SettlementBulkCreate, SettlementBoundaryPreview, SettlementBoundaryUpdate, SettlementResponse
from ...utils.plot_helpers import plot_to_response
from ...services.analysis import analyze_settlement
from ...services.boundary_coverage import boundary_covers_majority
from ...services.cadastre import import_landplots_in_contour
from ..deps import get_tenant_scope_optional, require_role
from .plots import _invalidate_plot_map_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settlements", tags=["settlements"])


def _settlement_plot_scope(settlement_id, tenant_id):
    """Return plots fully or mostly covered by the settlement boundary."""
    return select(Plot).join(
        Settlement,
        and_(Settlement.id == settlement_id, Settlement.tenant_id == tenant_id),
    ).where(
        Plot.tenant_id == tenant_id,
        Plot.is_active,
        Plot.geometry.isnot(None),
        Settlement.geometry.isnot(None),
        boundary_covers_majority(Plot.geometry, Settlement.geometry),
    )


def _validate_boundary_geometry(payload: SettlementBoundaryUpdate):
    if payload.mode == "clear":
        return None
    if payload.mode == "radius" and payload.radius_m == 0:
        return None
    if not payload.geometry:
        raise HTTPException(status_code=422, detail="Boundary geometry is required")
    try:
        geometry = shapely_shape(payload.geometry)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid boundary geometry") from exc
    if geometry.geom_type not in {"Polygon", "MultiPolygon"} or geometry.is_empty:
        raise HTTPException(status_code=422, detail="Boundary must be a non-empty polygon")
    if not geometry.is_valid:
        geometry = make_valid(geometry)
    if geometry.geom_type not in {"Polygon", "MultiPolygon"} or geometry.is_empty:
        raise HTTPException(status_code=422, detail="Boundary geometry is invalid")
    min_lng, min_lat, max_lng, max_lat = geometry.bounds
    if min_lng < -180 or max_lng > 180 or min_lat < -90 or max_lat > 90:
        raise HTTPException(status_code=422, detail="Boundary coordinates must use WGS84 longitude/latitude")
    return geometry


async def _boundary_summary(session: AsyncSession, tenant_id, geometry) -> dict:
    if geometry is None:
        return {
            "plot_count": 0,
            "by_status": _empty_boundary_status_counts(),
            "total_area_m2": 0.0,
            "total_price": 0.0,
        }

    boundary = WKTElement(geometry.wkt, srid=4326)
    stmt = select(
        Plot.status,
        func.count(Plot.id),
        func.coalesce(func.sum(Plot.area_m2), 0),
        func.coalesce(func.sum(Plot.price), 0),
    ).where(
        Plot.tenant_id == tenant_id,
        Plot.is_active,
        Plot.geometry.isnot(None),
        boundary_covers_majority(Plot.geometry, boundary),
    ).group_by(Plot.status)
    result = await session.execute(stmt)
    by_status = _empty_boundary_status_counts()
    total_area_m2 = 0.0
    total_price = 0.0
    for status, count, area_m2, price in result.all():
        by_status[status.value if hasattr(status, "value") else str(status)] = count
        total_area_m2 += float(area_m2 or 0)
        total_price += float(price or 0)
    return {
        "plot_count": sum(by_status.values()),
        "by_status": by_status,
        "total_area_m2": total_area_m2,
        "total_price": total_price,
    }


async def _boundary_stats(session: AsyncSession, tenant_id, geometry) -> dict:
    summary = await _boundary_summary(session, tenant_id, geometry)
    return {"plot_count": summary["plot_count"], "by_status": summary["by_status"]}


async def _link_unassigned_nspd_plots_to_settlement(session: AsyncSession, tenant_id, settlement_id, geometry) -> int:
    """Attach unassigned NSPD plots fully or mostly inside a saved boundary."""
    if geometry is None:
        return 0
    boundary = WKTElement(geometry.wkt, srid=4326)
    result = await session.execute(
        update(Plot)
        .where(
            Plot.tenant_id == tenant_id,
            Plot.is_active,
            Plot.geometry.isnot(None),
            Plot.settlement_id.is_(None),
            boundary_covers_majority(Plot.geometry, boundary),
        )
        .values(settlement_id=settlement_id)
    )
    return result.rowcount or 0


async def _unlink_nspd_plots_outside_settlement_boundary(
    session: AsyncSession,
    tenant_id,
    settlement_id,
    geometry,
) -> int:
    """Remove NSPD assignments that are not mostly covered by the saved boundary."""
    if geometry is None:
        return 0
    boundary = WKTElement(geometry.wkt, srid=4326)
    result = await session.execute(
        update(Plot)
        .where(
            Plot.tenant_id == tenant_id,
            Plot.settlement_id == settlement_id,
            Plot.imported_from == "nspd",
            or_(
                Plot.geometry.is_(None),
                ~boundary_covers_majority(Plot.geometry, boundary),
            ),
        )
        .values(settlement_id=None)
    )
    return result.rowcount or 0


async def _get_owned_settlement(session: AsyncSession, settlement_id: str, tenant_id):
    result = await session.execute(select(Settlement).where(Settlement.id == settlement_id, Settlement.tenant_id == tenant_id))
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    return settlement


def _empty_boundary_status_counts() -> dict[str, int]:
    return {status: 0 for status in Plot.__table__.c.status.type.enums}


@router.get("", response_model=list[SettlementResponse])
async def list_settlements(
    region: str | None = None,
    district: str | None = None,
    session: AsyncSession = Depends(get_session),
    tenant_id = Depends(get_tenant_scope_optional),
):
    if tenant_id is None:
        return []
    stmt = select(Settlement).where(Settlement.tenant_id == tenant_id)
    if region:
        stmt = stmt.where(Settlement.region == region)
    if district:
        stmt = stmt.where(Settlement.district == district)
    result = await session.execute(stmt)
    settlements = result.scalars().all()
    return [
        SettlementResponse(
            id=str(s.id),
            tenant_id=str(s.tenant_id),
            name=s.name,
            description=s.description,
            address=s.address,
            region=s.region,
            district=s.district,
            created_at=s.created_at,
        )
        for s in settlements
    ]


@router.post("/bulk")
async def bulk_create_settlements(
    body: SettlementBulkCreate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    """Import a catalog of settlements without creating tenant duplicates."""
    names = list({item.name for item in body.items})
    existing_result = await session.execute(
        select(Settlement).where(
            Settlement.tenant_id == current_user.tenant_id,
            Settlement.name.in_(names),
        )
    )
    existing_keys = {
        (settlement.name.casefold(), (settlement.district or "").casefold())
        for settlement in existing_result.scalars().all()
    }
    created: list[Settlement] = []
    skipped = 0

    for item in body.items:
        key = (item.name.casefold(), (item.district or "").casefold())
        if key in existing_keys:
            skipped += 1
            continue
        settlement = Settlement(
            tenant_id=current_user.tenant_id,
            name=item.name,
            description=item.description,
            address=item.address,
            region=item.region,
            district=item.district,
        )
        session.add(settlement)
        created.append(settlement)
        existing_keys.add(key)

    await session.commit()
    for settlement in created:
        await session.refresh(settlement)

    return {
        "created": len(created),
        "skipped": skipped,
        "items": [
            SettlementResponse(
                id=str(settlement.id),
                tenant_id=str(settlement.tenant_id),
                name=settlement.name,
                description=settlement.description,
                address=settlement.address,
                region=settlement.region,
                district=settlement.district,
                created_at=settlement.created_at,
            )
            for settlement in created
        ],
    }


@router.get("/{settlement_id}")
async def get_settlement(
    settlement_id: str,
    include_plots: bool = Query(default=True),
    session: AsyncSession = Depends(get_session),
    tenant_id = Depends(get_tenant_scope_optional),
):
    if tenant_id is None:
        raise HTTPException(status_code=404, detail="Settlement not found")
    result = await session.execute(
        select(Settlement).where(
            Settlement.id == settlement_id,
            Settlement.tenant_id == tenant_id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")

    geom = None
    boundary_shape = None
    if s.geometry:
        try:
            boundary_shape = shape.to_shape(s.geometry)
            geom = mapping(boundary_shape)
        except Exception:
            pass

    summary = await _boundary_summary(session, tenant_id, boundary_shape)
    plots = []
    if include_plots:
        plots_result = await session.execute(_settlement_plot_scope(s.id, tenant_id))
        plots = plots_result.scalars().all()

    total_plots = summary["plot_count"]
    by_status = summary["by_status"]
    total_area = summary["total_area_m2"]
    total_price = summary["total_price"]

    return {
        "id": str(s.id),
        "name": s.name,
        "description": s.description,
        "address": s.address,
        "region": s.region,
        "district": s.district,
        "geometry": geom,
        "boundary_source": s.boundary_source,
        "boundary_radius_m": s.boundary_radius_m,
        "boundary_updated_at": s.boundary_updated_at,
        "stats": {
            "total_plots": total_plots,
            "free_plots": by_status.get("free", 0),
            "reserved_plots": by_status.get("reserved", 0),
            "booked_plots": by_status.get("booked", 0),
            "sold_plots": by_status.get("sold", 0),
            "total_area_ha": round(total_area / 10000, 2) if total_area else 0,
            "total_price": total_price,
            "avg_price_per_ha": round(total_price / (total_area / 10000), 0) if total_area else 0,
        },
        "plots": [plot_to_response(p) for p in plots] if include_plots else [],
        "created_at": s.created_at,
    }


@router.post("/{settlement_id}/boundary/preview", response_model=SettlementBoundaryPreview)
async def preview_settlement_boundary(
    settlement_id: str,
    body: SettlementBoundaryUpdate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    await _get_owned_settlement(session, settlement_id, current_user.tenant_id)
    geometry = _validate_boundary_geometry(body)
    return await _boundary_stats(session, current_user.tenant_id, geometry)


@router.patch("/{settlement_id}/boundary")
async def update_settlement_boundary(
    settlement_id: str,
    body: SettlementBoundaryUpdate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    settlement = await _get_owned_settlement(session, settlement_id, current_user.tenant_id)
    geometry = _validate_boundary_geometry(body)
    stats = await _boundary_stats(session, current_user.tenant_id, geometry)

    settlement.geometry = WKTElement(geometry.wkt, srid=4326) if geometry is not None else None
    settlement.boundary_source = "manual_radius" if body.mode == "radius" else "manual_polygon" if body.mode == "polygon" else None
    settlement.boundary_radius_m = body.radius_m if body.mode == "radius" else None
    settlement.boundary_updated_at = datetime.now(timezone.utc)
    unlinked_plot_count = await _unlink_nspd_plots_outside_settlement_boundary(
        session, current_user.tenant_id, settlement.id, geometry
    )
    linked_plot_count = await _link_unassigned_nspd_plots_to_settlement(
        session, current_user.tenant_id, settlement.id, geometry
    )
    await session.commit()
    await session.refresh(settlement)
    await _invalidate_plot_map_cache(current_user.tenant_id)

    return {
        "settlement_id": str(settlement.id),
        "geometry": mapping(geometry) if geometry is not None else None,
        "boundary_source": settlement.boundary_source,
        "boundary_radius_m": settlement.boundary_radius_m,
        "boundary_updated_at": settlement.boundary_updated_at,
        **stats,
        "linked_plot_count": linked_plot_count,
        "unlinked_plot_count": unlinked_plot_count,
    }


@router.post("/{settlement_id}/nspd-import")
async def import_settlement_nspd_plots(
    settlement_id: str,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    locked = (await session.execute(
        text("SELECT pg_try_advisory_xact_lock(hashtext(:key))"),
        {"key": f"nspd-import:{current_user.tenant_id}:{settlement_id}"},
    )).scalar()
    if not locked:
        raise HTTPException(status_code=409, detail="NSPD import is already running for this settlement")

    settlement = await _get_owned_settlement(session, settlement_id, current_user.tenant_id)
    if settlement.geometry is None:
        raise HTTPException(status_code=422, detail="Save a polygon or radius before importing NSPD plots")
    contour = shape.to_shape(settlement.geometry)
    result = await import_landplots_in_contour(session, current_user.tenant_id, settlement.id, contour)
    result["unlinked"] = await _unlink_nspd_plots_outside_settlement_boundary(
        session, current_user.tenant_id, settlement.id, contour
    )
    await session.commit()
    await _invalidate_plot_map_cache(current_user.tenant_id)
    return result


@router.get("/{settlement_id}/analysis")
async def settlement_analysis(
    settlement_id: str,
    min_area: float | None = Query(None, description="Мин. площадь свободной зоны, кв.м"),
    max_area: float | None = Query(None, description="Макс. площадь свободной зоны, кв.м"),
    session: AsyncSession = Depends(get_session),
    tenant_id = Depends(get_tenant_scope_optional),
):
    if tenant_id is None:
        raise HTTPException(status_code=404, detail="Settlement not found")
    try:
        report = await analyze_settlement(
            session, settlement_id, tenant_id=tenant_id, min_area=min_area, max_area=max_area
        )
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Analysis failed for settlement %s", settlement_id)
        raise HTTPException(status_code=500, detail=str(e))
