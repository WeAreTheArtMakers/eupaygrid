import {
  AuditAction,
  BalanceRow,
  Institution,
  LedgerEntry,
  NetworkGlobalRow,
  OverviewMetrics,
  TopInstitutionPoint,
  Transfer,
  TransferVolumePoint
} from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
const DEFAULT_ACTOR = process.env.NEXT_PUBLIC_DEFAULT_ACTOR || 'ui-operator@eupaygrid.local';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  overviewMetrics: () => request<OverviewMetrics>('/overview/metrics'),
  transferVolume: (hours = 24) => request<TransferVolumePoint[]>(`/overview/transfer-volume?hours=${hours}`),
  topInstitutions: (limit = 5) => request<TopInstitutionPoint[]>(`/overview/top-institutions?limit=${limit}`),

  listInstitutions: (query = '', status?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    params.set('limit', '500');
    return request<Institution[]>(`/institutions?${params.toString()}`);
  },
  createInstitution: (payload: {
    institution_id?: string;
    legal_name: string;
    cvr_number: string;
    country: string;
    reason?: string;
  }) =>
    request<Institution>('/institutions', {
      method: 'POST',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify(payload)
    }),
  approveInstitution: (institutionId: string, reason = 'Institution approved by operator') =>
    request<Institution>(`/institutions/${encodeURIComponent(institutionId)}/approve`, {
      method: 'PATCH',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify({ reason })
    }),
  suspendInstitution: (institutionId: string, reason = 'Institution suspended by operator') =>
    request<Institution>(`/institutions/${encodeURIComponent(institutionId)}/suspend`, {
      method: 'PATCH',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify({ reason })
    }),
  freezeInstitution: (institutionId: string, reason = 'Wallet frozen by operator') =>
    request<Institution>(`/institutions/${encodeURIComponent(institutionId)}/freeze`, {
      method: 'PATCH',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify({ reason })
    }),
  unfreezeInstitution: (institutionId: string, reason = 'Wallet unfrozen by operator') =>
    request<Institution>(`/institutions/${encodeURIComponent(institutionId)}/unfreeze`, {
      method: 'PATCH',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify({ reason })
    }),

  reserveDeposit: (payload: { institution_id: string; amount: number; currency: string; reference: string }) =>
    request<Record<string, string>>('/reserves/deposit', {
      method: 'POST',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify(payload)
    }),

  createTransfer: (payload: {
    sender_institution_id: string;
    recipient_institution_id: string;
    amount: number;
    currency: string;
    note?: string;
  }) =>
    request<Transfer>('/transfers', {
      method: 'POST',
      headers: { 'x-actor': DEFAULT_ACTOR },
      body: JSON.stringify(payload)
    }),
  listTransfers: (query = '', status?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    params.set('limit', '500');
    return request<Transfer[]>(`/transfers?${params.toString()}`);
  },

  listLedgerEntries: (limit = 500) => request<LedgerEntry[]>(`/ledger/entries?limit=${limit}`),
  replayLedger: () => request<Record<string, unknown>>('/ledger/replay', { method: 'POST' }),
  listBalances: (limit = 500) => request<BalanceRow[]>(`/balances?limit=${limit}`),
  networkActivityGlobal: (revealAmount = false) =>
    request<NetworkGlobalRow[]>(`/network/activity?mode=global&reveal_amount=${String(revealAmount)}&limit=300`),
  networkActivityInstitution: (institutionId: string) =>
    request<Record<string, unknown>[]>(
      `/network/activity?mode=institution&institution_id=${encodeURIComponent(institutionId)}&limit=300`
    ),
  adminNetworkActivity: () => request<Record<string, unknown>[]>(`/network/activity?mode=admin&limit=500`),

  auditLog: (limit = 500) => request<AuditAction[]>(`/admin/audit-log?limit=${limit}`),
  demoSeed: () =>
    request<Record<string, unknown>>('/demo/seed', {
      method: 'POST',
      headers: { 'x-actor': DEFAULT_ACTOR }
    })
};

export { API_BASE };
