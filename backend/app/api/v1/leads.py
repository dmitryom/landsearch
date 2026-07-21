from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...core.exceptions import BadRequestException, NotFoundException
from ...core.rate_limit import check_rate_limit
from ...models import Lead, Plot, PlotStatus, TenantLegalProfile, User, UserRole
from ...schemas import LeadAssigneeResponse, LeadAssignmentUpdate, LeadCreate, LeadResponse, LeadUpdate
from ...services.audit import record_event
from ..deps import get_tenant_scope_optional, require_role

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


def _lead_response(lead: Lead, plot: Plot | None = None, assigned_user: User | None = None) -> LeadResponse:
    response_due_at = None
    if lead.status in {"new", "in_progress"} and lead.first_response_at is None and lead.created_at:
        response_due_at = lead.created_at + timedelta(minutes=15)
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
        consent_at=lead.consent_at,
        consent_version=lead.consent_version,
        expires_at=lead.expires_at,
        assigned_user_id=str(lead.assigned_user_id) if lead.assigned_user_id else None,
        assigned_user_name=assigned_user.full_name if assigned_user else None,
        assigned_at=lead.assigned_at,
        first_response_at=lead.first_response_at,
        response_due_at=response_due_at,
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

    legal_profile = (await session.execute(
        select(TenantLegalProfile).where(TenantLegalProfile.tenant_id == plot.tenant_id)
    )).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    retention_days = legal_profile.lead_retention_days if legal_profile else 365
    assignee = (await session.execute(
        select(User)
        .where(
            User.tenant_id == plot.tenant_id,
            User.is_active,
            User.role.in_([UserRole.manager, UserRole.admin, UserRole.superadmin]),
        )
        .order_by(User.created_at.asc())
        .limit(1)
    )).scalar_one_or_none()
    lead = Lead(
        tenant_id=plot.tenant_id,
        plot_id=body.plot_id,
        buyer_name=body.buyer_name,
        buyer_phone=body.buyer_phone,
        buyer_email=body.buyer_email,
        message=body.message,
        consent_at=now,
        consent_version=body.consent_version,
        expires_at=now + timedelta(days=retention_days),
        assigned_user_id=assignee.id if assignee else None,
        assigned_at=now if assignee else None,
    )
    session.add(lead)
    await session.flush()
    await record_event(
        session,
        tenant_id=plot.tenant_id,
        actor_id=None,
        entity_type="lead",
        entity_id=str(lead.id),
        action="lead.created",
        details={"plot_id": str(plot.id), "status": lead.status},
        webhook_payload={
            "lead": {
                "id": str(lead.id),
                "plot_id": str(plot.id),
                "cadastral_number": plot.cadastral_number,
                "buyer_name": lead.buyer_name,
                "buyer_phone": lead.buyer_phone,
                "buyer_email": lead.buyer_email,
                "message": lead.message,
            }
        },
    )
    await session.commit()
    return {"status": "ok", "id": str(lead.id)}


@router.get("/assignees", response_model=list[LeadAssigneeResponse])
async def list_lead_assignees(
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(User)
        .where(
            User.tenant_id == current_user.tenant_id,
            User.is_active,
            User.role.in_([UserRole.manager, UserRole.admin, UserRole.superadmin]),
        )
        .order_by(User.full_name.asc().nullslast(), User.email.asc())
    )
    return [
        LeadAssigneeResponse(
            id=str(user.id),
            full_name=user.full_name,
            email=user.email,
            role=user.role.value if hasattr(user.role, "value") else str(user.role),
        )
        for user in result.scalars().all()
    ]


@router.get("", response_model=list[LeadResponse])
async def list_leads(
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Lead, Plot, User)
        .join(Plot, Lead.plot_id == Plot.id)
        .outerjoin(User, Lead.assigned_user_id == User.id)
        .where(Lead.tenant_id == current_user.tenant_id)
        .order_by(Lead.created_at.desc())
        .limit(500)
    )
    rows = result.all()
    return [_lead_response(lead, plot, assigned_user) for lead, plot, assigned_user in rows]


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    body: LeadUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    lead_uuid = _parse_uuid(lead_id, "lead_id")
    result = await session.execute(
        select(Lead, Plot, User)
        .join(Plot, Lead.plot_id == Plot.id)
        .outerjoin(User, Lead.assigned_user_id == User.id)
        .where(
            Lead.id == lead_uuid,
            Lead.tenant_id == current_user.tenant_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise NotFoundException("Lead not found")

    lead, plot, assigned_user = row
    fields = body.model_dump(exclude_unset=True)
    old_status = lead.status
    new_status = body.status if body.status is not None else lead.status
    if body.status is not None:
        lead.status = body.status
        if body.status == "in_progress" and lead.first_response_at is None:
            lead.first_response_at = datetime.now(timezone.utc)
    if "assigned_user_id" in body.model_fields_set:
        assigned_user = None
        if body.assigned_user_id:
            assigned_user = (await session.execute(
                select(User).where(
                    User.id == _parse_uuid(body.assigned_user_id, "assigned_user_id"),
                    User.tenant_id == current_user.tenant_id,
                    User.is_active,
                    User.role.in_([UserRole.manager, UserRole.admin, UserRole.superadmin]),
                )
            )).scalar_one_or_none()
            if assigned_user is None:
                raise NotFoundException("Assignee not found")
        lead.assigned_user_id = assigned_user.id if assigned_user else None
        lead.assigned_at = datetime.now(timezone.utc) if assigned_user else None
    event_action = "lead.status_changed" if body.status is not None else "lead.assigned"
    await record_event(
        session,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.id,
        entity_type="lead",
        entity_id=str(lead.id),
        action=event_action,
        details={"old_status": old_status, "new_status": new_status, "fields": sorted(fields)},
        webhook_payload={"lead": {"id": str(lead.id), "plot_id": str(lead.plot_id), "status": new_status, "assigned_user_id": str(lead.assigned_user_id) if lead.assigned_user_id else None}},
    )
    await session.commit()
    await session.refresh(lead)

    return _lead_response(lead, plot, assigned_user)


@router.patch("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead(
    lead_id: str,
    body: LeadAssignmentUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    lead_uuid = _parse_uuid(lead_id, "lead_id")
    result = await session.execute(
        select(Lead, Plot)
        .join(Plot, Lead.plot_id == Plot.id)
        .where(Lead.id == lead_uuid, Lead.tenant_id == current_user.tenant_id)
    )
    row = result.one_or_none()
    if not row:
        raise NotFoundException("Lead not found")
    lead, plot = row
    assignee_id = _parse_uuid(body.assigned_user_id, "assigned_user_id") if body.assigned_user_id else current_user.id
    assigned_user = (await session.execute(
        select(User).where(
            User.id == assignee_id,
            User.tenant_id == current_user.tenant_id,
            User.is_active,
            User.role.in_([UserRole.manager, UserRole.admin, UserRole.superadmin]),
        )
    )).scalar_one_or_none()
    if assigned_user is None:
        raise NotFoundException("Assignee not found")
    lead.assigned_user_id = assigned_user.id
    lead.assigned_at = datetime.now(timezone.utc)
    await record_event(
        session,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.id,
        entity_type="lead",
        entity_id=str(lead.id),
        action="lead.assigned",
        details={"assigned_user_id": str(assigned_user.id)},
    )
    await session.commit()
    await session.refresh(lead)
    return _lead_response(lead, plot, assigned_user)


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(
    lead_id: str,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    lead_uuid = _parse_uuid(lead_id, "lead_id")
    lead = (await session.execute(select(Lead).where(
        Lead.id == lead_uuid,
        Lead.tenant_id == current_user.tenant_id,
    ))).scalar_one_or_none()
    if not lead:
        raise NotFoundException("Lead not found")
    await record_event(
        session,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.id,
        entity_type="lead",
        entity_id=str(lead.id),
        action="lead.deleted",
        details={"plot_id": str(lead.plot_id)},
    )
    await session.delete(lead)
    await session.commit()
