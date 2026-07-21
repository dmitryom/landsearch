from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuditEvent, TenantWebhookConfig, WebhookOutbox


async def record_event(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    actor_id: UUID | None,
    entity_type: str,
    entity_id: str,
    action: str,
    details: dict | None = None,
    webhook_payload: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        id=uuid4(),
        tenant_id=tenant_id,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        details=details or {},
    )
    session.add(event)
    if webhook_payload is not None:
        config_result = await session.execute(
            select(TenantWebhookConfig.id).where(
                TenantWebhookConfig.tenant_id == tenant_id,
                TenantWebhookConfig.enabled,
            )
        )
        if config_result.scalar_one_or_none() is not None:
            session.add(WebhookOutbox(
                event_id=event.id,
                tenant_id=tenant_id,
                event_type=action,
                payload={"event_id": str(event.id), "event_type": action, **webhook_payload},
                status="pending",
            ))
    return event
