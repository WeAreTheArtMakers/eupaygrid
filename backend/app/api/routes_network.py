from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import raise_domain_error
from app.db.session import get_pg_pool
from app.services.errors import DomainError
from app.services.settlement import list_network_activity

router = APIRouter(prefix="/network", tags=["network"])


@router.get("/activity")
async def network_activity(
    mode: Literal["global", "institution", "admin"] = Query(default="global"),
    institution_id: str | None = Query(default=None),
    reveal_amount: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict]:
    pool = get_pg_pool()
    try:
        return await list_network_activity(
            pool,
            mode=mode,
            institution_code=institution_id,
            reveal_amount=reveal_amount,
            limit=limit,
        )
    except DomainError as exc:
        raise_domain_error(exc)
