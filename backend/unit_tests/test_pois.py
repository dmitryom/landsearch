import inspect
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1 import pois as pois_api
from app.schemas import SettlementPoiCreate


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
