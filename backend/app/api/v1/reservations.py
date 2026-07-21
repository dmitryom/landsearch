from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...metrics import RESERVATION_EVENTS
from ...models import Plot, Reservation, ReservationStatus, TenantLegalProfile, User, UserRole
from ...schemas import ReservationCreate, ReservationExtend, ReservationResponse
from ...services.audit import record_event
from ...services.reservations import (
    ReservationConflict,
    ReservationTransitionError,
    create_reservation,
    extend_reservation,
    transition_reservation,
)
from ..deps import require_role
from .plots import _invalidate_plot_map_cache


router = APIRouter(prefix="/reservations", tags=["reservations"])


def _parse_uuid(value: str | None, field_name: str) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}") from exc


def _response(reservation: Reservation, plot: Plot | None = None) -> ReservationResponse:
    return ReservationResponse(
        id=str(reservation.id),
        plot_id=str(reservation.plot_id),
        lead_id=str(reservation.lead_id) if reservation.lead_id else None,
        responsible_user_id=str(reservation.responsible_user_id),
        buyer_name=reservation.buyer_name,
        buyer_phone=reservation.buyer_phone,
        buyer_email=reservation.buyer_email,
        note=reservation.note,
        status=reservation.status.value if isinstance(reservation.status, ReservationStatus) else str(reservation.status),
        starts_at=reservation.starts_at,
        expires_at=reservation.expires_at,
        confirmed_at=reservation.confirmed_at,
        cancelled_at=reservation.cancelled_at,
        created_at=reservation.created_at,
        updated_at=reservation.updated_at,
        plot_cadastral_number=plot.cadastral_number if plot else None,
        plot_title=plot.title if plot else None,
        plot_status=plot.status.value if plot and hasattr(plot.status, "value") else str(plot.status) if plot else None,
    )


async def _load_plot(session: AsyncSession, reservation: Reservation, tenant_id: UUID) -> Plot | None:
    result = await session.execute(
        select(Plot).where(Plot.id == reservation.plot_id, Plot.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


@router.post("", response_model=ReservationResponse, status_code=201)
async def create_plot_reservation(
    body: ReservationCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    try:
        reservation = await create_reservation(
            session,
            tenant_id=current_user.tenant_id,
            plot_id=_parse_uuid(body.plot_id, "plot_id"),
            lead_id=_parse_uuid(body.lead_id, "lead_id"),
            responsible_user_id=current_user.id,
            buyer_name=body.buyer_name,
            buyer_phone=body.buyer_phone,
            buyer_email=body.buyer_email,
            note=body.note,
            duration_hours=body.duration_hours,
        )
        legal_profile = (await session.execute(select(TenantLegalProfile).where(
            TenantLegalProfile.tenant_id == current_user.tenant_id
        ))).scalar_one_or_none()
        retention_days = legal_profile.reservation_retention_days if legal_profile else 365
        reservation.pii_expires_at = datetime.now(timezone.utc) + timedelta(days=retention_days)
        await record_event(
            session,
            tenant_id=current_user.tenant_id,
            actor_id=current_user.id,
            entity_type="reservation",
            entity_id=str(reservation.id),
            action="reservation.created",
            details={"plot_id": str(reservation.plot_id), "expires_at": reservation.expires_at.isoformat()},
            webhook_payload={"reservation": {
                "id": str(reservation.id), "plot_id": str(reservation.plot_id),
                "status": ReservationStatus.active.value,
                "expires_at": reservation.expires_at.isoformat(),
                "buyer_name": reservation.buyer_name, "buyer_phone": reservation.buyer_phone,
                "buyer_email": reservation.buyer_email,
            }},
        )
        await session.commit()
    except LookupError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReservationConflict as exc:
        await session.rollback()
        suffix = f" until {exc.expires_at.isoformat()}" if exc.expires_at else ""
        raise HTTPException(status_code=409, detail=f"{exc}{suffix}") from exc
    await session.refresh(reservation)
    RESERVATION_EVENTS.labels(action="created").inc()
    await _invalidate_plot_map_cache(current_user.tenant_id)
    plot = await _load_plot(session, reservation, current_user.tenant_id)
    return _response(reservation, plot)


@router.get("", response_model=list[ReservationResponse])
async def list_reservations(
    status: ReservationStatus | None = Query(None),
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(Reservation, Plot)
        .join(Plot, Reservation.plot_id == Plot.id)
        .where(Reservation.tenant_id == current_user.tenant_id)
        .order_by(Reservation.created_at.desc())
        .limit(500)
    )
    if status is not None:
        stmt = stmt.where(Reservation.status == status)
    result = await session.execute(stmt)
    return [_response(reservation, plot) for reservation, plot in result.all()]


async def _transition_endpoint(
    reservation_id: str,
    target: ReservationStatus,
    current_user: User,
    session: AsyncSession,
) -> ReservationResponse:
    try:
        reservation = await transition_reservation(
            session,
            tenant_id=current_user.tenant_id,
            reservation_id=_parse_uuid(reservation_id, "reservation_id"),
            actor_id=current_user.id,
            target=target,
        )
        await record_event(
            session,
            tenant_id=current_user.tenant_id,
            actor_id=current_user.id,
            entity_type="reservation",
            entity_id=str(reservation.id),
            action=f"reservation.{target.value}",
            details={"plot_id": str(reservation.plot_id), "status": target.value},
            webhook_payload={"reservation": {"id": str(reservation.id), "plot_id": str(reservation.plot_id), "status": target.value}},
        )
        await session.commit()
    except LookupError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReservationTransitionError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.refresh(reservation)
    RESERVATION_EVENTS.labels(action=target.value).inc()
    await _invalidate_plot_map_cache(current_user.tenant_id)
    plot = await _load_plot(session, reservation, current_user.tenant_id)
    return _response(reservation, plot)


@router.patch("/{reservation_id}/confirm", response_model=ReservationResponse)
async def confirm_reservation(
    reservation_id: str,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    return await _transition_endpoint(reservation_id, ReservationStatus.confirmed, current_user, session)


@router.patch("/{reservation_id}/cancel", response_model=ReservationResponse)
async def cancel_reservation(
    reservation_id: str,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    return await _transition_endpoint(reservation_id, ReservationStatus.cancelled, current_user, session)


@router.patch("/{reservation_id}/extend", response_model=ReservationResponse)
async def extend_plot_reservation(
    reservation_id: str,
    body: ReservationExtend,
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    try:
        reservation = await extend_reservation(
            session,
            tenant_id=current_user.tenant_id,
            reservation_id=_parse_uuid(reservation_id, "reservation_id"),
            duration_hours=body.duration_hours,
        )
        await record_event(
            session,
            tenant_id=current_user.tenant_id,
            actor_id=current_user.id,
            entity_type="reservation",
            entity_id=str(reservation.id),
            action="reservation.extended",
            details={"duration_hours": body.duration_hours, "expires_at": reservation.expires_at.isoformat()},
        )
        await session.commit()
    except LookupError as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReservationTransitionError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.refresh(reservation)
    RESERVATION_EVENTS.labels(action="extended").inc()
    plot = await _load_plot(session, reservation, current_user.tenant_id)
    return _response(reservation, plot)


@router.post("/expire", response_model=dict[str, int])
async def expire_due_reservations(
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(Reservation.id).where(
            Reservation.tenant_id == current_user.tenant_id,
            Reservation.status == ReservationStatus.active,
            Reservation.expires_at <= now,
        ).limit(500)
    )
    expired = 0
    for reservation_id in result.scalars().all():
        try:
            await transition_reservation(
                session,
                tenant_id=current_user.tenant_id,
                reservation_id=reservation_id,
                actor_id=current_user.id,
                target=ReservationStatus.expired,
            )
            await record_event(
                session,
                tenant_id=current_user.tenant_id,
                actor_id=current_user.id,
                entity_type="reservation",
                entity_id=str(reservation_id),
                action="reservation.expired",
                details={},
                webhook_payload={"reservation": {"id": str(reservation_id), "status": "expired"}},
            )
            expired += 1
        except (LookupError, ReservationTransitionError):
            continue
    await session.commit()
    if expired:
        RESERVATION_EVENTS.labels(action="expired").inc(expired)
        await _invalidate_plot_map_cache(current_user.tenant_id)
    return {"expired": expired}
