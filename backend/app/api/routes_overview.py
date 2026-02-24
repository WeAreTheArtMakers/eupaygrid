from __future__ import annotations

from fastapi import APIRouter, Query

from app.db.session import get_pg_pool
from app.services.settlement import get_overview_metrics, get_top_active_institutions, get_transfer_volume_series

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("/metrics")
async def overview_metrics() -> dict:
    pool = get_pg_pool()
    return await get_overview_metrics(pool)


@router.get("/transfer-volume")
async def overview_transfer_volume(hours: int = Query(default=24, ge=1, le=168)) -> list[dict]:
    pool = get_pg_pool()
    return await get_transfer_volume_series(pool, hours=hours)


@router.get("/top-institutions")
async def overview_top_institutions(limit: int = Query(default=5, ge=1, le=20)) -> list[dict]:
    pool = get_pg_pool()
    return await get_top_active_institutions(pool, limit=limit)
