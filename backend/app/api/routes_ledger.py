from __future__ import annotations

from fastapi import APIRouter, Query

from app.db.session import get_pg_pool
from app.services.settlement import list_ledger_entries, replay_balances_from_ledger

router = APIRouter(prefix="/ledger", tags=["ledger"])


@router.get("/entries")
async def ledger_entries(limit: int = Query(default=200, ge=1, le=2000)) -> list[dict]:
    pool = get_pg_pool()
    return await list_ledger_entries(pool, limit=limit)


@router.post("/replay")
async def ledger_replay() -> dict:
    pool = get_pg_pool()
    return await replay_balances_from_ledger(pool)
