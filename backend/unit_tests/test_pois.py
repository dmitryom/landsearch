import inspect
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import CheckConstraint

from app.api.v1 import pois as pois_api
from app.models import SettlementPoi
from app.schemas import PoiType, SettlementPoiCreate, SettlementPoiUpdate


def test_other_poi_requires_custom_type_label():
    with pytest.raises(ValidationError):
        SettlementPoiCreate(
            settlement_id=str(uuid4()),
            poi_type="other",
            name="Объект",
            longitude=49.1,
            latitude=55.7,
        )


def test_public_pois_are_published_and_not_settlement_filtered():
    source = inspect.getsource(pois_api.list_public_pois)

    assert "SettlementPoi.is_published" in source
    assert "Settlement.tenant_id == tenant_id" in source
    assert "settlement_id" not in inspect.signature(pois_api.list_public_pois).parameters


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _TenantSession:
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _ScalarResult(self.tenant_id)


@pytest.mark.asyncio
async def test_public_poi_tenant_resolves_from_configured_slug_independent_of_user(monkeypatch):
    public_tenant_id = uuid4()
    authenticated_user = SimpleNamespace(tenant_id=uuid4())
    session = _TenantSession(public_tenant_id)
    monkeypatch.setattr(pois_api.settings, "public_tenant_slug", "public-map")

    resolved = await pois_api.get_public_poi_tenant_scope(session=session)

    assert resolved == public_tenant_id
    assert resolved != authenticated_user.tenant_id
    assert "tenants.slug" in str(session.statement)
    assert "tenants.is_active" in str(session.statement)


def test_public_pois_use_dedicated_tenant_dependency_without_authentication():
    parameter = inspect.signature(pois_api.list_public_pois).parameters["tenant_id"]

    assert parameter.default.dependency is pois_api.get_public_poi_tenant_scope
    assert "get_tenant_scope_optional" not in inspect.getsource(pois_api.list_public_pois)


@pytest.mark.parametrize(
    "field",
    ["poi_type", "name", "longitude", "latitude", "is_published"],
)
def test_poi_patch_rejects_explicit_null_for_non_nullable_fields(field):
    with pytest.raises(ValidationError):
        SettlementPoiUpdate.model_validate({field: None})


def test_poi_patch_allows_non_nullable_fields_to_be_omitted():
    update = SettlementPoiUpdate(description=None)

    assert update.model_fields_set == {"description"}


def test_settlement_poi_model_enforces_database_invariants():
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in SettlementPoi.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert set(checks) == {
        "ck_settlement_pois_poi_type",
        "ck_settlement_pois_name_not_blank",
        "ck_settlement_pois_other_label",
    }
    for poi_type in PoiType:
        assert f"'{poi_type.value}'" in checks["ck_settlement_pois_poi_type"]
    assert "btrim(name) <> ''" in checks["ck_settlement_pois_name_not_blank"]
    assert "poi_type <> 'other'" in checks["ck_settlement_pois_other_label"]
    assert "btrim(custom_type_label) <> ''" in checks["ck_settlement_pois_other_label"]


def test_settlement_poi_migration_mirrors_model_check_constraints():
    migration = (
        Path(__file__).parents[1]
        / "alembic/versions/d91f7c3a2b10_add_settlement_pois.py"
    ).read_text(encoding="utf-8")

    assert 'name="ck_settlement_pois_poi_type"' in migration
    assert 'name="ck_settlement_pois_name_not_blank"' in migration
    assert 'name="ck_settlement_pois_other_label"' in migration


class _FakeRedis:
    def __init__(self, cached=None, fail_ping=False, fail_get=False, fail_set=False, fail_scan=False):
        self.cached = cached
        self.fail_ping = fail_ping
        self.fail_get = fail_get
        self.fail_set = fail_set
        self.fail_scan = fail_scan
        self.closed = False

    async def ping(self):
        if self.fail_ping:
            raise ConnectionError("ping failed")

    async def get(self, _key):
        if self.fail_get:
            raise ConnectionError("get failed")
        return self.cached

    async def setex(self, _key, _ttl, _value):
        if self.fail_set:
            raise ConnectionError("set failed")

    async def scan_iter(self, **_kwargs):
        if self.fail_scan:
            raise ConnectionError("scan failed")
        if False:
            yield None

    async def delete(self, *_keys):
        return None

    async def aclose(self):
        self.closed = True


class _RowsResult:
    def all(self):
        return []


class _RowsSession:
    async def execute(self, _statement):
        return _RowsResult()


@pytest.mark.asyncio
async def test_redis_client_is_closed_when_ping_fails(monkeypatch):
    cache = _FakeRedis(fail_ping=True)
    monkeypatch.setattr(pois_api.aioredis, "from_url", lambda *_args, **_kwargs: cache)

    result = await pois_api._get_redis()

    assert result is None
    assert cache.closed


@pytest.mark.asyncio
async def test_public_poi_cache_hit_closes_redis(monkeypatch):
    cache = _FakeRedis(cached='{"type":"FeatureCollection","features":[]}')

    async def get_cache():
        return cache

    monkeypatch.setattr(pois_api, "_get_redis", get_cache)

    response = await pois_api.list_public_pois(
        bbox="48.0,55.0,50.0,56.0",
        types=None,
        session=object(),
        tenant_id=uuid4(),
    )

    assert response == {"type": "FeatureCollection", "features": []}
    assert cache.closed


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["get", "set"])
async def test_public_poi_cache_failures_remain_fail_open_and_close(monkeypatch, failure):
    cache = _FakeRedis(fail_get=failure == "get", fail_set=failure == "set")

    async def get_cache():
        return cache

    monkeypatch.setattr(pois_api, "_get_redis", get_cache)

    response = await pois_api.list_public_pois(
        bbox="48.0,55.0,50.0,56.0",
        types=None,
        session=_RowsSession(),
        tenant_id=uuid4(),
    )

    assert response == {"type": "FeatureCollection", "features": []}
    assert cache.closed


@pytest.mark.asyncio
async def test_poi_cache_invalidation_failure_warns_and_closes(monkeypatch, caplog):
    cache = _FakeRedis(fail_scan=True)

    async def get_cache():
        return cache

    monkeypatch.setattr(pois_api, "_get_redis", get_cache)

    with caplog.at_level("WARNING"):
        await pois_api._invalidate_poi_cache(uuid4())

    assert "Failed to invalidate POI cache" in caplog.text
    assert cache.closed
