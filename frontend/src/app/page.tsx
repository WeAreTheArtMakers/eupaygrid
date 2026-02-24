'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import EmptyState from '@/components/EmptyState';
import KpiCard from '@/components/KpiCard';
import LoadingState from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import ShellCard from '@/components/ShellCard';
import StatusPill from '@/components/StatusPill';
import { useToasts } from '@/components/ToastProvider';
import { api } from '@/lib/api';
import { formatMoney, formatShortDate } from '@/lib/format';
import { OverviewMetrics, TopInstitutionPoint, Transfer, TransferVolumePoint, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

export default function OverviewPage(): React.JSX.Element {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [volumeSeries, setVolumeSeries] = useState<TransferVolumePoint[]>([]);
  const [topInstitutions, setTopInstitutions] = useState<TopInstitutionPoint[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);
  const { pushError, pushSuccess } = useToasts();

  const refresh = async () => {
    setLoading(true);
    try {
      const [metricRes, volumeRes, topRes, transferRes] = await Promise.all([
        api.overviewMetrics(),
        api.transferVolume(24),
        api.topInstitutions(8),
        api.listTransfers('', undefined)
      ]);
      setMetrics(metricRes);
      setVolumeSeries(volumeRes);
      setTopInstitutions(topRes);
      setRecentTransfers(transferRes.slice(0, 10));
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
    if (payload.type === 'snapshot') {
      if (payload.overview) {
        setMetrics(payload.overview);
      }
      if (payload.transfers) {
        setRecentTransfers(payload.transfers.slice(0, 10));
      }
    }
  });

  const volumeChartRows = useMemo(
    () =>
      volumeSeries.map((row) => ({
        bucket: formatShortDate(row.bucket),
        volume: Number(row.volume),
        transfer_count: row.transfer_count
      })),
    [volumeSeries]
  );

  const topChartRows = useMemo(
    () => topInstitutions.map((item) => ({ label: item.institution_id, tx_count: item.tx_count })),
    [topInstitutions]
  );

  const seedDemo = async () => {
    setSeedLoading(true);
    try {
      await api.demoSeed();
      pushSuccess('Demo data generated');
      await refresh();
    } catch (error) {
      pushError(String(error));
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settlement Overview"
        subtitle="Permissioned institutional network health and transfer flow."
        actions={
          <>
            <button
              onClick={() => void refresh()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              onClick={seedDemo}
              disabled={seedLoading}
              className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
            >
              {seedLoading ? 'Seeding...' : 'Demo Mode Seed'}
            </button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Approved Institutions"
          value={String(metrics?.institutions.approved ?? 0)}
          helper={`Pending ${metrics?.institutions.pending ?? 0} · Suspended ${metrics?.institutions.suspended ?? 0}`}
        />
        <KpiCard
          label="Settled Transfers (24h)"
          value={String(metrics?.settled_24h ?? 0)}
          helper={`Failed ${metrics?.failed_24h ?? 0} / Total ${metrics?.transfers_24h ?? 0}`}
        />
        <KpiCard
          label="Settlement Volume (24h)"
          value={formatMoney(metrics?.volume_24h ?? '0')}
          helper="Settled transfer sum"
        />
        <KpiCard
          label="Avg Settlement Latency"
          value={`${(metrics?.avg_settlement_latency_seconds ?? 0).toFixed(2)}s`}
          helper="Submitted to settled"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ShellCard title="Transfer Volume" subtitle="Hourly settled transfer volume (24h)">
          {loading ? (
            <LoadingState label="Loading volume series..." />
          ) : volumeChartRows.length === 0 ? (
            <EmptyState title="No settled transfers" body="Run demo seed or submit transfers to visualize volume." />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volumeChartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatMoney(Number(value), 'EUR')} />
                  <Line type="monotone" dataKey="volume" stroke="#0F766E" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ShellCard>

        <ShellCard title="Top Active Institutions" subtitle="By transfer participation (24h)">
          {loading ? (
            <LoadingState label="Loading institution activity..." />
          ) : topChartRows.length === 0 ? (
            <EmptyState title="No activity yet" body="Activity appears once transfers are submitted." />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topChartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="tx_count" fill="#1B263B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ShellCard>
      </section>

      <ShellCard title="Recent Transfers" subtitle="Live transfer feed">
        {loading ? (
          <LoadingState label="Loading transfers..." />
        ) : recentTransfers.length === 0 ? (
          <EmptyState title="No transfers yet" body="Create transfer records in the transfer console." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Timestamp</th>
                  <th className="px-2 py-2">Sender</th>
                  <th className="px-2 py-2">Recipient</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {recentTransfers.map((transfer) => (
                  <tr key={transfer.transfer_id} className="border-b border-slate-100 last:border-none">
                    <td className="px-2 py-2 text-slate-600">{formatShortDate(transfer.submitted_at)}</td>
                    <td className="px-2 py-2">{transfer.sender_institution_id}</td>
                    <td className="px-2 py-2">{transfer.recipient_institution_id}</td>
                    <td className="px-2 py-2 font-medium">{formatMoney(transfer.amount, transfer.currency)}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={transfer.status} />
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">{transfer.settlement_tx_id || '-'}</td>
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
