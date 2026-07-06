import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_lead(client: AsyncClient):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot_id = list_res.json()["items"][0]["id"]
    unique_email = f"ivan{uuid.uuid4().hex[:8]}@example.com"

    res = await client.post(
        "/api/v1/leads",
        json={
            "plot_id": plot_id,
            "buyer_name": "Иван Петров",
            "buyer_phone": "+7 (999) 123-45-67",
            "buyer_email": unique_email,
            "message": "Хочу купить участок",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "ok"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_lead_nonexistent_plot(client: AsyncClient):
    res = await client.post(
        "/api/v1/leads",
        json={
            "plot_id": "00000000-0000-0000-0000-000000000000",
            "buyer_name": "Test",
            "buyer_phone": "+7 (999) 999-99-99",
        },
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_list_leads(client: AsyncClient, auth_headers: dict[str, str]):
    res = await client.get("/api/v1/leads", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_list_leads_unauthorized(client: AsyncClient):
    res = await client.get("/api/v1/leads")
    assert res.status_code == 401
