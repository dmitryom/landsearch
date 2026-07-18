from types import SimpleNamespace
from uuid import uuid4

import pytest
from shapely.geometry import Point, box

from app.models import Plot, PlotStatus
from app.services import cadastre
from app.services.cadastre import _apply_enrichment


def test_nspd_snapshot_overwrites_cadastral_fields_but_preserves_listing_fields():
    geometry = object()
    plot = SimpleNamespace(
        cadastral_number="16:24:000000:1",
        address="старый адрес",
        area_m2=100.0,
        category="старая категория",
        permitted_use="старый ВРИ",
        cadastral_value=100.0,
        cad_unit="старый квартал",
        cad_status="старый статус",
        object_type="старый объект",
        land_plot_type="старый участок",
        registration_date="2000-01-01",
        ownership_form="старая форма",
        geometry=None,
        imported_from="csv",
        price=2500000.0,
        status="free",
        price_per_hectare=None,
        plot_metadata={},
    )

    _apply_enrichment(
        plot,
        {
            "cad_num": "16:24:000000:2",
            "address": "актуальный адрес",
            "area_m2": 200.0,
            "category": "актуальная категория",
            "permitted_use": "актуальный ВРИ",
            "cost_value": 200.0,
            "cad_unit": "актуальный квартал",
            "cad_status": "актуальный статус",
            "object_type": "актуальный объект",
            "land_plot_type": "актуальный участок",
            "registration_date": "2026-01-01",
            "ownership_form": "актуальная форма",
        },
        geometry,
    )

    assert plot.cadastral_number == "16:24:000000:2"
    assert plot.address == "актуальный адрес"
    assert plot.area_m2 == 200.0
    assert plot.category == "актуальная категория"
    assert plot.permitted_use == "актуальный ВРИ"
    assert plot.cadastral_value == 200.0
    assert plot.geometry is geometry
    assert plot.imported_from == "nspd"
    assert plot.price == 2500000.0
    assert plot.status == "free"


class _ExistingPlotResult:
    def __init__(self, plot):
        self.plot = plot

    def scalars(self):
        return [self.plot]


class _ExistingPlotSession:
    def __init__(self, plot):
        self.plot = plot

    async def execute(self, _statement):
        return _ExistingPlotResult(self.plot)

    def add(self, _plot):
        raise AssertionError("Existing cadastral plot must be reused")


class _FeatureGeometry:
    def __init__(self, geometry):
        self.geometry = geometry

    def to_shape(self):
        return self.geometry


class _Feature:
    def __init__(self, cadastral_number, geometry):
        self.cadastral_number = cadastral_number
        self.geometry = _FeatureGeometry(geometry)


class _FeatureNspd:
    features = []

    def __init__(self, **_kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def search_landplots_in_contour(self, _contour):
        return self.features


class _CollectingPlotSession:
    def __init__(self):
        self.added = []

    async def execute(self, _statement):
        return SimpleNamespace(scalars=lambda: [])

    def add(self, plot):
        self.added.append(plot)


@pytest.mark.asyncio
async def test_contour_import_reactivates_existing_deleted_plot(monkeypatch):
    tenant_id = uuid4()
    settlement_id = uuid4()
    plot = Plot(
        tenant_id=tenant_id,
        settlement_id=settlement_id,
        cadastral_number="16:24:090704:5600",
        status=PlotStatus.free,
        imported_from="nspd",
        is_active=False,
    )
    _FeatureNspd.features = [_Feature(plot.cadastral_number, box(1, 1, 2, 2))]
    monkeypatch.setattr(cadastre, "_NSPD_AVAILABLE", True)
    monkeypatch.setattr(cadastre, "Nspd", _FeatureNspd)
    monkeypatch.setattr(cadastre, "_wait_cooldown", lambda: None)
    monkeypatch.setattr(cadastre, "_register_success", lambda: None)
    monkeypatch.setattr(
        cadastre,
        "_extract_feature_data",
        lambda feature: {"cad_num": feature.cadastral_number},
    )

    result = await cadastre.import_landplots_in_contour(
        _ExistingPlotSession(plot),
        tenant_id,
        settlement_id,
        contour=box(0, 0, 10, 10),
    )

    assert result == {"found": 1, "imported": 0, "updated": 1, "skipped": 0, "excluded": 0}
    assert plot.is_active is True


@pytest.mark.asyncio
async def test_contour_import_only_accepts_parcels_fully_inside_boundary(monkeypatch):
    tenant_id = uuid4()
    settlement_id = uuid4()
    _FeatureNspd.features = [
        _Feature("16:24:000001:1", box(1, 1, 2, 2)),
        _Feature("16:24:000001:2", box(9, 9, 11, 11)),
        _Feature("16:24:000001:3", box(10, 3, 11, 4)),
    ]
    session = _CollectingPlotSession()
    monkeypatch.setattr(cadastre, "_NSPD_AVAILABLE", True)
    monkeypatch.setattr(cadastre, "Nspd", _FeatureNspd)
    monkeypatch.setattr(cadastre, "_wait_cooldown", lambda: None)
    monkeypatch.setattr(cadastre, "_register_success", lambda: None)
    monkeypatch.setattr(
        cadastre,
        "_extract_feature_data",
        lambda feature: {"cad_num": feature.cadastral_number},
    )

    result = await cadastre.import_landplots_in_contour(
        session,
        tenant_id,
        settlement_id,
        contour=box(0, 0, 10, 10),
    )

    assert result == {"found": 3, "imported": 1, "updated": 0, "skipped": 0, "excluded": 2}
    assert [plot.cadastral_number for plot in session.added] == ["16:24:000001:1"]


@pytest.mark.asyncio
async def test_radius_import_only_accepts_parcels_fully_inside_circle(monkeypatch):
    tenant_id = uuid4()
    settlement_id = uuid4()
    _FeatureNspd.features = [
        _Feature("16:24:000002:1", Point(0, 0).buffer(1)),
        _Feature("16:24:000002:2", Point(9.5, 0).buffer(1)),
        _Feature("16:24:000002:3", Point(11, 0).buffer(1)),
    ]
    session = _CollectingPlotSession()
    monkeypatch.setattr(cadastre, "_NSPD_AVAILABLE", True)
    monkeypatch.setattr(cadastre, "Nspd", _FeatureNspd)
    monkeypatch.setattr(cadastre, "_wait_cooldown", lambda: None)
    monkeypatch.setattr(cadastre, "_register_success", lambda: None)
    monkeypatch.setattr(
        cadastre,
        "_extract_feature_data",
        lambda feature: {"cad_num": feature.cadastral_number},
    )

    result = await cadastre.import_landplots_in_contour(
        session,
        tenant_id,
        settlement_id,
        contour=Point(0, 0).buffer(10),
    )

    assert result == {"found": 3, "imported": 1, "updated": 0, "skipped": 0, "excluded": 2}
    assert [plot.cadastral_number for plot in session.added] == ["16:24:000002:1"]
