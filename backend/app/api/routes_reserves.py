from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import actor_from_request, raise_domain_error
from app.db.session import get_pg_pool
from app.metrics import RESERVE_DEPOSITS_TOTAL
from app.models.schemas import ReserveDepositRequest
from app.services.errors import DomainError
from app.services.settlement import record_reserve_deposit
from app.websocket import hub

router = APIRouter(tags=["reserves"])


@router.post("/reserves/deposit")
async def reserve_deposit(payload: ReserveDepositRequest, request: Request) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        result = await record_reserve_deposit(
            pool,
            institution_code=payload.institution_id,
            amount=payload.amount,
            currency=payload.currency,
            reference=payload.reference,
            actor=actor,
        )
        RESERVE_DEPOSITS_TOTAL.labels(currency=result["currency"]).inc()
        await hub.broadcast_json(
            {
                "type": "reserve_deposit.recorded",
                "deposit_id": result["deposit_id"],
                "institution_id": result["institution_id"],
                "amount": result["amount"],
                "currency": result["currency"],
                "reference": result["reference"],
                "balance": result["balance"],
            }
        )
        return result
    except DomainError as exc:
        raise_domain_error(exc)
