from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import actor_from_request
from app.db.session import get_pg_pool
from app.services.settlement import seed_demo_data
from app.websocket import hub

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/seed")
async def demo_seed(request: Request) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    result = await seed_demo_data(pool, actor=actor)
    await hub.broadcast_json({"type": "demo.seeded", "result": result})
    return result
