from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
import math
from typing import Any
from uuid import UUID

from geoalchemy2.shape import from_shape
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import transform
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Plot, PlotStatus


Polygonal = Polygon | MultiPolygon


@dataclass(frozen=True)
class NspdParcel:
    cadastral_number: str
    geometry: Polygonal
    address: str | None = None
    area_m2: float | None = None
    category: str | None = None
    permitted_use: str | None = None
    cadastral_value: float | None = None
    cad_unit: str | None = None
    cad_status: str | None = None
    object_type: str | None = None
    land_plot_type: str | None = None
    registration_date: str | None = None
    ownership_form: str | None = None
    imported_from: str = "nspd"


@dataclass(frozen=True)
class NspdParcelSearch:
    parcels: list[NspdParcel]
    discovered: int
    failed: int = 0
    errors: tuple[str, ...] = ()


@dataclass(frozen=True)
class NspdImportResult:
    discovered: int
    eligible: int
    created: int
    updated: int
    skipped: int
    failed: int
    dry_run: bool
    errors: tuple[str, ...] = ()


class NspdImportUnavailable(RuntimeError):
    pass


def _optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_nspd_feature(feature: Any) -> NspdParcel | None:
    """Convert a pynspd land-plot feature into the stable import contract."""
    try:
        options = feature.properties.options
        cadastral_number = str(getattr(options, "cad_num", "") or "").strip()
        geometry = feature.geometry.to_shape()
    except Exception:
        return None
    if not cadastral_number or not isinstance(geometry, (Polygon, MultiPolygon)):
        return None

    permitted_use = getattr(options, "permitted_use_established_by_document", None)
    if isinstance(permitted_use, str):
        permitted_use = permitted_use.strip() or None
    if not permitted_use:
        permitted_use = getattr(options, "land_record_type", None)

    registration_date = getattr(options, "registration_date", None)
    return NspdParcel(
        cadastral_number=cadastral_number,
        geometry=geometry,
        address=getattr(options, "readable_address", None),
        area_m2=_optional_float(getattr(options, "specified_area", None)),
        category=getattr(options, "land_record_category_type", None),
        permitted_use=permitted_use,
        cadastral_value=_optional_float(getattr(options, "cost_value", None)),
        cad_unit=getattr(options, "quarter_cad_number", None),
        cad_status=getattr(options, "status", None),
        object_type=getattr(options, "land_record_type", None),
        land_plot_type=getattr(options, "land_record_subtype", None),
        registration_date=str(registration_date) if registration_date is not None else None,
        ownership_form=getattr(options, "ownership_type", None),
    )


def fetch_nspd_parcels(
    boundary: Polygonal,
    *,
    max_features: int = 50_000,
    attempts: int = 3,
) -> NspdParcelSearch:
    """Fetch all NSPD land plots intersecting a boundary with bounded retries."""
    from . import cadastre

    if not cadastre._NSPD_AVAILABLE or cadastre.Nspd is None:
        raise NspdImportUnavailable("NSPD client is not available")
    try:
        from pynspd.schemas._autogen_features import Layer36048Feature
    except ImportError as exc:
        raise NspdImportUnavailable("NSPD land-plot schema is not available") from exc

    last_error: Exception | None = None
    for attempt in range(attempts):
        cadastre._wait_cooldown()
        try:
            parcels: list[NspdParcel] = []
            errors: list[str] = []
            discovered = 0
            with cadastre.Nspd(client_timeout=45, client_retries=1) as nspd:
                features = nspd.search_in_contour_iter(
                    boundary,
                    Layer36048Feature,
                    only_intersects=True,
                )
                for feature in features:
                    discovered += 1
                    if discovered > max_features:
                        raise NspdImportUnavailable(
                            f"NSPD contour contains more than {max_features} objects; split the territory"
                        )
                    parcel = _normalize_nspd_feature(feature)
                    if parcel is None:
                        if len(errors) < 20:
                            errors.append("NSPD object has no valid cadastral number or polygon")
                        continue
                    parcels.append(parcel)
            cadastre._register_success()
            return NspdParcelSearch(
                parcels=parcels,
                discovered=discovered,
                failed=discovered - len(parcels),
                errors=tuple(errors),
            )
        except NspdImportUnavailable:
            raise
        except Exception as exc:
            last_error = exc
            if cadastre._is_blocked(exc):
                cadastre._register_block()
            if attempt < attempts - 1:
                time_to_wait = min(20.0, 1.5 * (2**attempt))
                import time

                time.sleep(time_to_wait)

    error_name = type(last_error).__name__ if last_error else "UnknownError"
    raise NspdImportUnavailable(f"NSPD import failed after {attempts} attempts ({error_name})") from last_error


@lru_cache(maxsize=120)
def _transformer_for_epsg(epsg: int) -> Transformer:
    return Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)


def _project_for_area(geometry: Polygonal):
    centroid = geometry.centroid
    zone = max(1, min(60, int((centroid.x + 180) / 6) + 1))
    epsg = 32600 + zone if centroid.y >= 0 else 32700 + zone
    transformer = _transformer_for_epsg(epsg)
    return lambda candidate: transform(transformer.transform, candidate)


def boundary_coverage_ratio(parcel: Any, boundary: Any) -> float:
    if not isinstance(parcel, (Polygon, MultiPolygon)) or not isinstance(boundary, (Polygon, MultiPolygon)):
        return 0.0
    if parcel.is_empty or boundary.is_empty or not parcel.is_valid or not boundary.is_valid:
        return 0.0

    project = _project_for_area(parcel)
    projected_parcel = project(parcel)
    if projected_parcel.area <= 0:
        return 0.0
    projected_inside = project(parcel.intersection(boundary))
    return max(0.0, min(1.0, projected_inside.area / projected_parcel.area))


def parcel_is_eligible(parcel: Any, boundary: Any, min_coverage: float = 0.5) -> bool:
    if not 0 <= min_coverage <= 1:
        raise ValueError("min_coverage must be between 0 and 1")
    if not isinstance(parcel, (Polygon, MultiPolygon)) or not isinstance(boundary, (Polygon, MultiPolygon)):
        return False
    if parcel.is_empty or boundary.is_empty or not parcel.is_valid or not boundary.is_valid:
        return False
    ratio = boundary_coverage_ratio(parcel, boundary)
    # Projection distortion can move an exact 50% split by a fraction of a percent.
    return boundary.covers(parcel) or ratio >= min_coverage or math.isclose(
        ratio,
        min_coverage,
        rel_tol=0,
        abs_tol=1e-3,
    )


def apply_nspd_parcel(plot: Any, parcel: NspdParcel, settlement_id: UUID) -> None:
    geometry = from_shape(parcel.geometry, srid=4326)
    official_fields = (
        "cadastral_number",
        "address",
        "area_m2",
        "category",
        "permitted_use",
        "cadastral_value",
        "cad_unit",
        "cad_status",
        "object_type",
        "land_plot_type",
        "registration_date",
        "ownership_form",
    )
    for field in official_fields:
        value = getattr(parcel, field)
        if value is not None:
            setattr(plot, field, value)

    plot.geometry = geometry
    plot.settlement_id = settlement_id
    plot.imported_from = parcel.imported_from
    if plot.area_m2 and plot.price:
        plot.price_per_hectare = plot.price / (plot.area_m2 / 10_000)


async def upsert_nspd_parcels(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    settlement_id: UUID,
    boundary: Polygonal,
    search: NspdParcelSearch,
    min_coverage: float = 0.5,
    dry_run: bool = False,
) -> NspdImportResult:
    unique: dict[str, NspdParcel] = {}
    skipped = 0
    for parcel in search.parcels:
        key = parcel.cadastral_number.strip()
        if key in unique:
            skipped += 1
            continue
        if not parcel_is_eligible(parcel.geometry, boundary, min_coverage):
            skipped += 1
            continue
        unique[key] = parcel

    existing_by_cadastral: dict[str, Plot] = {}
    cadastral_numbers = list(unique)
    for offset in range(0, len(cadastral_numbers), 500):
        batch = cadastral_numbers[offset:offset + 500]
        result = await session.execute(
            select(Plot).where(
                Plot.tenant_id == tenant_id,
                Plot.cadastral_number.in_(batch),
            )
        )
        existing_by_cadastral.update({plot.cadastral_number: plot for plot in result.scalars().all()})

    created = 0
    updated = 0
    failed = search.failed
    errors = list(search.errors[:20])
    for cadastral_number, parcel in unique.items():
        plot = existing_by_cadastral.get(cadastral_number)
        if plot is None:
            created += 1
            if dry_run:
                continue
            plot = Plot(
                tenant_id=tenant_id,
                cadastral_number=cadastral_number,
                status=PlotStatus.free,
                is_active=True,
            )
            session.add(plot)
        else:
            updated += 1
            if dry_run:
                continue
        try:
            apply_nspd_parcel(plot, parcel, settlement_id)
        except Exception as exc:
            failed += 1
            if plot is not None and cadastral_number not in existing_by_cadastral:
                session.sync_session.expunge(plot)
                created -= 1
            else:
                updated -= 1
            if len(errors) < 20:
                errors.append(f"{cadastral_number}: {type(exc).__name__}")

    return NspdImportResult(
        discovered=search.discovered,
        eligible=len(unique),
        created=created,
        updated=updated,
        skipped=skipped,
        failed=failed,
        dry_run=dry_run,
        errors=tuple(errors),
    )


async def import_settlement_plots(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    settlement_id: UUID,
    boundary: Polygonal,
    min_coverage: float = 0.5,
    dry_run: bool = False,
) -> NspdImportResult:
    search = await asyncio.to_thread(fetch_nspd_parcels, boundary)
    return await upsert_nspd_parcels(
        session,
        tenant_id=tenant_id,
        settlement_id=settlement_id,
        boundary=boundary,
        search=search,
        min_coverage=min_coverage,
        dry_run=dry_run,
    )
