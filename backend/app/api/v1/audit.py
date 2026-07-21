from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import AuditEvent, User, UserRole
from ...schemas import AuditEventResponse
from ..deps import require_role


router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEventResponse])
async def list_audit_events(
    entity_type: str | None = Query(None, max_length=64),
    current_user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(AuditEvent)
        .where(AuditEvent.tenant_id == current_user.tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(500)
    )
    if entity_type:
        stmt = stmt.where(AuditEvent.entity_type == entity_type)
    events = (await session.execute(stmt)).scalars().all()
    return [AuditEventResponse(
        id=str(event.id),
        actor_id=str(event.actor_id) if event.actor_id else None,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        action=event.action,
        details=event.details,
        created_at=event.created_at,
    ) for event in events]
