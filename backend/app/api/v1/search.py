from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import Plot, Settlement
from ..deps import get_tenant_scope_optional

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/suggest")
async def suggest(
    q: str,
    limit: int = Query(default=10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    tenant_id = Depends(get_tenant_scope_optional),
):
    term = q.strip()
    if len(term) < 2 or tenant_id is None:
        return {"results": []}

    like = f"%{term}%"
    plots = await session.execute(
        select(Plot.cadastral_number, Plot.address, Plot.id)
        .where(
            or_(
                Plot.cadastral_number.ilike(like),
                Plot.address.ilike(like),
            ),
            Plot.is_active,
            Plot.tenant_id == tenant_id,
        )
        .limit(limit)
    )

    settlements = await session.execute(
        select(Settlement.name, Settlement.id)
        .where(Settlement.name.ilike(like), Settlement.tenant_id == tenant_id)
        .limit(limit)
    )

    results = []
    for row in plots:
        results.append({
            "type": "plot",
            "id": str(row.id),
            "label": f"{row.cadastral_number} — {row.address or ''}",
            "value": row.cadastral_number,
        })
    for row in settlements:
        results.append({
            "type": "settlement",
            "id": str(row.id),
            "label": f"🏘 {row.name}",
            "value": row.name,
        })

    return {"results": results[:limit]}
