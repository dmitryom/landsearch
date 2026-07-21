from types import SimpleNamespace

from app.utils.plot_helpers import plot_data_quality


def test_plot_data_quality_distinguishes_nspd_provenance_and_missing_fields():
    plot = SimpleNamespace(
        geometry=object(),
        cadastral_number="16:24:090704:5600",
        imported_from="nspd",
        category="Земли населённых пунктов",
        permitted_use="ИЖС",
        plot_metadata={
            "nspd": {"cad_num": "16:24:090704:5600"},
            "nspd_fetched_at": "2026-07-21T10:00:00+00:00",
            "status_updated_at": "2026-07-21T11:00:00+00:00",
        },
    )

    quality = plot_data_quality(plot)

    assert quality["data_source"] == "nspd"
    assert quality["geometry_quality"] == "verified"
    assert quality["is_publishable"] is True
    assert quality["source_fetched_at"].isoformat() == "2026-07-21T10:00:00+00:00"
    assert quality["data_quality_issues"] == []


def test_plot_data_quality_reports_unverified_geometry():
    plot = SimpleNamespace(
        geometry=object(),
        cadastral_number="16:24:090704:5601",
        imported_from="excel",
        category=None,
        permitted_use=None,
        plot_metadata={},
    )

    quality = plot_data_quality(plot)

    assert quality["geometry_quality"] == "manual"
    assert quality["is_publishable"] is True
    assert "Источник геометрии не подтвержден НСПД" in quality["data_quality_issues"]
    assert "Не указан ВРИ" in quality["data_quality_issues"]
