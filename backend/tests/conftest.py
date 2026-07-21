import asyncio
import os
from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# The integration suite targets the local PostGIS service from docker-compose.
# Keep production settings fail-closed while making `pytest` runnable without a
# developer-specific backend/.env file.
_test_env_defaults = {
    "LANDSEARCH_DATABASE_URL": "postgresql+asyncpg://postgres:postgres@localhost:5432/landsearch",
    "LANDSEARCH_SECRET_KEY": "test-only-secret",
}
_test_env_added = []
for _name, _value in _test_env_defaults.items():
    if _name not in os.environ:
        os.environ[_name] = _value
        _test_env_added.append(_name)

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import get_session  # noqa: E402

test_engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

for _name in _test_env_added:
    os.environ.pop(_name, None)


async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_session] = override_get_session


@pytest.fixture
def db_session_factory():
    return test_session_factory


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app, client=(f"pytest-{uuid4().hex}", 123))
    async with AsyncClient(transport=transport, base_url="https://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.landsearch", "password": "demo123456"},
    )
    assert res.status_code == 200
    assert res.cookies.get("landsearch_session")
    # Authentication is intentionally cookie-based in production. The client
    # keeps the HttpOnly session cookie for subsequent requests.
    return {}
