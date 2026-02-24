from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.api.deps import actor_from_request, raise_domain_error
from app.db.session import get_pg_pool
from app.metrics import TRANSFERS_FAILED_TOTAL, TRANSFERS_SETTLED_TOTAL
from app.models.schemas import TransferCreateRequest
from app.services.errors import DomainError
from app.services.settlement import create_transfer, list_transfers
from app.websocket import hub

router = APIRouter(tags=["transfers"])


@router.post("/transfers")
async def transfers_create(payload: TransferCreateRequest, request: Request) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        transfer = await create_transfer(
            pool,
            sender_institution_code=payload.sender_institution_id,
            recipient_institution_code=payload.recipient_institution_id,
            amount=payload.amount,
            currency=payload.currency,
            note=payload.note,
            actor=actor,
        )
        if transfer["status"] == "settled":
            TRANSFERS_SETTLED_TOTAL.labels(currency=transfer["currency"]).inc()
            event_type = "transfer.settled"
        else:
            TRANSFERS_FAILED_TOTAL.labels(currency=transfer["currency"]).inc()
            event_type = "transfer.failed"

        await hub.broadcast_json(
            {
                "type": event_type,
                "transfer": transfer,
            }
        )
        return transfer
    except DomainError as exc:
        raise_domain_error(exc)


@router.get("/transfers")
async def transfers_list(
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict]:
    pool = get_pg_pool()
    return await list_transfers(pool, status=status, query=q, limit=limit)
