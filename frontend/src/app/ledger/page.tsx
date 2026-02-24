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
import { LedgerEntry, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

export default function LedgerPage(): React.JSX.Element {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const { pushError, pushSuccess } = useToasts();

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await api.listLedgerEntries(800);
      setEntries(rows);
    } catch (error) {
      pushError(String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEventStream((payload: WsSnapshot) => {
    if (payload.type === 'transfer.settled' || payload.type === 'reserve_deposit.recorded') {
      void refresh();
    }
  });

  const replayLedger = async () => {
    setReplaying(true);
    try {
      await api.replayLedger();
      pushSuccess('Balances replayed from immutable ledger');
    } catch (error) {
      pushError(String(error));
    } finally {
      setReplaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ledger Entries"
        subtitle="Immutable double-entry records for transfers and reserve deposits."
        actions={
          <>
            <button
              onClick={() => void refresh()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              onClick={replayLedger}
              disabled={replaying}
              className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
            >
              {replaying ? 'Replaying...' : 'Replay Balances'}
            </button>
          </>
        }
      />

      <ShellCard title="Ledger Journal" subtitle="Append-only entries ordered by insertion id.">
        {loading ? (
          <LoadingState label="Loading ledger entries..." />
        ) : entries.length === 0 ? (
          <EmptyState title="No ledger entries" body="Record a reserve deposit or transfer to populate this view." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Entry ID</th>
                  <th className="px-2 py-2">Timestamp</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Institution</th>
                  <th className="px-2 py-2">Account Ref</th>
                  <th className="px-2 py-2">Counterparty</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.entry_id} className="border-b border-slate-100 last:border-none">
                    <td className="px-2 py-2 font-mono text-xs">{entry.entry_id}</td>
                    <td className="px-2 py-2 text-slate-600">{formatShortDate(entry.created_at)}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={entry.entry_type} />
                    </td>
                    <td className="px-2 py-2">
                      {entry.institution_id ? (
                        <>
                          <div className="font-medium text-slate-900">{entry.institution_id}</div>
                          <div className="text-xs text-slate-500">{entry.legal_name}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">System Account</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-700">{entry.account_ref}</td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-600">{entry.counterparty_ref || '-'}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={entry.side} />
                    </td>
                    <td className="px-2 py-2 font-medium">{formatMoney(entry.amount, entry.currency)}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">{entry.description || '-'}</td>
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
