import inspect

from app.api.v1 import plots as plots_api
from app.api.v1 import reservations as reservations_api
from app.schemas import ReservationCreate, ReservationExtend


def test_reservation_requests_have_bounded_duration():
    request = ReservationCreate(plot_id="00000000-0000-0000-0000-000000000001")
    extension = ReservationExtend(duration_hours=48)

    assert request.duration_hours == 24
    assert extension.duration_hours == 48


def test_reservation_mutations_are_manager_scoped():
    mutation_routes = [
        route for route in reservations_api.router.routes
        if route.path.endswith(("/reservations", "/confirm", "/cancel", "/extend", "/expire"))
        and set(route.methods or ()) & {"POST", "PATCH"}
    ]

    assert mutation_routes
    for route in mutation_routes:
        assert any(getattr(dependency.call, "__name__", "") == "_check" for dependency in route.dependant.dependencies)


def test_create_reservation_uses_transactional_service_and_tenant_scope():
    source = inspect.getsource(reservations_api.create_plot_reservation)

    assert "create_reservation" in source
    assert "current_user.tenant_id" in source
    assert "_invalidate_plot_map_cache" in source


def test_plot_mutations_cannot_bypass_active_reservations():
    guarded_handlers = [
        plots_api.update_plot,
        plots_api.bulk_update_plot_status,
        plots_api.bulk_delete_plots,
        plots_api.delete_plot,
    ]

    for handler in guarded_handlers:
        assert "_ensure_no_active_reservation_conflicts" in inspect.getsource(handler)
