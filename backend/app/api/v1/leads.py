from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...core.exceptions import BadRequestException, NotFoundException
from ...core.rate_limit import check_rate_limit
from ...models import Lead, Plot, PlotStatus, User
from ...schemas import LeadCreate, LeadResponse, LeadUpdate
from ..deps import get_current_user, get_tenant_scope_optional

router = APIRouter(prefix="/leads", tags=["leads"])


def _parse_uuid(value: str, field_name: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise BadRequestException(f"Invalid {field_name}")


def _plot_status_value(plot: Plot) -> str | None:
    if plot.status is None:
        return None
    return plot.status.value if isinstance(plot.status, PlotStatus) else str(plot.status)


def _lead_response(lead: Lead, plot: Plot | None = None) -> LeadResponse:
    return LeadResponse(
        id=str(lead.id),
        plot_id=str(lead.plot_id),
        buyer_name=lead.buyer_name,
        buyer_phone=lead.buyer_phone,
        buyer_email=lead.buyer_email,
        message=lead.message,
        status=lead.status,
        plot_title=plot.title if plot else None,
        plot_cadastral_number=plot.cadastral_number if plot else None,
        plot_status=_plot_status_value(plot) if plot else None,
        plot_price=plot.price if plot else None,
        created_at=lead.created_at,
    )


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
        select(Lead, Plot)
        .join(Plot, Lead.plot_id == Plot.id)
        .where(Lead.tenant_id == current_user.tenant_id)
        .order_by(Lead.created_at.desc())
        .limit(100)
    )
    rows = result.all()
    return [_lead_response(lead, plot) for lead, plot in rows]


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    body: LeadUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    lead_uuid = _parse_uuid(lead_id, "lead_id")
    result = await session.execute(
        select(Lead, Plot)
        .join(Plot, Lead.plot_id == Plot.id)
        .where(
            Lead.id == lead_uuid,
            Lead.tenant_id == current_user.tenant_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise NotFoundException("Lead not found")

    lead, plot = row
    lead.status = body.status
    await session.commit()
    await session.refresh(lead)

    return _lead_response(lead, plot)
