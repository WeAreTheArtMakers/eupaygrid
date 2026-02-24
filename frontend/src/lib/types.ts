export type InstitutionStatus = 'pending' | 'approved' | 'suspended';

export type Institution = {
  institution_id: string;
  legal_name: string;
  cvr_number: string;
  country: string;
  status: InstitutionStatus;
  created_at: string;
  pseudonymous_id: string;
  is_frozen: boolean;
  eur_balance?: string;
};

export type TransferStatus = 'submitted' | 'settled' | 'failed';

export type Transfer = {
  transfer_id: string;
  amount: string;
  currency: string;
  note: string | null;
  status: TransferStatus;
  failure_reason: string | null;
  settlement_layer: string | null;
  settlement_tx_id: string | null;
  submitted_at: string;
  settled_at: string | null;
  sender_institution_id: string;
  sender_legal_name: string;
  sender_cvr_number: string;
  sender_pseudonymous_id: string;
  recipient_institution_id: string;
  recipient_legal_name: string;
  recipient_cvr_number: string;
  recipient_pseudonymous_id: string;
  sender_balance_after?: string;
  recipient_balance_after?: string;
};

export type BalanceRow = {
  institution_id: string;
  legal_name: string;
  cvr_number: string;
  country: string;
  status: InstitutionStatus;
  pseudonymous_id: string;
  is_frozen: boolean;
  currency: string;
  available_balance: string;
  updated_at: string;
};

export type LedgerEntry = {
  entry_id: number;
  transfer_id: string | null;
  reserve_deposit_id: string | null;
  institution_id: string | null;
  legal_name: string | null;
  pseudonymous_id: string | null;
  account_ref: string;
  counterparty_ref: string | null;
  entry_type: 'transfer' | 'reserve_deposit';
  side: 'debit' | 'credit';
  currency: string;
  amount: string;
  description: string | null;
  created_at: string;
};

export type OverviewMetrics = {
  institutions: {
    approved: number;
    pending: number;
    suspended: number;
  };
  transfers_24h: number;
  settled_24h: number;
  failed_24h: number;
  volume_24h: string;
  network_balance: string;
  avg_settlement_latency_seconds: number;
};

export type TransferVolumePoint = {
  bucket: string;
  volume: string;
  transfer_count: number;
};

export type TopInstitutionPoint = {
  institution_id: string;
  legal_name: string;
  tx_count: number;
};

export type AuditAction = {
  id: number;
  action_type: string;
  actor: string;
  target_institution: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  timestamp: string;
};

export type NetworkGlobalRow = {
  transfer_id: string;
  sender_pseudonymous_id: string;
  recipient_pseudonymous_id: string;
  currency: string;
  status: string;
  timestamp: string;
  settlement_layer: string | null;
  amount: string | null;
  amount_band: string;
};

export type WsSnapshot = {
  type: string;
  overview?: OverviewMetrics;
  balances?: BalanceRow[];
  transfers?: Transfer[];
};
