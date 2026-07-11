import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_search_suggest(client: AsyncClient):
    res = await client.get("/api/v1/search/suggest?q=50")
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    assert len(data["results"]) > 0
    for r in data["results"]:
        assert "type" in r
        assert "id" in r
        assert "label" in r
        assert "value" in r


@pytest.mark.asyncio
async def test_search_suggest_empty(client: AsyncClient):
    res = await client.get("/api/v1/search/suggest?q=ZZZZNOTEXISTENT")
    assert res.status_code == 200
    data = res.json()
    assert len(data["results"]) == 0


@pytest.mark.asyncio
async def test_search_suggest_ignores_short_and_blank_queries(client: AsyncClient):
    short_res = await client.get("/api/v1/search/suggest?q=5")
    padded_short_res = await client.get("/api/v1/search/suggest?q=%205%20")
    blank_res = await client.get("/api/v1/search/suggest?q=%20%20%20")

    assert short_res.status_code == 200
    assert padded_short_res.status_code == 200
    assert blank_res.status_code == 200
    assert short_res.json()["results"] == []
    assert padded_short_res.json()["results"] == []
    assert blank_res.json()["results"] == []


@pytest.mark.asyncio
async def test_search_suggest_finds_land_by_cadastral_number(client: AsyncClient):
    res = await client.get("/api/v1/search/suggest?q=50:23:0010201:1")

    assert res.status_code == 200
    results = res.json()["results"]
    assert any(
        item["type"] == "plot" and item["value"] == "50:23:0010201:1"
        for item in results
    )


@pytest.mark.asyncio
async def test_search_suggest_finds_land_by_address(client: AsyncClient):
    res = await client.get("/api/v1/search/suggest?q=Берёзовая")

    assert res.status_code == 200
    results = res.json()["results"]
    assert any(
        item["type"] == "plot" and "Берёзовая" in item["label"]
        for item in results
    )


@pytest.mark.asyncio
async def test_search_suggest_finds_land_and_settlement_by_name(client: AsyncClient):
    res = await client.get("/api/v1/search/suggest?q=Серебряный%20Ключ")

    assert res.status_code == 200
    result_types = {item["type"] for item in res.json()["results"]}
    assert {"plot", "settlement"}.issubset(result_types)


@pytest.mark.asyncio
async def test_search_suggest_limit_caps_total_results(client: AsyncClient):
    res = await client.get("/api/v1/search/suggest?q=Серебряный&limit=1")

    assert res.status_code == 200
    assert len(res.json()["results"]) <= 1


@pytest.mark.asyncio
async def test_land_search_finds_free_plots_by_full_settlement_name(client: AsyncClient):
    res = await client.get(
        "/api/v1/plots",
        params={
            "query": "Коттеджный посёлок Серебряный Ключ",
            "status": "free",
            "page_size": "50",
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    assert all(item["status"] == "free" for item in data["items"])
    assert all("Серебряный Ключ" in (item["address"] or "") for item in data["items"])


@pytest.mark.asyncio
async def test_map_geo_search_filters_free_plots_by_settlement_name(client: AsyncClient):
    settlements_res = await client.get("/api/v1/settlements")
    assert settlements_res.status_code == 200
    settlement_id = next(
        item["id"]
        for item in settlements_res.json()
        if item["name"] == "Коттеджный посёлок Серебряный Ключ"
    )

    res = await client.get(
        "/api/v1/plots/geo",
        params={
            "query": "Коттеджный посёлок Серебряный Ключ",
            "status": "free",
        },
    )

    assert res.status_code == 200
    features = res.json()["features"]
    assert len(features) > 0
    assert all(feature["properties"]["status"] == "free" for feature in features)
    assert all(feature["properties"]["settlement_id"] == settlement_id for feature in features)
