from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...models import TenantLegalProfile, TenantWebhookConfig, User, UserRole, WebhookOutbox
from ...schemas import LegalProfileResponse, LegalProfileUpdate, WebhookConfigResponse, WebhookConfigUpdate, WebhookDeliveryResponse
from .legal import legal_profile_response
from ...services.webhooks import (
    WebhookTargetError,
    encrypt_webhook_secret,
    process_webhook_outbox,
    redact_webhook_config,
    validate_webhook_url,
)
from ..deps import require_role


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/legal", response_model=LegalProfileResponse)
async def get_legal_profile(
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    profile = (await session.execute(select(TenantLegalProfile).where(
        TenantLegalProfile.tenant_id == current_user.tenant_id
    ))).scalar_one_or_none()
    return legal_profile_response(profile)


@router.put("/legal", response_model=LegalProfileResponse)
async def update_legal_profile(
    body: LegalProfileUpdate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    profile = (await session.execute(select(TenantLegalProfile).where(
        TenantLegalProfile.tenant_id == current_user.tenant_id
    ))).scalar_one_or_none()
    if profile is None:
        profile = TenantLegalProfile(tenant_id=current_user.tenant_id)
        session.add(profile)
    for field, value in body.model_dump().items():
        setattr(profile, field, value)
    await session.commit()
    await session.refresh(profile)
    return legal_profile_response(profile)


@router.get("/webhook", response_model=WebhookConfigResponse)
async def get_webhook_config(
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    config = (await session.execute(select(TenantWebhookConfig).where(
        TenantWebhookConfig.tenant_id == current_user.tenant_id
    ))).scalar_one_or_none()
    return redact_webhook_config(config) if config else WebhookConfigResponse()


@router.put("/webhook", response_model=WebhookConfigResponse)
async def update_webhook_config(
    body: WebhookConfigUpdate,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    try:
        await validate_webhook_url(body.url)
    except WebhookTargetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    config = (await session.execute(select(TenantWebhookConfig).where(
        TenantWebhookConfig.tenant_id == current_user.tenant_id
    ))).scalar_one_or_none()
    if config is None and not body.secret:
        raise HTTPException(status_code=422, detail="Secret is required for a new webhook")
    if config is None:
        config = TenantWebhookConfig(
            tenant_id=current_user.tenant_id,
            url=body.url,
            secret_encrypted=encrypt_webhook_secret(body.secret or ""),
            enabled=body.enabled,
            updated_by=current_user.id,
        )
        session.add(config)
    else:
        config.url = body.url
        config.enabled = body.enabled
        config.updated_by = current_user.id
        if body.secret:
            config.secret_encrypted = encrypt_webhook_secret(body.secret)
    await session.commit()
    await session.refresh(config)
    return redact_webhook_config(config)


@router.get("/webhook/deliveries", response_model=list[WebhookDeliveryResponse])
async def list_webhook_deliveries(
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(WebhookOutbox).where(WebhookOutbox.tenant_id == current_user.tenant_id)
        .order_by(WebhookOutbox.created_at.desc()).limit(200)
    )).scalars().all()
    return [WebhookDeliveryResponse(
        id=str(row.id), event_id=str(row.event_id), event_type=row.event_type,
        status=row.status, attempts=row.attempts, next_attempt_at=row.next_attempt_at,
        last_http_status=row.last_http_status, last_error_code=row.last_error_code,
        delivered_at=row.delivered_at, created_at=row.created_at,
    ) for row in rows]


@router.post("/webhook/deliveries/process")
async def process_webhook_deliveries(
    current_user: User = Depends(require_role(UserRole.admin)),
):
    return {"processed": await process_webhook_outbox(limit=20, tenant_id=current_user.tenant_id)}


@router.post("/webhook/deliveries/{delivery_id}/retry")
async def retry_webhook_delivery(
    delivery_id: str,
    current_user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_session),
):
    row = (await session.execute(select(WebhookOutbox).where(
        WebhookOutbox.id == delivery_id,
        WebhookOutbox.tenant_id == current_user.tenant_id,
    ))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Delivery not found")
    row.status = "pending"
    row.next_attempt_at = row.created_at
    await session.commit()
    return {"status": "pending"}
