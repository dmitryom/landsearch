from datetime import datetime, timezone

from ..models import Plot


def mark_plot_commercial_update(plot: Plot, *, status_changed: bool = False) -> None:
    """Keep commercial timestamps separate from the authoritative NSPD snapshot."""
    metadata = dict(plot.plot_metadata or {})
    now = datetime.now(timezone.utc).isoformat()
    metadata["commercial_updated_at"] = now
    if status_changed:
        metadata["status_updated_at"] = now
    plot.plot_metadata = metadata
