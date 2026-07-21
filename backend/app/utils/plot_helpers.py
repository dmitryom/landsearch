from geoalchemy2 import shape
from shapely.geometry import mapping
from datetime import datetime

from ..models import Plot, PlotStatus
from ..schemas import PlotResponse
from ..services.vri import normalize_vri


def _parse_metadata_datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def plot_data_quality(plot: Plot, *, has_geometry: bool | None = None) -> dict:
    """Expose provenance and publishability without treating updated_at as NSPD time."""
    metadata = plot.plot_metadata if isinstance(plot.plot_metadata, dict) else {}
    nspd_snapshot = metadata.get("nspd") if isinstance(metadata.get("nspd"), dict) else {}
    geometry_present = bool(plot.geometry) if has_geometry is None else has_geometry
    source = str(plot.imported_from or metadata.get("source") or "unknown")
    issues: list[str] = []
    if not geometry_present:
        issues.append("Кадастровая геометрия отсутствует")
    if source != "nspd":
        issues.append("Источник геометрии не подтвержден НСПД")
    if not plot.category:
        issues.append("Не указана категория земель")
    if not plot.permitted_use:
        issues.append("Не указан ВРИ")

    if geometry_present and source == "nspd":
        geometry_quality = "verified"
    elif geometry_present:
        geometry_quality = "manual"
    else:
        geometry_quality = "missing"

    return {
        "data_source": "nspd" if source == "nspd" else source,
        "source_fetched_at": _parse_metadata_datetime(
            metadata.get("nspd_fetched_at") or metadata.get("source_fetched_at")
        ),
        "commercial_updated_at": _parse_metadata_datetime(metadata.get("commercial_updated_at")),
        "status_updated_at": _parse_metadata_datetime(metadata.get("status_updated_at")),
        "geometry_quality": geometry_quality,
        "data_quality_issues": issues,
        "is_publishable": geometry_present and bool(plot.cadastral_number),
        "nspd_snapshot_available": bool(nspd_snapshot),
    }


def plot_to_response(plot: Plot, *, include_geometry: bool = True) -> PlotResponse:
    geom = None
    center_lng = None
    center_lat = None
    if plot.geometry:
        try:
            shp = shape.to_shape(plot.geometry)
            if include_geometry:
                geom = mapping(shp)
            c = shp.centroid
            center_lng, center_lat = c.x, c.y
        except Exception:
            pass

    settlement_id = None
    if plot.settlement_id:
        settlement_id = str(plot.settlement_id)

    quality = plot_data_quality(plot, has_geometry=bool(plot.geometry))
    return PlotResponse(
        id=str(plot.id),
        tenant_id=str(plot.tenant_id),
        cadastral_number=plot.cadastral_number,
        address=plot.address,
        area_m2=plot.area_m2,
        category=plot.category,
        permitted_use=plot.permitted_use,
        cadastral_value=plot.cadastral_value,
        cad_unit=plot.cad_unit,
        cad_status=plot.cad_status,
        object_type=plot.object_type,
        land_plot_type=plot.land_plot_type,
        registration_date=plot.registration_date,
        ownership_form=plot.ownership_form,
        price=plot.price,
        price_per_hectare=plot.price_per_hectare,
        status=plot.status.value if isinstance(plot.status, PlotStatus) else plot.status,
        title=plot.title,
        description=plot.description,
        geometry=geom,
        center_lng=center_lng,
        center_lat=center_lat,
        settlement_id=settlement_id,
        vri_code=normalize_vri(plot.permitted_use),
        data_source=quality["data_source"],
        source_fetched_at=quality["source_fetched_at"],
        commercial_updated_at=quality["commercial_updated_at"] or plot.updated_at,
        status_updated_at=quality["status_updated_at"],
        geometry_quality=quality["geometry_quality"],
        data_quality_issues=quality["data_quality_issues"],
        is_publishable=quality["is_publishable"],
        is_active=plot.is_active,
        created_at=plot.created_at,
        updated_at=plot.updated_at,
    )
