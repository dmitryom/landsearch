from geoalchemy2 import shape
from shapely.geometry import mapping

from ..models import Plot, PlotStatus
from ..schemas import PlotResponse
from ..services.vri import normalize_vri


def plot_to_response(plot: Plot) -> PlotResponse:
    geom = None
    center_lng = None
    center_lat = None
    if plot.geometry:
        try:
            shp = shape.to_shape(plot.geometry)
            geom = mapping(shp)
            c = shp.centroid
            center_lng, center_lat = c.x, c.y
        except Exception:
            pass

    settlement_id = None
    if plot.settlement_id:
        settlement_id = str(plot.settlement_id)

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
        is_active=plot.is_active,
        created_at=plot.created_at,
        updated_at=plot.updated_at,
    )
