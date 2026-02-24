'use client';

import { useEffect, useMemo, useState } from 'react';

import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import ShellCard from '@/components/ShellCard';
import StatusPill from '@/components/StatusPill';
import { useToasts } from '@/components/ToastProvider';
import { api } from '@/lib/api';
import { formatMoney, formatShortDate } from '@/lib/format';
import { Institution, NetworkGlobalRow, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

type Mode = 'global' | 'institution' | 'admin';

export default function NetworkPage(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('global');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [revealAmount, setRevealAmount] = useState(false);
  const [rows, setRows] = useState<NetworkGlobalRow[] | Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const { pushError } = useToasts();

  const refresh = async () => {
    setLoading(true);
    try {
      const institutionRes = await api.listInstitutions('');
      setInstitutions(institutionRes);

      if (mode === 'global') {
        const globalRows = await api.networkActivityGlobal(revealAmount);
        setRows(globalRows);
      } else if (mode === 'institution') {
        const target = institutionId || institutionRes[0]?.institution_id || '';
        if (target) {
          setInstitutionId(target);
          const institutionRows = await api.networkActivityInstitution(target);
          setRows(institutionRows);
        } else {
          setRows([]);
        }
      } else {
        const adminRows = await api.adminNetworkActivity();
        setRows(adminRows);
      }
    } catch (error) {
      pushError(String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [mode, revealAmount]);

  useEventStream((payload: WsSnapshot) => {
    if (payload.type === 'transfer.settled' || payload.type === 'transfer.failed') {
      void refresh();
    }
  });

  const title = useMemo(() => {
    if (mode === 'global') return 'Global Privacy View';
    if (mode === 'institution') return 'Institution Context View';
    return 'Admin Full Visibility';
  }, [mode]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Activity"
        subtitle="Privacy-aware transfer observability by context and role."
        actions={
          <button
            onClick={() => void refresh()}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        }
      />

      <ShellCard title="View Controls" subtitle="Switch context between global, institution, and admin modes.">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex gap-2">
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'global' ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setMode('global')}
            >
              Global
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'institution' ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setMode('institution')}
            >
              Institution
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'admin' ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setMode('admin')}
            >
              Admin
            </button>
          </div>

          {mode === 'global' ? (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={revealAmount}
                onChange={(event) => setRevealAmount(event.target.checked)}
              />
              Reveal exact amount
            </label>
          ) : null}

          {mode === 'institution' ? (
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={institutionId}
              onChange={(event) => setInstitutionId(event.target.value)}
            >
              {institutions.map((institution) => (
                <option key={institution.institution_id} value={institution.institution_id}>
                  {institution.institution_id} - {institution.legal_name}
                </option>
              ))}
            </select>
          ) : null}

          {mode === 'institution' ? (
            <button
              onClick={() => void refresh()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Load Institution View
            </button>
          ) : null}
        </div>
      </ShellCard>

      <ShellCard title={title} subtitle="Transfer activity table based on selected privacy mode.">
        {loading ? (
          <LoadingState label="Loading network activity..." />
        ) : rows.length === 0 ? (
          <EmptyState title="No activity" body="Transfer activity will appear once transactions are submitted." />
        ) : mode === 'global' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Sender ID</th>
                  <th className="px-2 py-2">Recipient ID</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(rows as NetworkGlobalRow[]).map((row) => (
                  <tr key={row.transfer_id} className="border-b border-slate-100 last:border-none">
                    <td className="px-2 py-2 text-slate-600">{formatShortDate(row.timestamp)}</td>
                    <td className="px-2 py-2 font-mono text-xs">{row.sender_pseudonymous_id}</td>
                    <td className="px-2 py-2 font-mono text-xs">{row.recipient_pseudonymous_id}</td>
                    <td className="px-2 py-2">{row.amount ? formatMoney(row.amount, row.currency) : row.amount_band}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Direction</th>
                  <th className="px-2 py-2">Counterparty</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Reference</th>
                </tr>
              </thead>
              <tbody>
                {(rows as Record<string, unknown>[]).map((row, index) => (
                  <tr key={`${String(row.transfer_id || index)}`} className="border-b border-slate-100 last:border-none">
                    <td className="px-2 py-2 text-slate-600">{formatShortDate(String(row.submitted_at || row.timestamp || ''))}</td>
                    <td className="px-2 py-2 text-slate-700">{String(row.direction || '-')}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-900">{String(row.counterparty_institution_id || row.recipient_institution_id || '-')}</div>
                      <div className="text-xs text-slate-500">{String(row.counterparty_legal_name || row.recipient_legal_name || '-')}</div>
                    </td>
                    <td className="px-2 py-2 font-medium">{formatMoney(String(row.amount || '0'), String(row.currency || 'EUR'))}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={String(row.status || '-')} />
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">{String(row.note || row.settlement_tx_id || '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>
    </div>
  );
}
