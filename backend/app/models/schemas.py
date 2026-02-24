from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class InstitutionCreateRequest(BaseModel):
    institution_id: str | None = Field(default=None, min_length=4, max_length=32)
    legal_name: str = Field(..., min_length=2, max_length=180)
    cvr_number: str = Field(..., min_length=3, max_length=64)
    country: str = Field(..., min_length=2, max_length=3)
    reason: str | None = Field(default=None, max_length=300)


class InstitutionActionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class ReserveDepositRequest(BaseModel):
    institution_id: str = Field(..., min_length=4, max_length=32)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=8)
    reference: str = Field(..., min_length=3, max_length=120)


class TransferCreateRequest(BaseModel):
    sender_institution_id: str = Field(..., min_length=4, max_length=32)
    recipient_institution_id: str = Field(..., min_length=4, max_length=32)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=8)
    note: str | None = Field(default=None, max_length=300)


class NetworkQueryModeRequest(BaseModel):
    mode: str = Field(default="global")
    institution_id: str | None = None
    reveal_amount: bool = False


class DemoSeedRequest(BaseModel):
    reset: bool = False
