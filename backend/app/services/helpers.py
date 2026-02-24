from __future__ import annotations

import hashlib
import secrets
import uuid
from decimal import Decimal


def generate_institution_code() -> str:
    return f"EUPG-{uuid.uuid4().hex[:8].upper()}"


def generate_wallet_address() -> str:
    return f"wl_{secrets.token_hex(16)}"


def generate_pseudonymous_id(institution_code: str) -> str:
    digest = hashlib.sha256(institution_code.encode("utf-8")).hexdigest()
    return f"INST-{digest[:10].upper()}"


def generate_mock_settlement_tx_id() -> str:
    return f"simsol_{secrets.token_hex(20)}"


def amount_band(amount: Decimal) -> str:
    value = Decimal(amount)
    if value < Decimal("10000"):
        return "<10k"
    if value < Decimal("100000"):
        return "10k-100k"
    if value < Decimal("1000000"):
        return "100k-1m"
    return ">=1m"


def signed_amount(side: str, amount: Decimal) -> Decimal:
    if side == "debit":
        return amount
    if side == "credit":
        return amount * Decimal("-1")
    raise ValueError(f"unsupported side: {side}")
