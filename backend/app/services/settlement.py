from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import UUID

import asyncpg

from app.config import get_settings
from app.services.errors import DomainError
from app.services.helpers import (
    amount_band,
    generate_institution_code,
    generate_mock_settlement_tx_id,
    generate_pseudonymous_id,
    generate_wallet_address,
    signed_amount,
)

SYSTEM_RESERVE_ACCOUNT_REF = "EUPAYGRID_RESERVE_POOL"


def _to_decimal(value: Decimal | str | int | float) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise DomainError(status_code=400, code="invalid_amount", message="Amount must be a valid decimal") from exc

    if amount <= Decimal("0"):
        raise DomainError(status_code=400, code="invalid_amount", message="Amount must be greater than zero")

    return amount.quantize(Decimal("0.000001"))


def _normalize_currency(currency: str) -> str:
    if not currency:
        raise DomainError(status_code=400, code="invalid_currency", message="Currency is required")

    normalized = currency.upper().strip()
    settings = get_settings()
    if normalized not in settings.allowed_currencies_set:
        allowed = sorted(settings.allowed_currencies_set)
        raise DomainError(
            status_code=400,
            code="currency_not_allowed",
            message=f"Currency '{normalized}' is not allowed. Allowed: {allowed}",
        )
    return normalized


def _normalize_reason(reason: str | None, fallback: str) -> str:
    if reason and reason.strip():
        return reason.strip()
    return fallback


async def _log_admin_action(
    conn: asyncpg.Connection,
    action_type: str,
    actor: str,
    target_institution_id: UUID | None,
    reason: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO admin_actions (action_type, actor, target_institution_id, reason, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        action_type,
        actor,
        target_institution_id,
        reason,
        json.dumps(metadata or {}),
    )


async def _append_outbox_event(conn: asyncpg.Connection, event_type: str, payload: dict[str, Any]) -> int:
    outbox_id = await conn.fetchval(
        """
        INSERT INTO outbox_events (event_type, payload)
        VALUES ($1, $2::jsonb)
        RETURNING id
        """,
        event_type,
        json.dumps(payload),
    )
    return int(outbox_id)


async def _fetch_institution_with_wallet(
    conn: asyncpg.Connection,
    institution_code: str,
    *,
    for_update: bool = False,
) -> asyncpg.Record | None:
    query = """
        SELECT
            i.id,
            i.institution_id,
            i.legal_name,
            i.cvr_number,
            i.country,
            i.status,
            i.created_at,
            w.id AS wallet_id,
            w.wallet_address,
            w.pseudonymous_id,
            w.is_frozen
        FROM institutions i
        JOIN wallets w ON w.institution_id = i.id
        WHERE i.institution_id = $1
    """
    if for_update:
        query += " FOR UPDATE OF i, w"

    return await conn.fetchrow(query, institution_code)


async def _ensure_balance_row(conn: asyncpg.Connection, institution_id: UUID, currency: str) -> None:
    await conn.execute(
        """
        INSERT INTO balances (institution_id, currency, available_balance)
        VALUES ($1, $2, 0)
        ON CONFLICT (institution_id, currency) DO NOTHING
        """,
        institution_id,
        currency,
    )


async def _lock_balance(conn: asyncpg.Connection, institution_id: UUID, currency: str) -> Decimal:
    await _ensure_balance_row(conn, institution_id, currency)
    value = await conn.fetchval(
        """
        SELECT available_balance
        FROM balances
        WHERE institution_id = $1 AND currency = $2
        FOR UPDATE
        """,
        institution_id,
        currency,
    )
    if value is None:
        return Decimal("0")
    return Decimal(value)


async def _apply_balance_delta(
    conn: asyncpg.Connection,
    institution_id: UUID,
    currency: str,
    delta: Decimal,
) -> Decimal:
    await _ensure_balance_row(conn, institution_id, currency)
    try:
        value = await conn.fetchval(
            """
            UPDATE balances
            SET available_balance = available_balance + $3,
                updated_at = NOW()
            WHERE institution_id = $1 AND currency = $2
            RETURNING available_balance
            """,
            institution_id,
            currency,
            delta,
        )
    except asyncpg.CheckViolationError as exc:
        raise DomainError(
            status_code=400,
            code="insufficient_balance",
            message="Insufficient balance for requested operation",
        ) from exc

    if value is None:
        raise DomainError(status_code=500, code="balance_update_failed", message="Could not update balance row")
    return Decimal(value)


async def _fetch_transfer_row(conn: asyncpg.Connection, transfer_id: UUID) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT
            t.id::text AS transfer_id,
            t.amount::text AS amount,
            t.currency,
            t.note,
            t.status,
            t.failure_reason,
            t.settlement_layer,
            t.settlement_tx_id,
            t.submitted_at,
            t.settled_at,
            sender.institution_id AS sender_institution_id,
            sender.legal_name AS sender_legal_name,
            sender.cvr_number AS sender_cvr_number,
            sender.country AS sender_country,
            sender_wallet.pseudonymous_id AS sender_pseudonymous_id,
            recipient.institution_id AS recipient_institution_id,
            recipient.legal_name AS recipient_legal_name,
            recipient.cvr_number AS recipient_cvr_number,
            recipient.country AS recipient_country,
            recipient_wallet.pseudonymous_id AS recipient_pseudonymous_id
        FROM transfers t
        JOIN institutions sender ON sender.id = t.sender_institution_id
        JOIN wallets sender_wallet ON sender_wallet.institution_id = sender.id
        JOIN institutions recipient ON recipient.id = t.recipient_institution_id
        JOIN wallets recipient_wallet ON recipient_wallet.institution_id = recipient.id
        WHERE t.id = $1
        """,
        transfer_id,
    )

    if row is None:
        raise DomainError(status_code=404, code="transfer_not_found", message="Transfer was not found")
    return dict(row)


async def _transfer_note_exists(conn: asyncpg.Connection, note: str) -> bool:
    exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM transfers WHERE note = $1)", note)
    return bool(exists)


async def create_institution(
    pool: asyncpg.Pool,
    *,
    legal_name: str,
    cvr_number: str,
    country: str,
    actor: str,
    reason: str = "Institution onboarding",
    institution_code: str | None = None,
) -> dict[str, Any]:
    if not legal_name.strip():
        raise DomainError(status_code=400, code="invalid_legal_name", message="legal_name is required")
    if not cvr_number.strip():
        raise DomainError(status_code=400, code="invalid_cvr", message="cvr_number is required")
    if not country.strip():
        raise DomainError(status_code=400, code="invalid_country", message="country is required")

    async with pool.acquire() as conn:
        async with conn.transaction():
            if await conn.fetchval("SELECT EXISTS(SELECT 1 FROM institutions WHERE cvr_number = $1)", cvr_number.strip()):
                raise DomainError(
                    status_code=409,
                    code="cvr_exists",
                    message=f"Institution with CVR '{cvr_number.strip()}' already exists",
                )

            generated_code = institution_code.strip().upper() if institution_code else ""
            for _ in range(20):
                candidate = generated_code or generate_institution_code()
                if not await conn.fetchval("SELECT EXISTS(SELECT 1 FROM institutions WHERE institution_id = $1)", candidate):
                    generated_code = candidate
                    break
                if institution_code:
                    raise DomainError(
                        status_code=409,
                        code="institution_id_exists",
                        message=f"institution_id '{institution_code}' already exists",
                    )
            else:
                raise DomainError(status_code=500, code="institution_id_generation_failed", message="Try again")

            institution = await conn.fetchrow(
                """
                INSERT INTO institutions (institution_id, legal_name, cvr_number, country)
                VALUES ($1, $2, $3, $4)
                RETURNING id, institution_id, legal_name, cvr_number, country, status, created_at
                """,
                generated_code,
                legal_name.strip(),
                cvr_number.strip(),
                country.strip().upper(),
            )
            if institution is None:
                raise DomainError(status_code=500, code="institution_create_failed", message="Could not create institution")

            wallet = await conn.fetchrow(
                """
                INSERT INTO wallets (institution_id, wallet_address, pseudonymous_id)
                VALUES ($1, $2, $3)
                RETURNING id, pseudonymous_id, is_frozen
                """,
                institution["id"],
                generate_wallet_address(),
                generate_pseudonymous_id(generated_code),
            )

            await _ensure_balance_row(conn, institution["id"], "EUR")

            await _log_admin_action(
                conn,
                action_type="institution_created",
                actor=actor,
                target_institution_id=institution["id"],
                reason=_normalize_reason(reason, "Institution created"),
                metadata={
                    "institution_id": institution["institution_id"],
                    "country": institution["country"],
                },
            )

            balance = await conn.fetchval(
                "SELECT available_balance::text FROM balances WHERE institution_id = $1 AND currency = 'EUR'",
                institution["id"],
            )

            return {
                "institution_id": institution["institution_id"],
                "legal_name": institution["legal_name"],
                "cvr_number": institution["cvr_number"],
                "country": institution["country"],
                "status": institution["status"],
                "created_at": institution["created_at"],
                "pseudonymous_id": wallet["pseudonymous_id"],
                "is_frozen": wallet["is_frozen"],
                "eur_balance": str(balance or "0"),
            }


async def list_institutions(
    pool: asyncpg.Pool,
    *,
    query: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    text_query = (query or "").strip()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                i.institution_id,
                i.legal_name,
                i.cvr_number,
                i.country,
                i.status,
                i.created_at,
                w.pseudonymous_id,
                w.is_frozen,
                COALESCE(b.available_balance, 0)::text AS eur_balance
            FROM institutions i
            JOIN wallets w ON w.institution_id = i.id
            LEFT JOIN balances b ON b.institution_id = i.id AND b.currency = 'EUR'
            WHERE
                ($1::text = '' OR (
                    i.legal_name ILIKE '%' || $1 || '%' OR
                    i.cvr_number ILIKE '%' || $1 || '%' OR
                    i.institution_id ILIKE '%' || $1 || '%'
                ))
                AND ($2::text IS NULL OR i.status = $2)
            ORDER BY i.created_at DESC
            LIMIT $3
            """,
            text_query,
            status,
            limit,
        )
    return [dict(row) for row in rows]


async def _set_institution_status(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    target_status: Literal["approved", "suspended"],
    actor: str,
    reason: str,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _fetch_institution_with_wallet(conn, institution_code.strip().upper(), for_update=True)
            if row is None:
                raise DomainError(status_code=404, code="institution_not_found", message="Institution not found")

            await conn.execute(
                "UPDATE institutions SET status = $2 WHERE id = $1",
                row["id"],
                target_status,
            )

            await _log_admin_action(
                conn,
                action_type=f"institution_{target_status}",
                actor=actor,
                target_institution_id=row["id"],
                reason=_normalize_reason(reason, f"Institution {target_status}"),
                metadata={"institution_id": row["institution_id"]},
            )

            updated = await _fetch_institution_with_wallet(conn, row["institution_id"], for_update=False)
            if updated is None:
                raise DomainError(status_code=500, code="institution_missing_post_update", message="Institution missing")

            return {
                "institution_id": updated["institution_id"],
                "legal_name": updated["legal_name"],
                "cvr_number": updated["cvr_number"],
                "country": updated["country"],
                "status": updated["status"],
                "pseudonymous_id": updated["pseudonymous_id"],
                "is_frozen": updated["is_frozen"],
                "created_at": updated["created_at"],
            }


async def approve_institution(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    actor: str,
    reason: str,
) -> dict[str, Any]:
    return await _set_institution_status(
        pool,
        institution_code=institution_code,
        target_status="approved",
        actor=actor,
        reason=reason,
    )


async def suspend_institution(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    actor: str,
    reason: str,
) -> dict[str, Any]:
    return await _set_institution_status(
        pool,
        institution_code=institution_code,
        target_status="suspended",
        actor=actor,
        reason=reason,
    )


async def _set_wallet_frozen(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    is_frozen: bool,
    actor: str,
    reason: str,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await _fetch_institution_with_wallet(conn, institution_code.strip().upper(), for_update=True)
            if row is None:
                raise DomainError(status_code=404, code="institution_not_found", message="Institution not found")

            await conn.execute(
                "UPDATE wallets SET is_frozen = $2 WHERE institution_id = $1",
                row["id"],
                is_frozen,
            )

            action = "wallet_frozen" if is_frozen else "wallet_unfrozen"
            await _log_admin_action(
                conn,
                action_type=action,
                actor=actor,
                target_institution_id=row["id"],
                reason=_normalize_reason(reason, action.replace("_", " ")),
                metadata={"institution_id": row["institution_id"], "is_frozen": is_frozen},
            )

            updated = await _fetch_institution_with_wallet(conn, row["institution_id"])
            if updated is None:
                raise DomainError(status_code=500, code="wallet_update_failed", message="Wallet update failed")

            return {
                "institution_id": updated["institution_id"],
                "legal_name": updated["legal_name"],
                "status": updated["status"],
                "is_frozen": updated["is_frozen"],
                "pseudonymous_id": updated["pseudonymous_id"],
            }


async def freeze_wallet(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    actor: str,
    reason: str,
) -> dict[str, Any]:
    return await _set_wallet_frozen(
        pool,
        institution_code=institution_code,
        is_frozen=True,
        actor=actor,
        reason=reason,
    )


async def unfreeze_wallet(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    actor: str,
    reason: str,
) -> dict[str, Any]:
    return await _set_wallet_frozen(
        pool,
        institution_code=institution_code,
        is_frozen=False,
        actor=actor,
        reason=reason,
    )


async def record_reserve_deposit(
    pool: asyncpg.Pool,
    *,
    institution_code: str,
    amount: Decimal | str | int | float,
    currency: str,
    reference: str,
    actor: str,
) -> dict[str, Any]:
    normalized_amount = _to_decimal(amount)
    normalized_currency = _normalize_currency(currency)
    if not reference.strip():
        raise DomainError(status_code=400, code="invalid_reference", message="reference is required")

    async with pool.acquire() as conn:
        async with conn.transaction():
            institution = await _fetch_institution_with_wallet(conn, institution_code.strip().upper(), for_update=True)
            if institution is None:
                raise DomainError(status_code=404, code="institution_not_found", message="Institution not found")

            if institution["status"] != "approved":
                raise DomainError(
                    status_code=400,
                    code="institution_not_approved",
                    message="Institution must be approved before reserve deposits",
                )

            reserve_deposit_id = await conn.fetchval(
                """
                INSERT INTO reserve_deposits (institution_id, amount, currency, reference, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
                """,
                institution["id"],
                normalized_amount,
                normalized_currency,
                reference.strip(),
                actor,
            )

            await conn.executemany(
                """
                INSERT INTO ledger_entries (
                    reserve_deposit_id,
                    institution_id,
                    wallet_id,
                    counterparty_wallet_id,
                    account_ref,
                    counterparty_ref,
                    entry_type,
                    side,
                    currency,
                    amount,
                    description
                ) VALUES ($1, $2, $3, $4, $5, $6, 'reserve_deposit', $7, $8, $9, $10)
                """,
                [
                    (
                        reserve_deposit_id,
                        institution["id"],
                        institution["wallet_id"],
                        None,
                        institution["pseudonymous_id"],
                        SYSTEM_RESERVE_ACCOUNT_REF,
                        "debit",
                        normalized_currency,
                        normalized_amount,
                        f"Reserve deposit {reference.strip()}",
                    ),
                    (
                        reserve_deposit_id,
                        None,
                        None,
                        institution["wallet_id"],
                        SYSTEM_RESERVE_ACCOUNT_REF,
                        institution["pseudonymous_id"],
                        "credit",
                        normalized_currency,
                        normalized_amount,
                        f"Reserve liability for {institution['institution_id']}",
                    ),
                ],
            )

            new_balance = await _apply_balance_delta(
                conn,
                institution_id=institution["id"],
                currency=normalized_currency,
                delta=normalized_amount,
            )

            await _log_admin_action(
                conn,
                action_type="reserve_deposit_recorded",
                actor=actor,
                target_institution_id=institution["id"],
                reason=f"Reserve deposit reference {reference.strip()}",
                metadata={
                    "institution_id": institution["institution_id"],
                    "amount": str(normalized_amount),
                    "currency": normalized_currency,
                    "reference": reference.strip(),
                },
            )

            event_payload = {
                "type": "reserve_deposit.recorded",
                "deposit_id": str(reserve_deposit_id),
                "institution_id": institution["institution_id"],
                "amount": str(normalized_amount),
                "currency": normalized_currency,
                "reference": reference.strip(),
                "balance": str(new_balance),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await _append_outbox_event(conn, "reserve_deposit.recorded", event_payload)

            return {
                "deposit_id": str(reserve_deposit_id),
                "institution_id": institution["institution_id"],
                "amount": str(normalized_amount),
                "currency": normalized_currency,
                "reference": reference.strip(),
                "balance": str(new_balance),
            }


async def create_transfer(
    pool: asyncpg.Pool,
    *,
    sender_institution_code: str,
    recipient_institution_code: str,
    amount: Decimal | str | int | float,
    currency: str,
    note: str | None,
    actor: str,
) -> dict[str, Any]:
    normalized_amount = _to_decimal(amount)
    normalized_currency = _normalize_currency(currency)

    sender_code = sender_institution_code.strip().upper()
    recipient_code = recipient_institution_code.strip().upper()

    async with pool.acquire() as conn:
        async with conn.transaction():
            sender = await _fetch_institution_with_wallet(conn, sender_code, for_update=True)
            if sender is None:
                raise DomainError(status_code=404, code="sender_not_found", message="Sender institution not found")

            recipient = await _fetch_institution_with_wallet(conn, recipient_code, for_update=True)
            if recipient is None:
                raise DomainError(status_code=404, code="recipient_not_found", message="Recipient institution not found")

            transfer_id = await conn.fetchval(
                """
                INSERT INTO transfers (
                    sender_institution_id,
                    recipient_institution_id,
                    amount,
                    currency,
                    note,
                    status
                ) VALUES ($1, $2, $3, $4, $5, 'submitted')
                RETURNING id
                """,
                sender["id"],
                recipient["id"],
                normalized_amount,
                normalized_currency,
                (note or "").strip() or None,
            )

            failure_reason: str | None = None
            if sender["institution_id"] == recipient["institution_id"]:
                failure_reason = "Sender and recipient must be different institutions"
            elif sender["status"] != "approved":
                failure_reason = "Sender institution is not approved"
            elif recipient["status"] != "approved":
                failure_reason = "Recipient institution is not approved"
            elif bool(sender["is_frozen"]):
                failure_reason = "Sender wallet is frozen and cannot initiate transfers"

            sender_balance = await _lock_balance(conn, sender["id"], normalized_currency)
            if failure_reason is None and sender_balance < normalized_amount:
                failure_reason = "Insufficient balance"

            if failure_reason is not None:
                await conn.execute(
                    """
                    UPDATE transfers
                    SET status = 'failed', failure_reason = $2
                    WHERE id = $1
                    """,
                    transfer_id,
                    failure_reason,
                )

                failed_transfer = await _fetch_transfer_row(conn, transfer_id)

                event_payload = {
                    "type": "transfer.failed",
                    "transfer_id": failed_transfer["transfer_id"],
                    "sender_institution_id": failed_transfer["sender_institution_id"],
                    "recipient_institution_id": failed_transfer["recipient_institution_id"],
                    "sender_pseudonymous_id": failed_transfer["sender_pseudonymous_id"],
                    "recipient_pseudonymous_id": failed_transfer["recipient_pseudonymous_id"],
                    "amount": failed_transfer["amount"],
                    "currency": failed_transfer["currency"],
                    "status": "failed",
                    "failure_reason": failure_reason,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                await _append_outbox_event(conn, "transfer.failed", event_payload)
                return failed_transfer

            settlement_tx_id = generate_mock_settlement_tx_id()
            settlement_layer = get_settings().settlement_layer
            settled_at = datetime.now(timezone.utc)

            await conn.execute(
                """
                INSERT INTO settlement_events (
                    transfer_id,
                    settlement_layer,
                    settlement_tx_id,
                    status,
                    settled_at
                ) VALUES ($1, $2, $3, 'recorded', $4)
                """,
                transfer_id,
                settlement_layer,
                settlement_tx_id,
                settled_at,
            )

            await conn.executemany(
                """
                INSERT INTO ledger_entries (
                    transfer_id,
                    institution_id,
                    wallet_id,
                    counterparty_wallet_id,
                    account_ref,
                    counterparty_ref,
                    entry_type,
                    side,
                    currency,
                    amount,
                    description
                ) VALUES ($1, $2, $3, $4, $5, $6, 'transfer', $7, $8, $9, $10)
                """,
                [
                    (
                        transfer_id,
                        sender["id"],
                        sender["wallet_id"],
                        recipient["wallet_id"],
                        sender["pseudonymous_id"],
                        recipient["pseudonymous_id"],
                        "credit",
                        normalized_currency,
                        normalized_amount,
                        "Outgoing institutional transfer",
                    ),
                    (
                        transfer_id,
                        recipient["id"],
                        recipient["wallet_id"],
                        sender["wallet_id"],
                        recipient["pseudonymous_id"],
                        sender["pseudonymous_id"],
                        "debit",
                        normalized_currency,
                        normalized_amount,
                        "Incoming institutional transfer",
                    ),
                ],
            )

            await _apply_balance_delta(
                conn,
                institution_id=sender["id"],
                currency=normalized_currency,
                delta=signed_amount("credit", normalized_amount),
            )
            await _apply_balance_delta(
                conn,
                institution_id=recipient["id"],
                currency=normalized_currency,
                delta=signed_amount("debit", normalized_amount),
            )

            await conn.execute(
                """
                UPDATE transfers
                SET
                    status = 'settled',
                    settlement_layer = $2,
                    settlement_tx_id = $3,
                    settled_at = $4
                WHERE id = $1
                """,
                transfer_id,
                settlement_layer,
                settlement_tx_id,
                settled_at,
            )

            settled_transfer = await _fetch_transfer_row(conn, transfer_id)
            sender_balance_after = await conn.fetchval(
                "SELECT available_balance::text FROM balances WHERE institution_id = $1 AND currency = $2",
                sender["id"],
                normalized_currency,
            )
            recipient_balance_after = await conn.fetchval(
                "SELECT available_balance::text FROM balances WHERE institution_id = $1 AND currency = $2",
                recipient["id"],
                normalized_currency,
            )
            settled_transfer["sender_balance_after"] = str(sender_balance_after)
            settled_transfer["recipient_balance_after"] = str(recipient_balance_after)

            event_payload = {
                "type": "transfer.settled",
                "transfer_id": settled_transfer["transfer_id"],
                "sender_institution_id": settled_transfer["sender_institution_id"],
                "recipient_institution_id": settled_transfer["recipient_institution_id"],
                "sender_pseudonymous_id": settled_transfer["sender_pseudonymous_id"],
                "recipient_pseudonymous_id": settled_transfer["recipient_pseudonymous_id"],
                "amount": settled_transfer["amount"],
                "currency": settled_transfer["currency"],
                "status": settled_transfer["status"],
                "settlement_layer": settled_transfer["settlement_layer"],
                "settlement_tx_id": settled_transfer["settlement_tx_id"],
                "settled_at": settled_transfer["settled_at"].isoformat() if settled_transfer["settled_at"] else None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await _append_outbox_event(conn, "transfer.settled", event_payload)

            return settled_transfer


async def list_transfers(
    pool: asyncpg.Pool,
    *,
    status: str | None = None,
    query: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    normalized_query = (query or "").strip()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                t.id::text AS transfer_id,
                t.amount::text AS amount,
                t.currency,
                t.note,
                t.status,
                t.failure_reason,
                t.settlement_layer,
                t.settlement_tx_id,
                t.submitted_at,
                t.settled_at,
                sender.institution_id AS sender_institution_id,
                sender.legal_name AS sender_legal_name,
                sender.cvr_number AS sender_cvr_number,
                sender_wallet.pseudonymous_id AS sender_pseudonymous_id,
                recipient.institution_id AS recipient_institution_id,
                recipient.legal_name AS recipient_legal_name,
                recipient.cvr_number AS recipient_cvr_number,
                recipient_wallet.pseudonymous_id AS recipient_pseudonymous_id
            FROM transfers t
            JOIN institutions sender ON sender.id = t.sender_institution_id
            JOIN wallets sender_wallet ON sender_wallet.institution_id = sender.id
            JOIN institutions recipient ON recipient.id = t.recipient_institution_id
            JOIN wallets recipient_wallet ON recipient_wallet.institution_id = recipient.id
            WHERE
                ($1::text IS NULL OR t.status = $1)
                AND (
                    $2::text = '' OR (
                        sender.legal_name ILIKE '%' || $2 || '%' OR
                        sender.cvr_number ILIKE '%' || $2 || '%' OR
                        sender.institution_id ILIKE '%' || $2 || '%' OR
                        recipient.legal_name ILIKE '%' || $2 || '%' OR
                        recipient.cvr_number ILIKE '%' || $2 || '%' OR
                        recipient.institution_id ILIKE '%' || $2 || '%' OR
                        COALESCE(t.note, '') ILIKE '%' || $2 || '%' OR
                        COALESCE(t.settlement_tx_id, '') ILIKE '%' || $2 || '%'
                    )
                )
            ORDER BY t.submitted_at DESC
            LIMIT $3
            """,
            status,
            normalized_query,
            limit,
        )

    return [dict(row) for row in rows]


async def list_ledger_entries(pool: asyncpg.Pool, *, limit: int = 200) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                le.entry_id,
                le.transfer_id::text,
                le.reserve_deposit_id::text,
                i.institution_id,
                i.legal_name,
                w.pseudonymous_id,
                le.account_ref,
                le.counterparty_ref,
                le.entry_type,
                le.side,
                le.currency,
                le.amount::text AS amount,
                le.description,
                le.created_at
            FROM ledger_entries le
            LEFT JOIN institutions i ON i.id = le.institution_id
            LEFT JOIN wallets w ON w.id = le.wallet_id
            ORDER BY le.entry_id DESC
            LIMIT $1
            """,
            limit,
        )

    return [dict(row) for row in rows]


async def list_balances(pool: asyncpg.Pool, *, limit: int = 200, currency: str | None = None) -> list[dict[str, Any]]:
    currency_filter = currency.upper().strip() if currency else None
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                i.institution_id,
                i.legal_name,
                i.cvr_number,
                i.country,
                i.status,
                w.pseudonymous_id,
                w.is_frozen,
                b.currency,
                b.available_balance::text AS available_balance,
                b.updated_at
            FROM balances b
            JOIN institutions i ON i.id = b.institution_id
            JOIN wallets w ON w.institution_id = i.id
            WHERE ($1::text IS NULL OR b.currency = $1)
            ORDER BY b.available_balance DESC, i.legal_name ASC
            LIMIT $2
            """,
            currency_filter,
            limit,
        )
    return [dict(row) for row in rows]


async def list_network_activity(
    pool: asyncpg.Pool,
    *,
    mode: Literal["global", "institution", "admin"] = "global",
    institution_code: str | None = None,
    reveal_amount: bool = False,
    limit: int = 100,
) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        if mode == "global":
            rows = await conn.fetch(
                """
                SELECT
                    t.id::text AS transfer_id,
                    t.amount,
                    t.currency,
                    t.status,
                    t.submitted_at,
                    t.settlement_layer,
                    sender_wallet.pseudonymous_id AS sender_pseudonymous_id,
                    recipient_wallet.pseudonymous_id AS recipient_pseudonymous_id
                FROM transfers t
                JOIN wallets sender_wallet ON sender_wallet.institution_id = t.sender_institution_id
                JOIN wallets recipient_wallet ON recipient_wallet.institution_id = t.recipient_institution_id
                ORDER BY t.submitted_at DESC
                LIMIT $1
                """,
                limit,
            )
            payload: list[dict[str, Any]] = []
            for row in rows:
                amount_value = Decimal(row["amount"])
                payload.append(
                    {
                        "transfer_id": row["transfer_id"],
                        "sender_pseudonymous_id": row["sender_pseudonymous_id"],
                        "recipient_pseudonymous_id": row["recipient_pseudonymous_id"],
                        "currency": row["currency"],
                        "status": row["status"],
                        "timestamp": row["submitted_at"],
                        "settlement_layer": row["settlement_layer"],
                        "amount": str(amount_value) if reveal_amount else None,
                        "amount_band": amount_band(amount_value),
                    }
                )
            return payload

        if mode == "institution":
            if not institution_code:
                raise DomainError(
                    status_code=400,
                    code="institution_required",
                    message="institution_id is required for institution mode",
                )

            institution_row = await conn.fetchrow(
                "SELECT id, institution_id FROM institutions WHERE institution_id = $1",
                institution_code.strip().upper(),
            )
            if institution_row is None:
                raise DomainError(status_code=404, code="institution_not_found", message="Institution not found")

            rows = await conn.fetch(
                """
                SELECT
                    t.id::text AS transfer_id,
                    t.amount::text AS amount,
                    t.currency,
                    t.status,
                    t.note,
                    t.submitted_at,
                    CASE
                        WHEN t.sender_institution_id = $1 THEN 'outgoing'
                        ELSE 'incoming'
                    END AS direction,
                    counterparty.institution_id AS counterparty_institution_id,
                    counterparty.legal_name AS counterparty_legal_name,
                    counterparty.cvr_number AS counterparty_cvr_number,
                    counterparty.country AS counterparty_country,
                    counterparty_wallet.pseudonymous_id AS counterparty_pseudonymous_id
                FROM transfers t
                JOIN institutions counterparty ON counterparty.id =
                    CASE WHEN t.sender_institution_id = $1 THEN t.recipient_institution_id ELSE t.sender_institution_id END
                JOIN wallets counterparty_wallet ON counterparty_wallet.institution_id = counterparty.id
                WHERE t.sender_institution_id = $1 OR t.recipient_institution_id = $1
                ORDER BY t.submitted_at DESC
                LIMIT $2
                """,
                institution_row["id"],
                limit,
            )

            return [dict(row) for row in rows]

        rows = await conn.fetch(
            """
            SELECT
                t.id::text AS transfer_id,
                t.amount::text AS amount,
                t.currency,
                t.status,
                t.note,
                t.submitted_at,
                t.settlement_layer,
                t.settlement_tx_id,
                sender.institution_id AS sender_institution_id,
                sender.legal_name AS sender_legal_name,
                sender.cvr_number AS sender_cvr_number,
                sender_wallet.pseudonymous_id AS sender_pseudonymous_id,
                recipient.institution_id AS recipient_institution_id,
                recipient.legal_name AS recipient_legal_name,
                recipient.cvr_number AS recipient_cvr_number,
                recipient_wallet.pseudonymous_id AS recipient_pseudonymous_id
            FROM transfers t
            JOIN institutions sender ON sender.id = t.sender_institution_id
            JOIN wallets sender_wallet ON sender_wallet.institution_id = sender.id
            JOIN institutions recipient ON recipient.id = t.recipient_institution_id
            JOIN wallets recipient_wallet ON recipient_wallet.institution_id = recipient.id
            ORDER BY t.submitted_at DESC
            LIMIT $1
            """,
            limit,
        )
        return [dict(row) for row in rows]


async def list_admin_actions(pool: asyncpg.Pool, *, limit: int = 200) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                aa.id,
                aa.action_type,
                aa.actor,
                i.institution_id AS target_institution,
                aa.reason,
                aa.metadata,
                aa.timestamp
            FROM admin_actions aa
            LEFT JOIN institutions i ON i.id = aa.target_institution_id
            ORDER BY aa.timestamp DESC
            LIMIT $1
            """,
            limit,
        )

    return [dict(row) for row in rows]


async def get_overview_metrics(pool: asyncpg.Pool) -> dict[str, Any]:
    async with pool.acquire() as conn:
        approved_count = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE status = 'approved'")
        pending_count = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE status = 'pending'")
        suspended_count = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE status = 'suspended'")
        transfers_24h = await conn.fetchval(
            "SELECT COUNT(*) FROM transfers WHERE submitted_at >= NOW() - INTERVAL '24 hours'"
        )
        settled_24h = await conn.fetchval(
            "SELECT COUNT(*) FROM transfers WHERE status = 'settled' AND submitted_at >= NOW() - INTERVAL '24 hours'"
        )
        failed_24h = await conn.fetchval(
            "SELECT COUNT(*) FROM transfers WHERE status = 'failed' AND submitted_at >= NOW() - INTERVAL '24 hours'"
        )
        volume_24h = await conn.fetchval(
            """
            SELECT COALESCE(SUM(amount), 0)::text
            FROM transfers
            WHERE status = 'settled' AND submitted_at >= NOW() - INTERVAL '24 hours'
            """
        )
        net_balance = await conn.fetchval("SELECT COALESCE(SUM(available_balance), 0)::text FROM balances")
        avg_latency_seconds = await conn.fetchval(
            """
            SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (settled_at - submitted_at))), 0)
            FROM transfers
            WHERE status = 'settled' AND settled_at IS NOT NULL
            """
        )

    return {
        "institutions": {
            "approved": int(approved_count or 0),
            "pending": int(pending_count or 0),
            "suspended": int(suspended_count or 0),
        },
        "transfers_24h": int(transfers_24h or 0),
        "settled_24h": int(settled_24h or 0),
        "failed_24h": int(failed_24h or 0),
        "volume_24h": str(volume_24h or "0"),
        "network_balance": str(net_balance or "0"),
        "avg_settlement_latency_seconds": float(avg_latency_seconds or 0),
    }


async def get_transfer_volume_series(pool: asyncpg.Pool, *, hours: int = 24) -> list[dict[str, Any]]:
    bounded_hours = max(1, min(hours, 168))
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                date_trunc('hour', submitted_at) AS bucket,
                COALESCE(SUM(amount), 0)::text AS volume,
                COUNT(*)::int AS transfer_count
            FROM transfers
            WHERE status = 'settled' AND submitted_at >= NOW() - ($1 * INTERVAL '1 hour')
            GROUP BY 1
            ORDER BY 1 ASC
            """,
            bounded_hours,
        )

    return [
        {
            "bucket": row["bucket"],
            "volume": row["volume"],
            "transfer_count": row["transfer_count"],
        }
        for row in rows
    ]


async def get_top_active_institutions(pool: asyncpg.Pool, *, limit: int = 5) -> list[dict[str, Any]]:
    bounded_limit = max(1, min(limit, 20))
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH activity AS (
                SELECT sender_institution_id AS institution_id, COUNT(*)::int AS tx_count
                FROM transfers
                WHERE submitted_at >= NOW() - INTERVAL '24 hours'
                GROUP BY sender_institution_id
                UNION ALL
                SELECT recipient_institution_id AS institution_id, COUNT(*)::int AS tx_count
                FROM transfers
                WHERE submitted_at >= NOW() - INTERVAL '24 hours'
                GROUP BY recipient_institution_id
            )
            SELECT
                i.institution_id,
                i.legal_name,
                COALESCE(SUM(a.tx_count), 0)::int AS tx_count
            FROM institutions i
            LEFT JOIN activity a ON a.institution_id = i.id
            GROUP BY i.id, i.institution_id, i.legal_name
            ORDER BY tx_count DESC, i.legal_name ASC
            LIMIT $1
            """,
            bounded_limit,
        )
    return [dict(row) for row in rows]


async def replay_balances_from_ledger(pool: asyncpg.Pool) -> dict[str, Any]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("TRUNCATE TABLE balances")
            inserted = await conn.execute(
                """
                INSERT INTO balances (institution_id, currency, available_balance, updated_at)
                SELECT
                    institution_id,
                    currency,
                    SUM(CASE WHEN side = 'debit' THEN amount ELSE -amount END) AS available_balance,
                    NOW()
                FROM ledger_entries
                WHERE institution_id IS NOT NULL
                GROUP BY institution_id, currency
                """
            )
            ledger_count = await conn.fetchval("SELECT COUNT(*) FROM ledger_entries")
            balance_count = await conn.fetchval("SELECT COUNT(*) FROM balances")

    return {
        "status": "ok",
        "insert_result": inserted,
        "ledger_entry_count": int(ledger_count or 0),
        "balance_count": int(balance_count or 0),
    }


async def seed_demo_data(pool: asyncpg.Pool, *, actor: str) -> dict[str, Any]:
    institution_specs = [
        {"legal_name": "Nordic Clearing Bank A/S", "cvr_number": "DK10020030", "country": "DK", "target": Decimal("2500000")},
        {"legal_name": "Rhein Settlement Bank AG", "cvr_number": "DE20456789", "country": "DE", "target": Decimal("1800000")},
        {"legal_name": "Iberia Payment Institution SA", "cvr_number": "ESB12004567", "country": "ES", "target": Decimal("1300000")},
        {"legal_name": "Alpine Treasury Services GmbH", "cvr_number": "ATU77889901", "country": "AT", "target": Decimal("900000")},
        {"legal_name": "Benelux Liquidity Hub NV", "cvr_number": "NL81234567", "country": "NL", "target": Decimal("1100000")},
    ]

    created = 0
    deposits = 0
    seeded_transfers = 0
    codes: list[str] = []

    async with pool.acquire() as conn:
        for spec in institution_specs:
            existing = await conn.fetchrow(
                """
                SELECT institution_id, status
                FROM institutions
                WHERE cvr_number = $1
                """,
                spec["cvr_number"],
            )

            if existing is None:
                created_row = await create_institution(
                    pool,
                    legal_name=spec["legal_name"],
                    cvr_number=spec["cvr_number"],
                    country=spec["country"],
                    actor=actor,
                    reason="Demo seed onboarding",
                )
                created += 1
                institution_code = created_row["institution_id"]
            else:
                institution_code = existing["institution_id"]

            codes.append(institution_code)

            if existing is None or existing["status"] != "approved":
                await approve_institution(
                    pool,
                    institution_code=institution_code,
                    actor=actor,
                    reason="Demo seed approval",
                )

            await unfreeze_wallet(
                pool,
                institution_code=institution_code,
                actor=actor,
                reason="Demo seed unfreeze",
            )

            institution_balance = await conn.fetchval(
                """
                SELECT b.available_balance
                FROM balances b
                JOIN institutions i ON i.id = b.institution_id
                WHERE i.institution_id = $1 AND b.currency = 'EUR'
                """,
                institution_code,
            )
            current_balance = Decimal(institution_balance or 0)
            top_up = spec["target"] - current_balance
            if top_up > 0:
                await record_reserve_deposit(
                    pool,
                    institution_code=institution_code,
                    amount=top_up,
                    currency="EUR",
                    reference=f"DEMO-RESERVE-{institution_code}",
                    actor=actor,
                )
                deposits += 1

        seed_flows = [
            (0, 1, Decimal("120000")),
            (1, 2, Decimal("90000")),
            (2, 3, Decimal("45000")),
            (3, 4, Decimal("30000")),
            (4, 0, Decimal("75000")),
            (0, 2, Decimal("51000")),
            (1, 4, Decimal("62000")),
        ]

        for index, (sender_idx, recipient_idx, amount) in enumerate(seed_flows, start=1):
            note = f"DEMO-SEED-TRANSFER-{index}"
            if await _transfer_note_exists(conn, note):
                continue

            result = await create_transfer(
                pool,
                sender_institution_code=codes[sender_idx],
                recipient_institution_code=codes[recipient_idx],
                amount=amount,
                currency="EUR",
                note=note,
                actor=actor,
            )
            if result["status"] == "settled":
                seeded_transfers += 1

    return {
        "status": "ok",
        "institutions_created": created,
        "reserve_deposits_recorded": deposits,
        "transfers_seeded": seeded_transfers,
        "institution_ids": codes,
    }


async def latest_events(pool: asyncpg.Pool, *, limit: int = 100) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, event_type, payload, created_at, published_at
            FROM outbox_events
            ORDER BY id DESC
            LIMIT $1
            """,
            limit,
        )

    return [dict(row) for row in rows]


async def mark_outbox_published(pool: asyncpg.Pool, outbox_id: int) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE outbox_events SET published_at = NOW() WHERE id = $1",
            outbox_id,
        )


async def publish_custom_event(pool: asyncpg.Pool, *, event_type: str, payload: dict[str, Any]) -> int:
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await _append_outbox_event(conn, event_type, payload)
