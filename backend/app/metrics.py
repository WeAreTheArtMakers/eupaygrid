from __future__ import annotations

from prometheus_client import Counter, Gauge

HTTP_REQUESTS_TOTAL = Counter(
    "eupaygrid_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)

TRANSFERS_SETTLED_TOTAL = Counter(
    "eupaygrid_transfers_settled_total",
    "Total settled transfers",
    ["currency"],
)

TRANSFERS_FAILED_TOTAL = Counter(
    "eupaygrid_transfers_failed_total",
    "Total failed transfers",
    ["currency"],
)

RESERVE_DEPOSITS_TOTAL = Counter(
    "eupaygrid_reserve_deposits_total",
    "Total reserve deposits",
    ["currency"],
)

INFLIGHT_WS_CONNECTIONS = Gauge(
    "eupaygrid_ws_connections",
    "Active websocket client connections",
)
