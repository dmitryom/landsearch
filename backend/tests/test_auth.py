import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.landsearch", "password": "demo123456"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "admin@demo.landsearch"
    cookie = res.cookies.get("landsearch_session")
    assert cookie
    assert res.cookies.get("landsearch_refresh")
    assert "HttpOnly" in res.headers["set-cookie"]
    assert "SameSite=lax" in res.headers["set-cookie"]

    me_res = await client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "admin@demo.landsearch"


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient):
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.landsearch", "password": "wrong"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@test.com", "password": "test123456"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, auth_headers: dict[str, str]):
    res = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "admin@demo.landsearch"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.landsearch", "password": "demo123456"},
    )
    assert login_res.cookies.get("landsearch_refresh")

    res = await client.post(
        "/api/v1/auth/refresh",
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "admin@demo.landsearch"
    assert res.cookies.get("landsearch_session")


@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient):
    res = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "invalid_token"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    email = f"newuser{uuid.uuid4().hex[:8]}@test.com"
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "test123456",
            "full_name": "Test User",
            "terms_accepted": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == email
    assert res.cookies.get("landsearch_session")


@pytest.mark.asyncio
async def test_register_requires_terms_acceptance(client: AsyncClient):
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"no-consent-{uuid.uuid4().hex[:8]}@test.com",
            "password": "test123456",
            "full_name": "Test User",
            "terms_accepted": False,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_logout_clears_browser_session(client: AsyncClient):
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@demo.landsearch", "password": "demo123456"},
    )
    assert login_res.status_code == 200
    logout_res = await client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 204
    assert "landsearch_session=\"\"" in logout_res.headers["set-cookie"]
