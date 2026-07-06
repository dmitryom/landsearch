from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import Plot, Settlement

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/suggest")
async def suggest(
    q: str,
    limit: int = 10,
    session: AsyncSession = Depends(get_session),
):
    if len(q) < 2:
        return {"results": []}

    like = f"%{q}%"
    plots = await session.execute(
        select(Plot.cadastral_number, Plot.address, Plot.id)
        .where(
            or_(
                Plot.cadastral_number.ilike(like),
                Plot.address.ilike(like),
            ),
            Plot.is_active,
        )
        .limit(limit)
    )

    settlements = await session.execute(
        select(Settlement.name, Settlement.id)
        .where(Settlement.name.ilike(like))
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

    return {"results": results}
