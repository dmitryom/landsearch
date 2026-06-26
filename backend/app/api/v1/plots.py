import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import shape
from shapely.geometry import mapping
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...core.database import get_session
from ...models import Plot, PlotStatus, Settlement, Tenant, User
from ...schemas import (
    PlotCreate,
    PlotGeoJSON,
    PlotListResponse,
    PlotResponse,
    PlotSearchParams,
    PlotUpdate,
)
from ..deps import get_current_user
from ...services.cadastre import enrich_from_cadastre

router = APIRouter(prefix="/plots", tags=["plots"])


def _plot_to_response(plot: Plot) -> PlotResponse:
    geom = None
    if plot.geometry:
        try:
            geom = mapping(shape.to_shape(plot.geometry))
        except Exception:
            pass
    return PlotResponse(
        id=str(plot.id),
        tenant_id=str(plot.tenant_id),
        cadastral_number=plot.cadastral_number,
        address=plot.address,
        area_m2=plot.area_m2,
        category=plot.category,
        permitted_use=plot.permitted_use,
        cadastral_value=plot.cadastral_value,
        cad_unit=plot.cad_unit,
        price=plot.price,
        price_per_hectare=plot.price_per_hectare,
        status=plot.status.value if isinstance(plot.status, PlotStatus) else plot.status,
        title=plot.title,
        description=plot.description,
        geometry=geom,
        is_active=plot.is_active,
        created_at=plot.created_at,
        updated_at=plot.updated_at,
    )


@router.get("", response_model=PlotListResponse)
async def list_plots(
    query: str | None = Query(None),
    settlement_id: str | None = None,
    status: str | None = None,
    permitted_use: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    area_min: float | None = None,
    area_max: float | None = None,
    region: str | None = None,
    district: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort_by: str = "created_at",
    sort_order: str = "desc",
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Plot).where(Plot.is_active == True)

    if query:
        like = f"%{query}%"
        stmt = stmt.where(
            or_(
                Plot.cadastral_number.ilike(like),
                Plot.address.ilike(like),
                Plot.title.ilike(like),
            )
        )
    if settlement_id:
        stmt = stmt.where(Plot.settlement_id == UUID(settlement_id))
    if status:
        stmt = stmt.where(Plot.status == status)
    if permitted_use:
        stmt = stmt.where(Plot.permitted_use.ilike(f"%{permitted_use}%"))
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

    sort_col = getattr(Plot, sort_by, Plot.created_at)
    order_fn = sort_col.desc() if sort_order == "desc" else sort_col.asc()
    stmt = stmt.order_by(order_fn).offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(stmt.options(selectinload(Plot.settlement)))
    plots = result.scalars().all()

    return PlotListResponse(
        items=[_plot_to_response(p) for p in plots],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/geo", response_model=PlotGeoJSON)
async def plots_geojson(
    status: str | None = None,
    permitted_use: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Plot).where(Plot.is_active == True, Plot.geometry.isnot(None))
    if status:
        stmt = stmt.where(Plot.status == status)
    if permitted_use:
        stmt = stmt.where(Plot.permitted_use.ilike(f"%{permitted_use}%"))

    result = await session.execute(stmt)
    plots = result.scalars().all()

    features = []
    for p in plots:
        geom = None
        if p.geometry:
            try:
                geom = mapping(shape.to_shape(p.geometry))
            except Exception:
                continue
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": str(p.id),
                "cadastral_number": p.cadastral_number,
                "price": p.price,
                "area_m2": p.area_m2,
                "permitted_use": p.permitted_use,
                "status": p.status.value if isinstance(p.status, PlotStatus) else p.status,
                "title": p.title,
            },
        })

    return PlotGeoJSON(features=features)


@router.get("/{plot_id}", response_model=PlotResponse)
async def get_plot(plot_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Plot).where(Plot.id == UUID(plot_id), Plot.is_active == True)
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    return _plot_to_response(plot)


@router.post("", response_model=PlotResponse, status_code=201)
async def create_plot(
    body: PlotCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    plot = Plot(
        tenant_id=current_user.tenant_id,
        cadastral_number=body.cadastral_number,
        address=body.address,
        area_m2=body.area_m2,
        category=body.category,
        permitted_use=body.permitted_use,
        cadastral_value=body.cadastral_value,
        cad_unit=body.cad_unit,
        price=body.price,
        status=body.status,
        title=body.title,
        description=body.description,
        settlement_id=UUID(body.settlement_id) if body.settlement_id else None,
    )
    if body.area_m2 and body.price:
        plot.price_per_hectare = body.price / (body.area_m2 / 10000)

    session.add(plot)
    await session.flush()

    try:
        await enrich_from_cadastre(session, plot)
    except Exception:
        pass

    await session.commit()
    return _plot_to_response(plot)


@router.patch("/{plot_id}", response_model=PlotResponse)
async def update_plot(
    plot_id: str,
    body: PlotUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Plot).where(
            Plot.id == UUID(plot_id),
            Plot.tenant_id == current_user.tenant_id,
        )
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] != plot.status.value:
        from ...models import PlotStatusHistory
        history = PlotStatusHistory(
            plot_id=plot.id,
            old_status=plot.status.value if isinstance(plot.status, PlotStatus) else plot.status,
            new_status=update_data["status"],
            changed_by=current_user.id,
        )
        session.add(history)

    for key, value in update_data.items():
        setattr(plot, key, value)

    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10000)

    await session.commit()
    await session.refresh(plot)
    return _plot_to_response(plot)


@router.delete("/{plot_id}", status_code=204)
async def delete_plot(
    plot_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Plot).where(
            Plot.id == UUID(plot_id),
            Plot.tenant_id == current_user.tenant_id,
        )
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    plot.is_active = False
    await session.commit()
