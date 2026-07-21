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
            "consent_given": True,
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
            "consent_given": True,
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
async def test_list_leads_includes_plot_metadata(client: AsyncClient, auth_headers: dict[str, str]):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot = list_res.json()["items"][0]
    unique_email = f"metadata{uuid.uuid4().hex[:8]}@example.com"

    create_res = await client.post(
        "/api/v1/leads",
        json={
            "plot_id": plot["id"],
            "buyer_name": "Анна Смирнова",
            "buyer_phone": "+7 (999) 000-11-22",
            "buyer_email": unique_email,
            "consent_given": True,
        },
    )
    assert create_res.status_code == 201
    lead_id = create_res.json()["id"]

    res = await client.get("/api/v1/leads", headers=auth_headers)
    assert res.status_code == 200
    lead = next(item for item in res.json() if item["id"] == lead_id)

    assert lead["plot_cadastral_number"] == plot["cadastral_number"]
    assert lead["plot_title"] == plot["title"]
    assert lead["plot_status"] == plot["status"]
    assert lead["plot_price"] == plot["price"]


@pytest.mark.asyncio
async def test_update_lead_status(client: AsyncClient, auth_headers: dict[str, str]):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot_id = list_res.json()["items"][0]["id"]
    unique_email = f"status{uuid.uuid4().hex[:8]}@example.com"

    create_res = await client.post(
        "/api/v1/leads",
        json={
            "plot_id": plot_id,
            "buyer_name": "Пётр Иванов",
            "buyer_phone": "+7 (999) 222-33-44",
            "buyer_email": unique_email,
            "consent_given": True,
        },
    )
    assert create_res.status_code == 201
    lead_id = create_res.json()["id"]

    res = await client.patch(
        f"/api/v1/leads/{lead_id}",
        json={"status": "in_progress"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == lead_id
    assert data["status"] == "in_progress"
    assert data["plot_id"] == plot_id


@pytest.mark.asyncio
async def test_update_lead_status_rejects_unknown_status(client: AsyncClient, auth_headers: dict[str, str]):
    res = await client.patch(
        "/api/v1/leads/00000000-0000-0000-0000-000000000000",
        json={"status": "invalid"},
        headers=auth_headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_leads_unauthorized(client: AsyncClient):
    res = await client.get("/api/v1/leads")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_create_lead_requires_personal_data_consent(client: AsyncClient):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot_id = list_res.json()["items"][0]["id"]
    res = await client.post(
        "/api/v1/leads",
        json={
            "plot_id": plot_id,
            "buyer_phone": "+7 (999) 111-22-33",
            "consent_given": False,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_lead_assignment_and_first_response_are_tracked(client: AsyncClient, auth_headers: dict[str, str]):
    plot = (await client.get("/api/v1/plots?page_size=1")).json()["items"][0]
    create_res = await client.post(
        "/api/v1/leads",
        json={
            "plot_id": plot["id"],
            "buyer_name": "Оператор пилота",
            "buyer_phone": "+7 (999) 333-44-55",
            "buyer_email": f"assignment{uuid.uuid4().hex[:8]}@example.com",
            "consent_given": True,
        },
    )
    assert create_res.status_code == 201
    lead_id = create_res.json()["id"]

    assignees = await client.get("/api/v1/leads/assignees", headers=auth_headers)
    assert assignees.status_code == 200
    assert assignees.json()

    assigned = await client.patch(
        f"/api/v1/leads/{lead_id}/assign",
        json={"assigned_user_id": assignees.json()[0]["id"]},
        headers=auth_headers,
    )
    assert assigned.status_code == 200
    assert assigned.json()["assigned_user_id"] == assignees.json()[0]["id"]

    in_progress = await client.patch(
        f"/api/v1/leads/{lead_id}",
        json={"status": "in_progress"},
        headers=auth_headers,
    )
    assert in_progress.status_code == 200
    assert in_progress.json()["first_response_at"]
    assert in_progress.json()["response_due_at"] is None
