from sqlalchemy import and_, or_, select, case, literal
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Plot


async def find_similar_plots(
    session: AsyncSession,
    plot_id: str,
    limit: int = 10,
) -> list[Plot]:
    from uuid import UUID
    result = await session.execute(
        select(Plot).where(Plot.id == UUID(plot_id), Plot.is_active == True)
    )
    source = result.scalar_one_or_none()
    if not source:
        return []

    stmt = select(Plot).where(
        Plot.id != source.id,
        Plot.is_active == True,
        Plot.tenant_id == source.tenant_id,
    )

    conditions = []
    if source.cad_unit:
        conditions.append(Plot.cad_unit == source.cad_unit)
    if source.permitted_use:
        conditions.append(Plot.permitted_use == source.permitted_use)
    if source.category:
        conditions.append(Plot.category == source.category)
    if source.area_m2:
        area_min = source.area_m2 * 0.5
        area_max = source.area_m2 * 1.5
        conditions.append(and_(Plot.area_m2 >= area_min, Plot.area_m2 <= area_max))
    if source.price:
        price_min = source.price * 0.5
        price_max = source.price * 1.5
        conditions.append(and_(Plot.price >= price_min, Plot.price <= price_max))

    if conditions:
        stmt = stmt.where(or_(*conditions))
        score = literal(0)
        if source.cad_unit:
            score = score + case((Plot.cad_unit == source.cad_unit, 4), else_=0)
        if source.permitted_use:
            score = score + case((Plot.permitted_use == source.permitted_use, 3), else_=0)
        if source.category:
            score = score + case((Plot.category == source.category, 2), else_=0)
        stmt = stmt.order_by(score.desc())
    else:
        stmt = stmt.order_by(Plot.created_at.desc())

    result = await session.execute(stmt.limit(limit))
    return list(result.scalars().all())
