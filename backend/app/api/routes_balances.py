from __future__ import annotations

from fastapi import APIRouter, Query

from app.db.session import get_pg_pool
from app.services.settlement import list_balances

router = APIRouter(tags=["balances"])


@router.get("/balances")
async def balances_list(
    currency: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
) -> list[dict]:
    pool = get_pg_pool()
    return await list_balances(pool, limit=limit, currency=currency)
