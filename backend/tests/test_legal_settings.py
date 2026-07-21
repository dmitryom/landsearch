import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_public_legal_profile_and_admin_update(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    payload = {
        "operator_name": "ООО Тестовый оператор",
        "legal_form": "Общество с ограниченной ответственностью",
        "inn": "1650000000",
        "ogrn": "1161600000000",
        "address": "420000, Республика Татарстан, г. Казань",
        "email": "privacy@example.ru",
        "phone": "+7 843 000-00-00",
        "rkn_registry_number": "16-00-000000",
        "rkn_registry_url": "https://pd.rkn.gov.ru/operators-registry/operators-list/",
        "policy_effective_date": "2026-07-20",
        "lead_retention_days": 365,
        "reservation_retention_days": 365,
    }

    update_res = await client.put(
        "/api/v1/settings/legal",
        json=payload,
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["is_complete"] is True

    public_res = await client.get("/api/v1/legal")
    assert public_res.status_code == 200
    data = public_res.json()
    assert data["operator_name"] == payload["operator_name"]
    assert data["inn"] == payload["inn"]
    assert data["is_complete"] is True


@pytest.mark.asyncio
async def test_legal_profile_update_requires_admin(client: AsyncClient):
    res = await client.put(
        "/api/v1/settings/legal",
        json={"operator_name": "Недопустимое изменение"},
    )
    assert res.status_code == 401
