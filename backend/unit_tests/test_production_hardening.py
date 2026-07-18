from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.deps import _resolve_user
from app.api.v1 import auth as auth_api
from app.api.v1 import plots as plots_api
from app.core import rate_limit
from app.core.config import Settings
from app.core.exceptions import BadRequestException, NotFoundException, RateLimitException, UnauthorizedException
from app.core.security import create_refresh_token
from app.schemas import LoginRequest, PlotCreate, PlotUpdate


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


def test_plot_update_keeps_nspd_fields_read_only():
    with pytest.raises(ValidationError):
        PlotUpdate(address="ручное изменение кадастрового адреса")

    update = PlotUpdate(price=2500000, status="reserved")
    assert update.price == 2500000
    assert update.status.value == "reserved"


def test_settings_ignore_legacy_landsearch_env_keys(tmp_path, monkeypatch):
    monkeypatch.delenv("LANDSEARCH_DATABASE_URL", raising=False)
    monkeypatch.delenv("LANDSEARCH_SECRET_KEY", raising=False)
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


class _SingleUserSession:
    def __init__(self, user):
        self.user = user

    async def execute(self, _stmt):
        return _ScalarResult(self.user)


@pytest.mark.asyncio
async def test_login_rejects_inactive_user_with_valid_password(monkeypatch):
    inactive_user = SimpleNamespace(
        id=uuid4(),
        email="inactive@example.com",
        password_hash="stored-hash",
        full_name="Inactive User",
        role=SimpleNamespace(value="admin"),
        is_active=False,
    )
    monkeypatch.setattr(auth_api, "verify_password", lambda _password, _hash: True)

    with pytest.raises(UnauthorizedException):
        await auth_api.login(
            body=LoginRequest(email=inactive_user.email, password="correct-password"),
            session=_SingleUserSession(inactive_user),
        )


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


class _TileResult:
    def scalar(self):
        return b"tile-data"


class _TileSession:
    def __init__(self):
        self.statement = ""
        self.params = {}

    async def execute(self, statement, params):
        self.statement = str(statement)
        self.params = params
        return _TileResult()


class _TileCache:
    def __init__(self):
        self.get_keys = []

    async def get(self, key):
        self.get_keys.append(key)
        return None

    async def setex(self, _key, _ttl, _value):
        return None


@pytest.mark.asyncio
async def test_plot_tiles_filters_vector_layer_by_settlement_id(monkeypatch):
    cache = _TileCache()

    async def tile_cache():
        return cache

    session = _TileSession()
    tenant_id = uuid4()
    settlement_id = uuid4()
    monkeypatch.setattr(plots_api, "_get_redis", tile_cache)

    await plots_api.plot_tiles(
        z=12,
        x=2048,
        y=1364,
        settlement_id=str(settlement_id),
        session=session,
        tenant_id=tenant_id,
    )

    assert "boundary.id = :settlement_id" in session.statement
    assert "ST_Intersects(p.geometry, boundary.geometry)" in session.statement
    assert session.params["settlement_id"] == settlement_id

    await plots_api.plot_tiles(
        z=12,
        x=2048,
        y=1364,
        settlement_id=str(uuid4()),
        session=_TileSession(),
        tenant_id=tenant_id,
    )

    assert cache.get_keys[0] != cache.get_keys[1]
