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
