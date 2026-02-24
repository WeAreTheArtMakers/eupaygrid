from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from prometheus_client import make_asgi_app

from app.api.routes_admin import router as admin_router
from app.api.routes_balances import router as balances_router
from app.api.routes_demo import router as demo_router
from app.api.routes_health import router as health_router
from app.api.routes_institutions import router as institutions_router
from app.api.routes_ledger import router as ledger_router
from app.api.routes_network import router as network_router
from app.api.routes_overview import router as overview_router
from app.api.routes_reserves import router as reserves_router
from app.api.routes_transfers import router as transfers_router
from app.config import get_settings
from app.db.session import close_pg_pool, get_pg_pool, init_pg_pool
from app.metrics import HTTP_REQUESTS_TOTAL
from app.services.settlement import get_overview_metrics, list_balances, list_transfers
from app.websocket import stream_with_polling

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_pg_pool()
    try:
        yield
    finally:
        await close_pg_pool()


app = FastAPI(
    title=settings.app_name,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/metrics", make_asgi_app())

app.include_router(health_router)
app.include_router(overview_router)
app.include_router(institutions_router)
app.include_router(reserves_router)
app.include_router(transfers_router)
app.include_router(ledger_router)
app.include_router(balances_router)
app.include_router(network_router)
app.include_router(admin_router)
app.include_router(demo_router)


@app.middleware("http")
async def prometheus_http_middleware(request: Request, call_next):
    response = await call_next(request)
    HTTP_REQUESTS_TOTAL.labels(
        method=request.method,
        path=request.url.path,
        status=str(response.status_code),
    ).inc()
    return response


async def _ws_snapshot() -> dict:
    pool = get_pg_pool()
    overview = await get_overview_metrics(pool=pool)
    balances = await list_balances(pool=pool, limit=20)
    transfers = await list_transfers(pool=pool, limit=20)
    return {
        "type": "snapshot",
        "overview": overview,
        "balances": balances,
        "transfers": transfers,
    }


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket) -> None:
    await stream_with_polling(websocket, fetcher=_ws_snapshot, interval_seconds=1.5)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "ok"}
