from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
from datetime import datetime, timedelta, timezone
from uuid import UUID
from urllib.parse import ParseResult, urlparse

from cryptography.fernet import Fernet, InvalidToken
import httpx
from sqlalchemy import and_, or_, select

from ..core.config import settings
from ..core.database import async_session_factory
from ..metrics import WEBHOOK_DELIVERIES
from ..models import TenantWebhookConfig, WebhookOutbox


logger = logging.getLogger(__name__)


class WebhookTargetError(ValueError):
    pass


def sign_webhook_body(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def serialize_webhook_payload(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def validate_resolved_webhook_target(url: str, addresses: list[str]) -> ParseResult:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise WebhookTargetError("Webhook URL must be an HTTPS URL without credentials")
    if parsed.port not in (None, 443):
        raise WebhookTargetError("Webhook URL must use port 443")
    if not addresses:
        raise WebhookTargetError("Webhook hostname did not resolve")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise WebhookTargetError("Webhook hostname resolves to a non-public address")
    return parsed


async def validate_webhook_url(url: str) -> ParseResult:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise WebhookTargetError("Webhook URL must use HTTPS")
    loop = asyncio.get_running_loop()
    try:
        records = await loop.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise WebhookTargetError("Webhook hostname could not be resolved") from exc
    addresses = list({record[4][0] for record in records})
    return validate_resolved_webhook_target(url, addresses)


def _fernet() -> Fernet:
    if not settings.webhook_encryption_key:
        raise RuntimeError("LANDSEARCH_WEBHOOK_ENCRYPTION_KEY is required for webhook configuration")
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.webhook_encryption_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_webhook_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_webhook_secret(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("Webhook secret cannot be decrypted") from exc


def redact_webhook_config(config) -> dict:
    return {
        "url": config.url,
        "enabled": bool(config.enabled),
        "has_secret": bool(config.secret_encrypted),
        "updated_at": config.updated_at,
    }


async def _claim_outbox_event(*, tenant_id: UUID | None = None) -> UUID | None:
    now = datetime.now(timezone.utc)
    stale = now - timedelta(minutes=5)
    async with async_session_factory() as session:
        async with session.begin():
            stmt = select(WebhookOutbox).where(
                or_(
                    and_(WebhookOutbox.status.in_(["pending", "retry"]), WebhookOutbox.next_attempt_at <= now),
                    and_(WebhookOutbox.status == "delivering", WebhookOutbox.updated_at <= stale),
                )
            )
            if tenant_id is not None:
                stmt = stmt.where(WebhookOutbox.tenant_id == tenant_id)
            stmt = stmt.order_by(WebhookOutbox.created_at).limit(1).with_for_update(skip_locked=True)
            event = (await session.execute(stmt)).scalar_one_or_none()
            if event is None:
                return None
            event.status = "delivering"
            event.attempts += 1
            event.last_error_code = None
            await session.flush()
            return event.id


async def _deliver_outbox_event(event_id: UUID) -> None:
    async with async_session_factory() as session:
        result = await session.execute(
            select(WebhookOutbox, TenantWebhookConfig)
            .join(TenantWebhookConfig, WebhookOutbox.tenant_id == TenantWebhookConfig.tenant_id)
            .where(WebhookOutbox.id == event_id)
        )
        row = result.one_or_none()
        if row is None:
            return
        event, config = row
        body = serialize_webhook_payload(event.payload)
        attempts = event.attempts
        url = config.url
        enabled = config.enabled
        encrypted_secret = config.secret_encrypted

    http_status: int | None = None
    error_code: str | None = None
    delivered = False
    retryable = True
    try:
        if not enabled:
            raise WebhookTargetError("Webhook is disabled")
        await validate_webhook_url(url)
        secret = decrypt_webhook_secret(encrypted_secret)
        headers = {
            "Content-Type": "application/json",
            "X-LandSearch-Event": str(event_id),
            "X-LandSearch-Signature": sign_webhook_body(body, secret),
        }
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            response = await client.post(url, content=body, headers=headers)
        http_status = response.status_code
        delivered = 200 <= response.status_code < 300
        retryable = response.status_code in {408, 425, 429} or response.status_code >= 500
        if not delivered:
            error_code = f"http_{response.status_code}"
    except WebhookTargetError:
        error_code = "invalid_target"
        retryable = False
    except RuntimeError:
        error_code = "secret_error"
        retryable = False
    except (httpx.HTTPError, OSError):
        error_code = "network_error"
        retryable = True

    now = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        async with session.begin():
            event = await session.get(WebhookOutbox, event_id, with_for_update=True)
            if event is None:
                return
            event.last_http_status = http_status
            event.last_error_code = error_code
            if delivered:
                event.status = "delivered"
                event.delivered_at = now
                WEBHOOK_DELIVERIES.labels(outcome="delivered").inc()
            elif retryable and attempts < 8:
                event.status = "retry"
                event.next_attempt_at = now + timedelta(seconds=min(3600, 30 * (2 ** max(0, attempts - 1))))
                WEBHOOK_DELIVERIES.labels(outcome="retry").inc()
            else:
                event.status = "dead"
                WEBHOOK_DELIVERIES.labels(outcome="dead").inc()


async def process_webhook_outbox(*, limit: int = 20, tenant_id: UUID | None = None) -> int:
    processed = 0
    for _ in range(limit):
        event_id = await _claim_outbox_event(tenant_id=tenant_id)
        if event_id is None:
            break
        await _deliver_outbox_event(event_id)
        processed += 1
    return processed


async def webhook_worker_loop() -> None:
    while True:
        try:
            await process_webhook_outbox(limit=20)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Webhook outbox worker iteration failed")
        await asyncio.sleep(max(5, settings.webhook_worker_interval_seconds))
