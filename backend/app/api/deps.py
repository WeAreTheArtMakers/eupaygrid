from __future__ import annotations

from fastapi import HTTPException, Request

from app.services.errors import DomainError


DEFAULT_ACTOR = "admin@eupaygrid.local"


def actor_from_request(request: Request) -> str:
    actor = request.headers.get("x-actor", "").strip()
    if actor:
        return actor
    return DEFAULT_ACTOR


def raise_domain_error(exc: DomainError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
