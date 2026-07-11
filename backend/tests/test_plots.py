import uuid

import pytest
from httpx import AsyncClient


def _unique_cn() -> str:
    return f"99:99:9999999:{uuid.uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_list_plots(client: AsyncClient):
    res = await client.get("/api/v1/plots")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] > 0
    assert len(data["items"]) > 0


@pytest.mark.asyncio
async def test_list_plots_with_filters(client: AsyncClient):
    res = await client.get("/api/v1/plots?status=free&page_size=5")
    assert res.status_code == 200
    data = res.json()
    assert all(p["status"] == "free" for p in data["items"])


@pytest.mark.asyncio
async def test_list_plots_filters_by_category(client: AsyncClient, auth_headers: dict[str, str]):
    cn = _unique_cn()
    create_res = await client.post(
        "/api/v1/plots",
        json={
            "cadastral_number": cn,
            "price": 1000000,
            "area_m2": 900,
            "status": "free",
            "category": "Земли промышленности",
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 201

    res = await client.get("/api/v1/plots?category=промышленности&page_size=20")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert any(plot["cadastral_number"] == cn for plot in data["items"])
    assert all("промышленности" in (plot["category"] or "").lower() for plot in data["items"])


@pytest.mark.asyncio
async def test_get_plot_by_id(client: AsyncClient):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot_id = list_res.json()["items"][0]["id"]

    res = await client.get(f"/api/v1/plots/{plot_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == plot_id
    assert "cadastral_number" in data
    assert "price" in data


@pytest.mark.asyncio
async def test_get_plot_not_found(client: AsyncClient):
    res = await client.get("/api/v1/plots/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_plot_invalid_uuid(client: AsyncClient):
    res = await client.get("/api/v1/plots/not-a-uuid")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_plots_geo(client: AsyncClient):
    res = await client.get("/api/v1/plots/geo")
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "FeatureCollection"
    assert "features" in data


@pytest.mark.asyncio
async def test_plot_stats_cover_full_tenant(client: AsyncClient, auth_headers: dict[str, str]):
    list_res = await client.get("/api/v1/plots?page_size=1")
    expected_total = list_res.json()["total"]

    res = await client.get("/api/v1/plots/stats", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == expected_total
    assert data["by_status"]["free"] >= 1
    assert "missing_geometry" in data["data_quality"]
    assert "missing_price" in data["data_quality"]


@pytest.mark.asyncio
async def test_similar_plots(client: AsyncClient):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot_id = list_res.json()["items"][0]["id"]

    res = await client.get(f"/api/v1/plots/{plot_id}/similar")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_plot(client: AsyncClient, auth_headers: dict[str, str]):
    cn = _unique_cn()
    res = await client.post(
        "/api/v1/plots",
        json={
            "cadastral_number": cn,
            "price": 5000000,
            "area_m2": 1000,
            "status": "free",
        },
        headers=auth_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["cadastral_number"] == cn


@pytest.mark.asyncio
async def test_create_plot_unauthorized(client: AsyncClient):
    res = await client.post(
        "/api/v1/plots",
        json={"cadastral_number": "99:99:9999999:998", "price": 1000000},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_update_plot(client: AsyncClient, auth_headers: dict[str, str]):
    list_res = await client.get("/api/v1/plots?page_size=1")
    plot_id = list_res.json()["items"][0]["id"]

    res = await client.patch(
        f"/api/v1/plots/{plot_id}",
        json={"price": 9999999},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["price"] == 9999999


@pytest.mark.asyncio
async def test_delete_plot(client: AsyncClient, auth_headers: dict[str, str]):
    cn = _unique_cn()
    res = await client.post(
        "/api/v1/plots",
        json={"cadastral_number": cn, "price": 1000000},
        headers=auth_headers,
    )
    plot_id = res.json()["id"]

    res = await client.delete(f"/api/v1/plots/{plot_id}", headers=auth_headers)
    assert res.status_code == 204
