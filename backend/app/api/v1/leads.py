import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import Lead, Plot, User
from ...schemas import LeadCreate
from ..deps import get_current_user

router = APIRouter(prefix="/leads", tags=["leads"])

_lead_rate_limit: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 5


def _check_rate_limit(ip: str):
    now = time.time()
    _lead_rate_limit[ip] = [t for t in _lead_rate_limit[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(_lead_rate_limit[ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    _lead_rate_limit[ip].append(now)


@router.post("", status_code=201)
async def create_lead(
    body: LeadCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    result = await session.execute(
        select(Plot).where(Plot.id == body.plot_id, Plot.is_active == True)
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")

    if body.buyer_email:
        existing = await session.execute(
            select(Lead).where(
                Lead.plot_id == body.plot_id,
                Lead.buyer_email == body.buyer_email,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Заявка уже отправлена")

    lead = Lead(
        tenant_id=plot.tenant_id,
        plot_id=body.plot_id,
        buyer_name=body.buyer_name,
        buyer_phone=body.buyer_phone,
        buyer_email=body.buyer_email,
        message=body.message,
    )
    session.add(lead)
    await session.commit()
    return {"status": "ok", "id": str(lead.id)}


@router.get("")
async def list_leads(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Lead)
        .where(Lead.tenant_id == current_user.tenant_id)
        .order_by(Lead.created_at.desc())
        .limit(100)
    )
    leads = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "plot_id": str(l.plot_id),
            "buyer_name": l.buyer_name,
            "buyer_phone": l.buyer_phone,
            "buyer_email": l.buyer_email,
            "message": l.message,
            "status": l.status,
            "created_at": l.created_at,
        }
        for l in leads
    ]
