"""Prometheus metrics for LandSearch backend."""

from prometheus_client import Counter, Histogram, Gauge, Info

# Request metrics
REQUEST_COUNT = Counter(
    "landsearch_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "landsearch_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Database metrics
DB_QUERY_COUNT = Counter(
    "landsearch_db_queries_total",
    "Total database queries",
    ["operation"],
)

DB_QUERY_LATENCY = Histogram(
    "landsearch_db_query_duration_seconds",
    "Database query latency in seconds",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

# Plot metrics
PLOTS_TOTAL = Gauge(
    "landsearch_plots_total",
    "Total number of plots in database",
    ["status"],
)

PLOTS_GEO_TOTAL = Gauge(
    "landsearch_plots_geo_total",
    "Total plots with geometry",
)

# NSPD scan metrics
NSPD_SCAN_COUNT = Counter(
    "landsearch_nspd_scans_total",
    "Total NSPD scan operations",
    ["district", "status"],
)

NSPD_SCAN_LATENCY = Histogram(
    "landsearch_nspd_scan_duration_seconds",
    "NSPD scan latency in seconds",
    ["district"],
    buckets=[1, 5, 10, 30, 60, 120, 300],
)

NSPD_IMPORT_COUNT = Counter(
    "landsearch_nspd_imports_total",
    "Settlement NSPD import attempts",
    ["result", "dry_run"],
)

NSPD_IMPORT_LATENCY = Histogram(
    "landsearch_nspd_import_duration_seconds",
    "Settlement NSPD import latency in seconds",
    ["dry_run"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600],
)

NSPD_IMPORT_OBJECTS = Counter(
    "landsearch_nspd_import_objects_total",
    "Objects handled by settlement NSPD imports",
    ["outcome"],
)

RESERVATION_EVENTS = Counter(
    "landsearch_reservation_events_total",
    "Reservation lifecycle operations",
    ["action"],
)

WEBHOOK_DELIVERIES = Counter(
    "landsearch_webhook_deliveries_total",
    "Webhook delivery outcomes",
    ["outcome"],
)

# Cache metrics
CACHE_HITS = Counter(
    "landsearch_cache_hits_total",
    "Total cache hits",
    ["cache_type"],
)

CACHE_MISSES = Counter(
    "landsearch_cache_misses_total",
    "Total cache misses",
    ["cache_type"],
)

# App info
APP_INFO = Info(
    "landsearch_app",
    "LandSearch application info",
)
APP_INFO.info({
    "version": "0.1.0",
    "environment": "production",
})
