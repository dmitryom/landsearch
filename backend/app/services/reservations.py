from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Lead, Plot, PlotStatus, PlotStatusHistory, Reservation, ReservationStatus
from .plot_metadata import mark_plot_commercial_update


class ReservationConflict(RuntimeError):
    def __init__(self, message: str, *, expires_at: datetime | None = None):
        super().__init__(message)
        self.expires_at = expires_at


class ReservationTransitionError(RuntimeError):
    pass


async def validate_reservation_lead(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    plot_id: UUID,
    lead_id: UUID | None,
) -> None:
    if lead_id is None:
        return
    result = await session.execute(
        select(Lead.id).where(
            Lead.id == lead_id,
            Lead.tenant_id == tenant_id,
            Lead.plot_id == plot_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise LookupError("Lead not found for this plot")


def apply_reservation_transition(
    reservation: Reservation,
    plot: Plot,
    target: ReservationStatus,
    *,
    now: datetime | None = None,
) -> None:
    now = now or datetime.now(timezone.utc)
    if reservation.status != ReservationStatus.active:
        raise ReservationTransitionError("Only an active reservation can be changed")
    if target not in {
        ReservationStatus.confirmed,
        ReservationStatus.cancelled,
        ReservationStatus.expired,
    }:
        raise ReservationTransitionError("Unsupported reservation transition")

    if target == ReservationStatus.confirmed:
        if plot.status != PlotStatus.reserved:
            raise ReservationTransitionError("Plot is no longer reserved")
        plot.status = PlotStatus.booked
        reservation.confirmed_at = now
    elif plot.status == PlotStatus.reserved:
        plot.status = PlotStatus.free
        if target == ReservationStatus.cancelled:
            reservation.cancelled_at = now

    reservation.status = target
    reservation.updated_at = now


async def create_reservation(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    plot_id: UUID,
    responsible_user_id: UUID,
    duration_hours: int,
    lead_id: UUID | None = None,
    buyer_name: str | None = None,
    buyer_phone: str | None = None,
    buyer_email: str | None = None,
    note: str | None = None,
) -> Reservation:
    plot_result = await session.execute(
        select(Plot).where(
            Plot.id == plot_id,
            Plot.tenant_id == tenant_id,
            Plot.is_active,
        ).with_for_update()
    )
    plot = plot_result.scalar_one_or_none()
    if plot is None:
        raise LookupError("Plot not found")

    await validate_reservation_lead(
        session,
        tenant_id=tenant_id,
        plot_id=plot.id,
        lead_id=lead_id,
    )

    active_result = await session.execute(
        select(Reservation).where(
            Reservation.tenant_id == tenant_id,
            Reservation.plot_id == plot_id,
            Reservation.status == ReservationStatus.active,
        )
    )
    active = active_result.scalar_one_or_none()
    if active is not None:
        raise ReservationConflict("Plot already has an active reservation", expires_at=active.expires_at)
    if plot.status != PlotStatus.free:
        raise ReservationConflict(f"Plot is not available ({plot.status.value})")

    now = datetime.now(timezone.utc)
    reservation = Reservation(
        tenant_id=tenant_id,
        plot_id=plot.id,
        lead_id=lead_id,
        responsible_user_id=responsible_user_id,
        buyer_name=buyer_name,
        buyer_phone=buyer_phone,
        buyer_email=buyer_email,
        note=note,
        status=ReservationStatus.active,
        starts_at=now,
        expires_at=now + timedelta(hours=duration_hours),
    )
    old_status = plot.status.value
    plot.status = PlotStatus.reserved
    mark_plot_commercial_update(plot, status_changed=True)
    session.add(reservation)
    session.add(PlotStatusHistory(
        plot_id=plot.id,
        old_status=old_status,
        new_status=PlotStatus.reserved.value,
        changed_by=responsible_user_id,
    ))
    await session.flush()
    return reservation


async def transition_reservation(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    reservation_id: UUID,
    actor_id: UUID,
    target: ReservationStatus,
) -> Reservation:
    reservation_result = await session.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.tenant_id == tenant_id,
        ).with_for_update()
    )
    reservation = reservation_result.scalar_one_or_none()
    if reservation is None:
        raise LookupError("Reservation not found")
    plot_result = await session.execute(
        select(Plot).where(
            Plot.id == reservation.plot_id,
            Plot.tenant_id == tenant_id,
        ).with_for_update()
    )
    plot = plot_result.scalar_one()
    old_status = plot.status.value
    apply_reservation_transition(reservation, plot, target)
    if plot.status.value != old_status:
        mark_plot_commercial_update(plot, status_changed=True)
        session.add(PlotStatusHistory(
            plot_id=plot.id,
            old_status=old_status,
            new_status=plot.status.value,
            changed_by=actor_id,
        ))
    await session.flush()
    return reservation


async def extend_reservation(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    reservation_id: UUID,
    duration_hours: int,
) -> Reservation:
    result = await session.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.tenant_id == tenant_id,
        ).with_for_update()
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise LookupError("Reservation not found")
    if reservation.status != ReservationStatus.active:
        raise ReservationTransitionError("Only an active reservation can be extended")
    now = datetime.now(timezone.utc)
    base = max(reservation.expires_at, now)
    reservation.expires_at = base + timedelta(hours=duration_hours)
    reservation.updated_at = now
    await session.flush()
    return reservation
