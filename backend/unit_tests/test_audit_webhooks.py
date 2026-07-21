import hashlib
import hmac

import pytest

from app.services.webhooks import (
    WebhookTargetError,
    redact_webhook_config,
    sign_webhook_body,
    validate_resolved_webhook_target,
)


def test_webhook_signature_covers_exact_body():
    body = b'{"event":"lead.created","id":"123"}'
    secret = "tenant-secret"

    signature = sign_webhook_body(body, secret)

    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert signature == f"sha256={expected}"
    assert sign_webhook_body(body + b" ", secret) != signature


@pytest.mark.parametrize(
    "address",
    ["127.0.0.1", "10.0.0.2", "169.254.169.254", "::1", "fc00::1"],
)
def test_webhook_target_rejects_private_and_local_addresses(address):
    with pytest.raises(WebhookTargetError):
        validate_resolved_webhook_target("https://crm.example.ru/hook", [address])


def test_webhook_target_requires_https_and_public_resolution():
    with pytest.raises(WebhookTargetError):
        validate_resolved_webhook_target("http://crm.example.ru/hook", ["93.184.216.34"])

    parsed = validate_resolved_webhook_target("https://crm.example.ru/hook", ["93.184.216.34"])
    assert parsed.hostname == "crm.example.ru"


def test_webhook_api_never_returns_encrypted_or_plain_secret():
    config = type("WebhookConfigStub", (), {
        "url": "https://crm.example.ru/hook",
        "enabled": True,
        "secret_encrypted": "encrypted-value",
        "updated_at": None,
    })()

    payload = redact_webhook_config(config)

    assert payload["has_secret"] is True
    assert "secret" not in payload
    assert "secret_encrypted" not in payload
