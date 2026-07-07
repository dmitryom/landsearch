import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import shape
from shapely.geometry import mapping
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import Plot, Settlement, User
from ...schemas import SettlementResponse
from ...utils.plot_helpers import plot_to_response
from ...services.analysis import analyze_settlement
from ..deps import get_current_user_optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.get("", response_model=list[SettlementResponse])
async def list_settlements(
    region: str | None = None,
    district: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Settlement)
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


@router.get("/{settlement_id}")
async def get_settlement(
    settlement_id: str,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Settlement).where(Settlement.id == settlement_id)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")

    geom = None
    if s.geometry:
        try:
            geom = mapping(shape.to_shape(s.geometry))
        except Exception:
            pass

    plots_result = await session.execute(
        select(Plot).where(
            Plot.settlement_id == s.id,
            Plot.is_active,
        )
    )
    plots = plots_result.scalars().all()

    total_plots = len(plots)
    free_plots = sum(1 for p in plots if p.status == "free")
    total_area = sum(p.area_m2 or 0 for p in plots)
    total_price = sum(p.price or 0 for p in plots)

    return {
        "id": str(s.id),
        "name": s.name,
        "description": s.description,
        "address": s.address,
        "region": s.region,
        "district": s.district,
        "geometry": geom,
        "stats": {
            "total_plots": total_plots,
            "free_plots": free_plots,
            "reserved_plots": sum(1 for p in plots if p.status == "reserved"),
            "booked_plots": sum(1 for p in plots if p.status == "booked"),
            "sold_plots": sum(1 for p in plots if p.status == "sold"),
            "total_area_ha": round(total_area / 10000, 2) if total_area else 0,
            "total_price": total_price,
            "avg_price_per_ha": round(total_price / (total_area / 10000), 0) if total_area else 0,
        },
        "plots": [plot_to_response(p) for p in plots],
        "created_at": s.created_at,
    }


@router.get("/{settlement_id}/analysis")
async def settlement_analysis(
    settlement_id: str,
    min_area: float | None = Query(None, description="Мин. площадь свободной зоны, кв.м"),
    max_area: float | None = Query(None, description="Макс. площадь свободной зоны, кв.м"),
    session: AsyncSession = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
):
    try:
        report = await analyze_settlement(
            session, settlement_id, current_user=current_user, min_area=min_area, max_area=max_area
        )
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Analysis failed for settlement %s", settlement_id)
        raise HTTPException(status_code=500, detail=str(e))
