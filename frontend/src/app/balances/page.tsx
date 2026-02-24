'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import ShellCard from '@/components/ShellCard';
import StatusPill from '@/components/StatusPill';
import { useToasts } from '@/components/ToastProvider';
import { api } from '@/lib/api';
import { formatMoney, formatShortDate } from '@/lib/format';
import { BalanceRow, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

export default function BalancesPage(): React.JSX.Element {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { pushError } = useToasts();

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await api.listBalances(800);
      setRows(data);
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
    if (payload.type === 'snapshot' && payload.balances) {
      setRows(payload.balances);
      return;
    }
    if (payload.type === 'transfer.settled' || payload.type === 'reserve_deposit.recorded') {
      void refresh();
    }
  });

  const chartData = useMemo(
    () =>
      rows
        .slice(0, 10)
        .map((row) => ({ label: row.institution_id, balance: Number(row.available_balance) }))
        .sort((a, b) => b.balance - a.balance),
    [rows]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Institution Balances"
        subtitle="Materialized balance projection from immutable ledger entries."
        actions={
          <button
            onClick={() => void refresh()}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <ShellCard title="Top Balances" subtitle="Largest EUR balances by institution">
          {loading ? (
            <LoadingState label="Loading balance chart..." />
          ) : chartData.length === 0 ? (
            <EmptyState title="No balance records" body="Record reserve deposits first." />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatMoney(Number(value), 'EUR')} />
                  <Bar dataKey="balance" fill="#0D1B2A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ShellCard>

        <ShellCard title="Balance Registry" subtitle="Operational view by institution and wallet state.">
          {loading ? (
            <LoadingState label="Loading balances..." />
          ) : rows.length === 0 ? (
            <EmptyState title="No balances found" body="No institutions with balances yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Institution</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Wallet</th>
                    <th className="px-2 py-2">Currency</th>
                    <th className="px-2 py-2">Available</th>
                    <th className="px-2 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.institution_id}-${row.currency}`} className="border-b border-slate-100 last:border-none">
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-900">{row.institution_id}</div>
                        <div className="text-xs text-slate-500">{row.legal_name}</div>
                      </td>
                      <td className="px-2 py-2">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-2 py-2">
                        <StatusPill status={row.is_frozen ? 'frozen' : 'active'} />
                      </td>
                      <td className="px-2 py-2">{row.currency}</td>
                      <td className="px-2 py-2 font-medium">{formatMoney(row.available_balance, row.currency)}</td>
                      <td className="px-2 py-2 text-xs text-slate-500">{formatShortDate(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>
      </section>
    </div>
  );
}
