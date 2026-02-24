from __future__ import annotations

from fastapi import APIRouter, Query

from app.db.session import get_pg_pool
from app.services.settlement import list_admin_actions

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit-log")
async def admin_audit_log(limit: int = Query(default=200, ge=1, le=2000)) -> list[dict]:
    pool = get_pg_pool()
    return await list_admin_actions(pool, limit=limit)
