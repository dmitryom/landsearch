from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...core.exceptions import NotFoundException
from ...core.rate_limit import check_rate_limit
from ...models import Lead, Plot, User
from ...schemas import LeadCreate, LeadResponse
from ..deps import get_current_user, get_tenant_scope_optional

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", status_code=201)
async def create_lead(
    body: LeadCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    tenant_id = Depends(get_tenant_scope_optional),
):
    await check_rate_limit(request)
    if tenant_id is None:
        raise NotFoundException("Plot not found")

    result = await session.execute(
        select(Plot).where(
            Plot.id == body.plot_id,
            Plot.tenant_id == tenant_id,
            Plot.is_active,
        )
    )
    plot = result.scalar_one_or_none()
    if not plot:
        raise NotFoundException("Plot not found")

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


@router.get("", response_model=list[LeadResponse])
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
        LeadResponse(
            id=str(lead.id),
            plot_id=str(lead.plot_id),
            buyer_name=lead.buyer_name,
            buyer_phone=lead.buyer_phone,
            buyer_email=lead.buyer_email,
            message=lead.message,
            status=lead.status,
            created_at=lead.created_at,
        )
        for lead in leads
    ]
