from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.api.deps import actor_from_request, raise_domain_error
from app.db.session import get_pg_pool
from app.models.schemas import InstitutionActionRequest, InstitutionCreateRequest
from app.services.errors import DomainError
from app.services.settlement import (
    approve_institution,
    create_institution,
    freeze_wallet,
    list_institutions,
    suspend_institution,
    unfreeze_wallet,
)
from app.websocket import hub

router = APIRouter(tags=["institutions"])


@router.post("/institutions")
async def institutions_create(payload: InstitutionCreateRequest, request: Request) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        institution = await create_institution(
            pool,
            legal_name=payload.legal_name,
            cvr_number=payload.cvr_number,
            country=payload.country,
            actor=actor,
            reason=payload.reason or "Institution onboarding",
            institution_code=payload.institution_id,
        )
        await hub.broadcast_json(
            {
                "type": "institution.created",
                "institution_id": institution["institution_id"],
                "legal_name": institution["legal_name"],
                "status": institution["status"],
            }
        )
        return institution
    except DomainError as exc:
        raise_domain_error(exc)


@router.get("/institutions")
async def institutions_list(
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict]:
    pool = get_pg_pool()
    return await list_institutions(pool, query=q, status=status, limit=limit)


@router.patch("/institutions/{institution_id}/approve")
async def institutions_approve(
    institution_id: str,
    payload: InstitutionActionRequest,
    request: Request,
) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        institution = await approve_institution(
            pool,
            institution_code=institution_id,
            actor=actor,
            reason=payload.reason or "Institution approved",
        )
        await hub.broadcast_json(
            {
                "type": "institution.approved",
                "institution_id": institution["institution_id"],
                "status": institution["status"],
            }
        )
        return institution
    except DomainError as exc:
        raise_domain_error(exc)


@router.patch("/institutions/{institution_id}/suspend")
async def institutions_suspend(
    institution_id: str,
    payload: InstitutionActionRequest,
    request: Request,
) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        institution = await suspend_institution(
            pool,
            institution_code=institution_id,
            actor=actor,
            reason=payload.reason or "Institution suspended",
        )
        await hub.broadcast_json(
            {
                "type": "institution.suspended",
                "institution_id": institution["institution_id"],
                "status": institution["status"],
            }
        )
        return institution
    except DomainError as exc:
        raise_domain_error(exc)


@router.patch("/institutions/{institution_id}/freeze")
async def institutions_freeze(
    institution_id: str,
    payload: InstitutionActionRequest,
    request: Request,
) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        institution = await freeze_wallet(
            pool,
            institution_code=institution_id,
            actor=actor,
            reason=payload.reason or "Institution wallet frozen",
        )
        await hub.broadcast_json(
            {
                "type": "wallet.frozen",
                "institution_id": institution["institution_id"],
                "is_frozen": institution["is_frozen"],
            }
        )
        return institution
    except DomainError as exc:
        raise_domain_error(exc)


@router.patch("/institutions/{institution_id}/unfreeze")
async def institutions_unfreeze(
    institution_id: str,
    payload: InstitutionActionRequest,
    request: Request,
) -> dict:
    pool = get_pg_pool()
    actor = actor_from_request(request)
    try:
        institution = await unfreeze_wallet(
            pool,
            institution_code=institution_id,
            actor=actor,
            reason=payload.reason or "Institution wallet unfrozen",
        )
        await hub.broadcast_json(
            {
                "type": "wallet.unfrozen",
                "institution_id": institution["institution_id"],
                "is_frozen": institution["is_frozen"],
            }
        )
        return institution
    except DomainError as exc:
        raise_domain_error(exc)
