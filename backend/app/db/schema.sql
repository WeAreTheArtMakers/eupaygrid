CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_mutation_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Table % is append-only; mutation blocked', TG_TABLE_NAME;
END;
$$;

CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id TEXT NOT NULL UNIQUE,
    legal_name TEXT NOT NULL,
    cvr_number TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL UNIQUE,
    pseudonymous_id TEXT NOT NULL UNIQUE,
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS balances (
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3,8}$'),
    available_balance NUMERIC(24, 6) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (institution_id, currency)
);

CREATE TABLE IF NOT EXISTS reserve_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    amount NUMERIC(24, 6) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3,8}$'),
    reference TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_institution_id UUID NOT NULL REFERENCES institutions(id),
    recipient_institution_id UUID NOT NULL REFERENCES institutions(id),
    amount NUMERIC(24, 6) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3,8}$'),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'settled', 'failed')),
    failure_reason TEXT,
    settlement_layer TEXT,
    settlement_tx_id TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    CHECK (sender_institution_id <> recipient_institution_id)
);

CREATE TABLE IF NOT EXISTS settlement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
    settlement_layer TEXT NOT NULL,
    settlement_tx_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('recorded', 'failed')),
    settled_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id BIGSERIAL PRIMARY KEY,
    transfer_id UUID REFERENCES transfers(id) ON DELETE SET NULL,
    reserve_deposit_id UUID REFERENCES reserve_deposits(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    counterparty_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    account_ref TEXT NOT NULL,
    counterparty_ref TEXT,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('transfer', 'reserve_deposit')),
    side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3,8}$'),
    amount NUMERIC(24, 6) NOT NULL CHECK (amount > 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((transfer_id IS NOT NULL) <> (reserve_deposit_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS admin_actions (
    id BIGSERIAL PRIMARY KEY,
    action_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    target_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS processed_events (
    consumer_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (consumer_name, event_id)
);

CREATE INDEX IF NOT EXISTS idx_institutions_search_name ON institutions USING GIN (to_tsvector('simple', legal_name));
CREATE INDEX IF NOT EXISTS idx_institutions_cvr ON institutions(cvr_number);
CREATE INDEX IF NOT EXISTS idx_wallets_pseudonymous ON wallets(pseudonymous_id);
CREATE INDEX IF NOT EXISTS idx_transfers_submitted_at ON transfers(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_recipient ON transfers(sender_institution_id, recipient_institution_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_institution ON ledger_entries(institution_id, currency);
CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_reserve_deposits_created_at ON reserve_deposits(created_at DESC);

DROP TRIGGER IF EXISTS trg_institutions_updated_at ON institutions;
CREATE TRIGGER trg_institutions_updated_at
BEFORE UPDATE ON institutions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
CREATE TRIGGER trg_wallets_updated_at
BEFORE UPDATE ON wallets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_balances_updated_at ON balances;
CREATE TRIGGER trg_balances_updated_at
BEFORE UPDATE ON balances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_no_update_delete_ledger_entries ON ledger_entries;
CREATE TRIGGER trg_no_update_delete_ledger_entries
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_append_only();

DROP TRIGGER IF EXISTS trg_no_update_delete_settlement_events ON settlement_events;
CREATE TRIGGER trg_no_update_delete_settlement_events
BEFORE UPDATE OR DELETE ON settlement_events
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_append_only();
