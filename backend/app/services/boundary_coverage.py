from shapely.validation import make_valid
from sqlalchemy import and_, func


MIN_BOUNDARY_COVERAGE_RATIO = 0.5


def boundary_covers_majority(plot_geometry, boundary_geometry):
    """Build a PostGIS predicate for plots fully or mostly inside a boundary."""
    valid_plot = func.ST_MakeValid(plot_geometry)
    return and_(
        plot_geometry.op("&&")(boundary_geometry),
        func.ST_Area(func.ST_Intersection(valid_plot, boundary_geometry))
        > func.ST_Area(valid_plot) * MIN_BOUNDARY_COVERAGE_RATIO,
    )


def boundary_covers_majority_sql(plot_alias: str = "p", boundary_alias: str = "boundary") -> str:
    """Return the equivalent predicate for the raw SQL used by MVT tiles."""
    ratio = str(MIN_BOUNDARY_COVERAGE_RATIO)
    return f"""(
        {plot_alias}.geometry && {boundary_alias}.geometry
        AND ST_Area(ST_Intersection(ST_MakeValid({plot_alias}.geometry), {boundary_alias}.geometry))
            > ST_Area(ST_MakeValid({plot_alias}.geometry)) * {ratio}
    )"""


def shape_is_covered_by_majority(plot_shape, boundary_shape) -> bool:
    """Return true only when more than half of a polygon is inside the boundary."""
    if plot_shape.is_empty or boundary_shape.is_empty:
        return False
    if not plot_shape.is_valid:
        plot_shape = make_valid(plot_shape)
    if plot_shape.is_empty or plot_shape.area <= 0:
        return False
    if not boundary_shape.intersects(plot_shape):
        return False
    return boundary_shape.intersection(plot_shape).area > (
        plot_shape.area * MIN_BOUNDARY_COVERAGE_RATIO
    )
