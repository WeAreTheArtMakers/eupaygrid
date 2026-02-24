'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import PageHeader from '@/components/PageHeader';
import ShellCard from '@/components/ShellCard';
import StatusPill from '@/components/StatusPill';
import { useToasts } from '@/components/ToastProvider';
import { api } from '@/lib/api';
import { formatMoney, formatShortDate } from '@/lib/format';
import { Institution, Transfer, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

export default function TransfersPage(): React.JSX.Element {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTransfer, setSendingTransfer] = useState(false);
  const [recordingReserve, setRecordingReserve] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [transferForm, setTransferForm] = useState({
    sender_institution_id: '',
    recipient_institution_id: '',
    amount: '25000',
    currency: 'EUR',
    note: 'Operational settlement'
  });

  const [reserveForm, setReserveForm] = useState({
    institution_id: '',
    amount: '500000',
    currency: 'EUR',
    reference: 'RESERVE-TOPUP'
  });

  const { pushError, pushSuccess } = useToasts();

  const approvedInstitutions = useMemo(
    () => institutions.filter((institution) => institution.status === 'approved'),
    [institutions]
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [institutionRes, transferRes] = await Promise.all([
        api.listInstitutions(''),
        api.listTransfers(searchQuery, statusFilter || undefined)
      ]);
      setInstitutions(institutionRes);
      setTransfers(transferRes);

      const approved = institutionRes.filter((institution) => institution.status === 'approved');
      if (approved.length >= 2 && !transferForm.sender_institution_id) {
        setTransferForm((prev) => ({
          ...prev,
          sender_institution_id: approved[0].institution_id,
          recipient_institution_id: approved[1].institution_id
        }));
      }
      if (approved.length >= 1 && !reserveForm.institution_id) {
        setReserveForm((prev) => ({ ...prev, institution_id: approved[0].institution_id }));
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
      payload.type === 'reserve_deposit.recorded' ||
      payload.type === 'snapshot'
    ) {
      void refresh();
    }
  });

  const onSendTransfer = async (event: FormEvent) => {
    event.preventDefault();
    setSendingTransfer(true);
    try {
      const response = await api.createTransfer({
        sender_institution_id: transferForm.sender_institution_id,
        recipient_institution_id: transferForm.recipient_institution_id,
        amount: Number(transferForm.amount),
        currency: transferForm.currency,
        note: transferForm.note
      });
      if (response.status === 'settled') {
        pushSuccess('Transfer settled');
      } else {
        pushError(`Transfer failed: ${response.failure_reason || 'Unknown error'}`);
      }
      await refresh();
    } catch (error) {
      pushError(String(error));
    } finally {
      setSendingTransfer(false);
    }
  };

  const onReserveDeposit = async (event: FormEvent) => {
    event.preventDefault();
    setRecordingReserve(true);
    try {
      await api.reserveDeposit({
        institution_id: reserveForm.institution_id,
        amount: Number(reserveForm.amount),
        currency: reserveForm.currency,
        reference: reserveForm.reference
      });
      pushSuccess('Reserve deposit recorded');
      await refresh();
    } catch (error) {
      pushError(String(error));
    } finally {
      setRecordingReserve(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Transfer Console" subtitle="Institutional reserve top-up and transfer settlement operations." />

      <section className="grid gap-4 xl:grid-cols-2">
        <ShellCard title="Create Transfer" subtitle="Send EUR transfer between approved institutions.">
          <form className="space-y-3" onSubmit={onSendTransfer}>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={transferForm.sender_institution_id}
                onChange={(event) =>
                  setTransferForm((prev) => ({ ...prev, sender_institution_id: event.target.value }))
                }
                required
              >
                <option value="">Sender institution</option>
                {approvedInstitutions.map((institution) => (
                  <option key={institution.institution_id} value={institution.institution_id}>
                    {institution.institution_id} - {institution.legal_name}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={transferForm.recipient_institution_id}
                onChange={(event) =>
                  setTransferForm((prev) => ({ ...prev, recipient_institution_id: event.target.value }))
                }
                required
              >
                <option value="">Recipient institution</option>
                {approvedInstitutions.map((institution) => (
                  <option key={institution.institution_id} value={institution.institution_id}>
                    {institution.institution_id} - {institution.legal_name}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={transferForm.amount}
                onChange={(event) => setTransferForm((prev) => ({ ...prev, amount: event.target.value }))}
                type="number"
                min="0"
                step="0.01"
                required
              />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={transferForm.currency}
                onChange={(event) => setTransferForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                required
              />
            </div>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Reference note"
              value={transferForm.note}
              onChange={(event) => setTransferForm((prev) => ({ ...prev, note: event.target.value }))}
            />
            <button
              disabled={sendingTransfer}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingTransfer ? 'Submitting...' : 'Submit Transfer'}
            </button>
          </form>
        </ShellCard>

        <ShellCard title="Reserve Deposit" subtitle="Record fiat reserve and mint internal EUR balance.">
          <form className="space-y-3" onSubmit={onReserveDeposit}>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={reserveForm.institution_id}
                onChange={(event) => setReserveForm((prev) => ({ ...prev, institution_id: event.target.value }))}
                required
              >
                <option value="">Institution</option>
                {approvedInstitutions.map((institution) => (
                  <option key={institution.institution_id} value={institution.institution_id}>
                    {institution.institution_id} - {institution.legal_name}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={reserveForm.amount}
                onChange={(event) => setReserveForm((prev) => ({ ...prev, amount: event.target.value }))}
                type="number"
                min="0"
                step="0.01"
                required
              />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={reserveForm.currency}
                onChange={(event) => setReserveForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                required
              />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={reserveForm.reference}
                onChange={(event) => setReserveForm((prev) => ({ ...prev, reference: event.target.value }))}
                required
              />
            </div>
            <button
              disabled={recordingReserve}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recordingReserve ? 'Recording...' : 'Record Deposit'}
            </button>
          </form>
        </ShellCard>
      </section>

      <ShellCard title="Recent Transfers" subtitle="Submitted, settled, and failed outcomes with settlement metadata.">
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search by institution, CVR, note, or tx id"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
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
          <EmptyState title="No transfers found" body="Submit a transfer or relax filters." />
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
                  <th className="px-2 py-2">Failure Reason</th>
                  <th className="px-2 py-2">Settlement Tx</th>
                </tr>
              </thead>
              <tbody>
                {transfers.slice(0, 200).map((transfer) => (
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
                    <td className="px-2 py-2 text-xs text-rose-700">{transfer.failure_reason || '-'}</td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-600">{transfer.settlement_tx_id || '-'}</td>
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
