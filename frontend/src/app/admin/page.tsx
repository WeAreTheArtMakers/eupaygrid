'use client';

import { useEffect, useState } from 'react';

import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import ShellCard from '@/components/ShellCard';
import StatusPill from '@/components/StatusPill';
import { useToasts } from '@/components/ToastProvider';
import { api } from '@/lib/api';
import { formatMoney, formatShortDate } from '@/lib/format';
import { AuditAction, Institution, Transfer, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

export default function AdminPage(): React.JSX.Element {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [auditLog, setAuditLog] = useState<AuditAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [governanceTarget, setGovernanceTarget] = useState('');
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const { pushError, pushSuccess } = useToasts();

  const refresh = async () => {
    setLoading(true);
    try {
      const [institutionRows, transferRows, auditRows] = await Promise.all([
        api.listInstitutions(''),
        api.listTransfers(query, statusFilter || undefined),
        api.auditLog(500)
      ]);
      setInstitutions(institutionRows);
      setTransfers(transferRows);
      setAuditLog(auditRows);
      if (!governanceTarget && institutionRows.length > 0) {
        setGovernanceTarget(institutionRows[0].institution_id);
      }
    } catch (error) {
      pushError(String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [statusFilter]);

  useEventStream((payload: WsSnapshot) => {
    if (
      payload.type === 'transfer.settled' ||
      payload.type === 'transfer.failed' ||
      payload.type === 'institution.approved' ||
      payload.type === 'institution.suspended' ||
      payload.type === 'wallet.frozen' ||
      payload.type === 'wallet.unfrozen' ||
      payload.type === 'reserve_deposit.recorded'
    ) {
      void refresh();
    }
  });

  const runGovernanceAction = async (action: 'approve' | 'suspend' | 'freeze' | 'unfreeze') => {
    if (!governanceTarget) {
      return;
    }
    setGovernanceBusy(true);
    try {
      if (action === 'approve') {
        await api.approveInstitution(governanceTarget, 'Approved from admin governance panel');
      }
      if (action === 'suspend') {
        await api.suspendInstitution(governanceTarget, 'Suspended from admin governance panel');
      }
      if (action === 'freeze') {
        await api.freezeInstitution(governanceTarget, 'Frozen from admin governance panel');
      }
      if (action === 'unfreeze') {
        await api.unfreezeInstitution(governanceTarget, 'Unfrozen from admin governance panel');
      }
      pushSuccess(`Governance action completed: ${action}`);
      await refresh();
    } catch (error) {
      pushError(String(error));
    } finally {
      setGovernanceBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin & Governance"
        subtitle="Network-wide transfer supervision and governance audit trail."
        actions={
          <button
            onClick={() => void refresh()}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        }
      />

      <ShellCard title="Governance Controls" subtitle="Approve, suspend, freeze, and unfreeze institutions from one panel.">
        {loading ? (
          <LoadingState label="Loading institutions..." />
        ) : institutions.length === 0 ? (
          <EmptyState title="No institutions available" body="Create institutions from the onboarding page first." />
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:max-w-xl"
              value={governanceTarget}
              onChange={(event) => setGovernanceTarget(event.target.value)}
            >
              {institutions.map((institution) => (
                <option key={institution.institution_id} value={institution.institution_id}>
                  {institution.institution_id} - {institution.legal_name} ({institution.status}
                  {institution.is_frozen ? ', frozen' : ''})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={governanceBusy}
                onClick={() => void runGovernanceAction('approve')}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve
              </button>
              <button
                disabled={governanceBusy}
                onClick={() => void runGovernanceAction('suspend')}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Suspend
              </button>
              <button
                disabled={governanceBusy}
                onClick={() => void runGovernanceAction('freeze')}
                className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Freeze
              </button>
              <button
                disabled={governanceBusy}
                onClick={() => void runGovernanceAction('unfreeze')}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Unfreeze
              </button>
            </div>
          </div>
        )}
      </ShellCard>

      <ShellCard title="All Transfers" subtitle="Filterable transfer records for governance operations.">
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search institution, CVR, note, tx id"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="settled">Settled</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={() => void refresh()}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Search
          </button>
        </div>

        {loading ? (
          <LoadingState label="Loading transfer records..." />
        ) : transfers.length === 0 ? (
          <EmptyState title="No transfer records" body="Transfers will appear here as they are submitted." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Sender</th>
                  <th className="px-2 py-2">Recipient</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {transfers.slice(0, 300).map((transfer) => (
                  <tr key={transfer.transfer_id} className="border-b border-slate-100 last:border-none">
                    <td className="px-2 py-2 text-slate-600">{formatShortDate(transfer.submitted_at)}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-900">{transfer.sender_institution_id}</div>
                      <div className="text-xs text-slate-500">{transfer.sender_legal_name}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-900">{transfer.recipient_institution_id}</div>
                      <div className="text-xs text-slate-500">{transfer.recipient_legal_name}</div>
                    </td>
                    <td className="px-2 py-2 font-medium">{formatMoney(transfer.amount, transfer.currency)}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={transfer.status} />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-600">{transfer.settlement_tx_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>

      <ShellCard title="Governance Audit Log" subtitle="Action type, actor, target institution, reason, and timestamp.">
        {loading ? (
          <LoadingState label="Loading audit log..." />
        ) : auditLog.length === 0 ? (
          <EmptyState title="No governance actions" body="Admin actions are logged here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Timestamp</th>
                  <th className="px-2 py-2">Action Type</th>
                  <th className="px-2 py-2">Actor</th>
                  <th className="px-2 py-2">Target Institution</th>
                  <th className="px-2 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-none">
                    <td className="px-2 py-2 text-slate-600">{formatShortDate(entry.timestamp)}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={entry.action_type} />
                    </td>
                    <td className="px-2 py-2 text-slate-700">{entry.actor}</td>
                    <td className="px-2 py-2">{entry.target_institution || '-'}</td>
                    <td className="px-2 py-2 text-xs text-slate-600">{entry.reason}</td>
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
