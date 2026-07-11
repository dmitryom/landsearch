from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.deps import _resolve_user
from app.api.v1 import plots as plots_api
from app.core import rate_limit
from app.core.config import Settings
from app.core.exceptions import BadRequestException, NotFoundException, RateLimitException
from app.core.security import create_refresh_token
from app.schemas import PlotCreate


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _UserSession:
    def __init__(self, user):
        self.user = user

    async def execute(self, _stmt):
        return _ScalarResult(self.user)


@pytest.mark.asyncio
async def test_refresh_token_is_not_accepted_as_bearer_token():
    user_id = uuid4()
    user = SimpleNamespace(id=user_id, is_active=True)
    token = create_refresh_token({"sub": str(user_id)})

    with pytest.raises(HTTPException) as exc:
        await _resolve_user(token, _UserSession(user))

    assert exc.value.status_code == 401


class _FakeRedis:
    def __init__(self):
        self.values: dict[str, dict[str, int]] = {}

    async def zremrangebyscore(self, key, _minimum, maximum):
        values = self.values.setdefault(key, {})
        for member, score in list(values.items()):
            if score <= maximum:
                del values[member]

    async def zcard(self, key):
        return len(self.values.setdefault(key, {}))

    async def zadd(self, key, mapping):
        self.values.setdefault(key, {}).update(mapping)

    async def expire(self, _key, _seconds):
        return None

    async def aclose(self):
        return None


@pytest.mark.asyncio
async def test_rate_limiter_counts_multiple_requests_in_same_second(monkeypatch):
    fake_redis = _FakeRedis()
    monkeypatch.setattr(rate_limit, "from_url", lambda _url: fake_redis)
    monkeypatch.setattr(rate_limit.time, "time", lambda: 1_000)

    limiter = rate_limit.RedisRateLimiter(max_requests=2, window_seconds=60)

    await limiter.check("ratelimit:test")
    await limiter.check("ratelimit:test")
    with pytest.raises(RateLimitException):
        await limiter.check("ratelimit:test")


def test_plot_status_must_be_known_enum_value():
    with pytest.raises(ValidationError):
        PlotCreate(cadastral_number="99:99:9999999:1", status="not-a-real-status")


def test_settings_ignore_legacy_landsearch_env_keys(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "LANDSEARCH_DATABASE_URL=postgresql+asyncpg://user:pass@localhost/db",
                "LANDSEARCH_SECRET_KEY=test-secret",
                "LANDSEARCH_AUTO_ENRICH_ON_CREATE=false",
            ]
        ),
        encoding="utf-8",
    )

    settings = Settings(_env_file=env_file)

    assert settings.database_url == "postgresql+asyncpg://user:pass@localhost/db"


@pytest.mark.asyncio
async def test_create_plot_rejects_invalid_settlement_id_as_bad_request():
    body = PlotCreate(
        cadastral_number="99:99:9999999:2",
        settlement_id="not-a-uuid",
    )

    with pytest.raises(BadRequestException):
        await plots_api.create_plot(
            body=body,
            current_user=SimpleNamespace(tenant_id=uuid4()),
            session=object(),
        )


class _NoSettlementSession:
    async def execute(self, _stmt):
        return _ScalarResult(None)


@pytest.mark.asyncio
async def test_create_plot_rejects_settlement_from_another_tenant():
    body = PlotCreate(
        cadastral_number="99:99:9999999:3",
        settlement_id=str(uuid4()),
    )

    with pytest.raises(NotFoundException):
        await plots_api.create_plot(
            body=body,
            current_user=SimpleNamespace(tenant_id=uuid4()),
            session=_NoSettlementSession(),
        )
