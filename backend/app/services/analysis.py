from __future__ import annotations

import logging
from uuid import UUID

from geoalchemy2 import shape
from shapely.ops import unary_union
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Plot, PlotStatus, Settlement, User
from .vri import normalize_vri

logger = logging.getLogger(__name__)


def _get_utm_zone(lon: float) -> int:
    return int((lon + 180) / 6) + 1


def _area_m2(poly) -> float:
    from pyproj import Transformer
    from shapely.ops import transform
    lon = poly.centroid.x
    zone = _get_utm_zone(lon)
    epsg = f"EPSG:326{zone:02d}"
    transformer = Transformer.from_crs("EPSG:4326", epsg, always_xy=True)
    projected = transform(transformer.transform, poly)
    return projected.area


async def _load_plots_for_analysis(
    session: AsyncSession,
    settlement_id: str,
    tenant_id=None,
) -> tuple[Settlement, list[Plot]]:
    stmt = select(Settlement).where(Settlement.id == UUID(settlement_id))
    if tenant_id is not None:
        stmt = stmt.where(Settlement.tenant_id == tenant_id)
    result = await session.execute(stmt)
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise ValueError("Settlement not found")

    stmt = select(Plot).where(
        Plot.settlement_id == UUID(settlement_id),
        Plot.is_active,
    )
    if tenant_id is not None:
        stmt = stmt.where(Plot.tenant_id == tenant_id)
    result = await session.execute(stmt)
    plots = list(result.scalars().all())

    return settlement, plots


def _compute_free_zones(
    boundary_poly,
    plots: list[Plot],
    min_area: float | None,
    max_area: float | None,
) -> tuple[list[dict], float]:
    occupied_polys = []
    for p in plots:
        if p.status != PlotStatus.free and p.geometry:
            try:
                geom = shape.to_shape(p.geometry)
                occupied_polys.append(geom)
            except Exception:
                pass

    union_occupied = unary_union(occupied_polys) if occupied_polys else None

    if union_occupied and not union_occupied.is_empty:
        try:
            free_geom = boundary_poly.difference(union_occupied)
        except Exception:
            free_geom = boundary_poly
    else:
        free_geom = boundary_poly

    free_zones = []
    if free_geom.geom_type == "MultiPolygon":
        for i, poly in enumerate(free_geom.geoms):
            area = _area_m2(poly)
            if min_area and area < min_area:
                continue
            if max_area and area > max_area:
                continue
            free_zones.append({
                "zone_index": i + 1,
                "area_m2": round(area, 2),
                "area_ha": round(area / 10000, 4),
                "centroid": [poly.centroid.y, poly.centroid.x],
            })
    elif free_geom.geom_type == "Polygon":
        area = _area_m2(free_geom)
        if not (min_area and area < min_area) and not (max_area and area > max_area):
            free_zones.append({
                "zone_index": 1,
                "area_m2": round(area, 2),
                "area_ha": round(area / 10000, 4),
                "centroid": [free_geom.centroid.y, free_geom.centroid.x],
            })

    free_area = sum(z["area_m2"] for z in free_zones)
    return free_zones, free_area


def _build_vri_summary(plots: list[Plot]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for p in plots:
        code = normalize_vri(p.permitted_use)
        summary[code] = summary.get(code, 0) + 1
    return summary


def _build_category_summary(plots: list[Plot]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for p in plots:
        cat = p.category or "Не указана"
        summary[cat] = summary.get(cat, 0) + 1
    return summary


def _build_permitted_use_summary(plots: list[Plot]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for p in plots:
        pu = p.permitted_use or "Не указано"
        summary[pu] = summary.get(pu, 0) + 1
    return summary


def _build_status_summary(plots: list[Plot]) -> dict[str, int]:
    return {
        "free": sum(1 for p in plots if p.status == PlotStatus.free),
        "reserved": sum(1 for p in plots if p.status == PlotStatus.reserved),
        "booked": sum(1 for p in plots if p.status == PlotStatus.booked),
        "sold": sum(1 for p in plots if p.status == PlotStatus.sold),
    }


def _build_plot_list(plots: list[Plot], max_plots: int = 200) -> list[dict]:
    plot_list = []
    sample = plots[:max_plots]
    for p in sample:
        center = None
        if p.geometry:
            try:
                s = shape.to_shape(p.geometry)
                center = [s.centroid.y, s.centroid.x]
            except Exception:
                pass
        plot_list.append({
            "id": str(p.id),
            "cadastral_number": p.cadastral_number,
            "area_m2": p.area_m2,
            "price": p.price,
            "status": p.status.value if isinstance(p.status, PlotStatus) else p.status,
            "permitted_use": p.permitted_use,
            "vri_code": normalize_vri(p.permitted_use),
            "center": center,
        })
    return plot_list


async def analyze_settlement(
    session: AsyncSession,
    settlement_id: str,
    current_user: User | None = None,
    tenant_id=None,
    min_area: float | None = None,
    max_area: float | None = None,
) -> dict:
    scope_tenant_id = tenant_id if tenant_id is not None else getattr(current_user, "tenant_id", None)
    settlement, plots = await _load_plots_for_analysis(session, settlement_id, scope_tenant_id)

    boundary_poly = None
    if settlement.geometry:
        try:
            boundary_poly = shape.to_shape(settlement.geometry)
        except Exception:
            pass

    if boundary_poly is None:
        plot_polys = []
        for p in plots:
            if p.geometry:
                try:
                    plot_polys.append(shape.to_shape(p.geometry))
                except Exception:
                    pass
        if plot_polys:
            from shapely import convex_hull
            boundary_poly = convex_hull(unary_union(plot_polys))

    total_area_m2 = _area_m2(boundary_poly) if boundary_poly else 0.0
    total_area_ha = total_area_m2 / 10000

    total_plots = len(plots)
    free_plots_count = sum(1 for p in plots if p.status == PlotStatus.free)
    occupied_plots_count = total_plots - free_plots_count

    free_zones, free_area = _compute_free_zones(boundary_poly, plots, min_area, max_area) if boundary_poly else ([], 0.0)
    occupied_area = max(0, total_area_m2 - free_area)

    total_price = sum(p.price or 0 for p in plots)

    return {
        "settlement_id": str(settlement.id),
        "settlement_name": settlement.name,
        "total_area_m2": round(total_area_m2, 2),
        "total_area_ha": round(total_area_ha, 4),
        "occupied_area_m2": round(occupied_area, 2),
        "occupied_area_ha": round(occupied_area / 10000, 4),
        "occupied_percent": round((occupied_area / total_area_m2 * 100), 2) if total_area_m2 > 0 else 0,
        "free_area_m2": round(free_area, 2),
        "free_area_ha": round(free_area / 10000, 4),
        "free_percent": round((free_area / total_area_m2 * 100), 2) if total_area_m2 > 0 else 0,
        "free_zones_count": len(free_zones),
        "total_plots": total_plots,
        "occupied_plots_count": occupied_plots_count,
        "free_plots_count": free_plots_count,
        "free_zones": free_zones,
        "vri_summary": _build_vri_summary(plots),
        "category_summary": _build_category_summary(plots),
        "permitted_use_summary": _build_permitted_use_summary(plots),
        "status_summary": _build_status_summary(plots),
        "total_price": total_price,
        "total_price_per_ha": round(total_price / total_area_ha, 0) if total_area_ha > 0 else 0,
        "plots": _build_plot_list(plots),
    }
