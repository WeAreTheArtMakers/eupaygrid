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
import { Institution, WsSnapshot } from '@/lib/types';
import { useEventStream } from '@/lib/ws';

const statusOptions = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Suspended', value: 'suspended' }
];

export default function InstitutionsPage(): React.JSX.Element {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionTarget, setActionTarget] = useState('');
  const [form, setForm] = useState({
    institution_id: '',
    legal_name: '',
    cvr_number: '',
    country: 'DK'
  });
  const { pushError, pushSuccess } = useToasts();

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await api.listInstitutions(query, statusFilter || undefined);
      setInstitutions(result);
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
      payload.type === 'institution.created' ||
      payload.type === 'institution.approved' ||
      payload.type === 'institution.suspended' ||
      payload.type === 'wallet.frozen' ||
      payload.type === 'wallet.unfrozen'
    ) {
      void refresh();
    }
  });

  const onCreateInstitution = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createInstitution({
        institution_id: form.institution_id || undefined,
        legal_name: form.legal_name,
        cvr_number: form.cvr_number,
        country: form.country,
        reason: 'Created from institutions console'
      });
      pushSuccess('Institution created');
      setForm({ institution_id: '', legal_name: '', cvr_number: '', country: form.country });
      await refresh();
    } catch (error) {
      pushError(String(error));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (institution: Institution, action: 'approve' | 'suspend' | 'freeze' | 'unfreeze') => {
    setActionTarget(`${institution.institution_id}:${action}`);
    try {
      if (action === 'approve') {
        await api.approveInstitution(institution.institution_id, 'Institution approved via admin console');
      }
      if (action === 'suspend') {
        await api.suspendInstitution(institution.institution_id, 'Institution suspended via admin console');
      }
      if (action === 'freeze') {
        await api.freezeInstitution(institution.institution_id, 'Wallet frozen via admin console');
      }
      if (action === 'unfreeze') {
        await api.unfreezeInstitution(institution.institution_id, 'Wallet unfrozen via admin console');
      }
      pushSuccess(`Action executed: ${action}`);
      await refresh();
    } catch (error) {
      pushError(String(error));
    } finally {
      setActionTarget('');
    }
  };

  const sortedInstitutions = useMemo(
    () => [...institutions].sort((a, b) => a.legal_name.localeCompare(b.legal_name)),
    [institutions]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Institutions" subtitle="Permissioned participant onboarding and controls." />

      <section className="grid gap-4 xl:grid-cols-3">
        <ShellCard title="Create Institution" subtitle="Add a regulated institution to pending onboarding queue.">
          <form className="space-y-3" onSubmit={onCreateInstitution}>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Institution ID (optional)"
              value={form.institution_id}
              onChange={(event) => setForm((prev) => ({ ...prev, institution_id: event.target.value.toUpperCase() }))}
            />
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Legal name"
              required
              value={form.legal_name}
              onChange={(event) => setForm((prev) => ({ ...prev, legal_name: event.target.value }))}
            />
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="CVR / Tax ID"
              required
              value={form.cvr_number}
              onChange={(event) => setForm((prev) => ({ ...prev, cvr_number: event.target.value }))}
            />
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.country}
              onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value.toUpperCase() }))}
            >
              <option value="DK">Denmark (DK)</option>
              <option value="DE">Germany (DE)</option>
              <option value="NL">Netherlands (NL)</option>
              <option value="FR">France (FR)</option>
              <option value="ES">Spain (ES)</option>
              <option value="AT">Austria (AT)</option>
            </select>
            <button
              disabled={saving}
              className="w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Creating...' : 'Create Institution'}
            </button>
          </form>
        </ShellCard>

        <div className="xl:col-span-2">
          <ShellCard title="Institution Registry" subtitle="Search by legal name, CVR, or institution code.">
            <div className="mb-4 flex flex-col gap-2 md:flex-row">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Search institutions"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void refresh()}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Search
              </button>
            </div>

            {loading ? (
              <LoadingState label="Loading institutions..." />
            ) : sortedInstitutions.length === 0 ? (
              <EmptyState title="No institutions found" body="Adjust filters or create a new institution." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Institution</th>
                      <th className="px-2 py-2">CVR</th>
                      <th className="px-2 py-2">Pseudonym</th>
                      <th className="px-2 py-2">Balance</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Wallet</th>
                      <th className="px-2 py-2">Created</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInstitutions.map((institution) => {
                      const loadingAction = actionTarget.startsWith(`${institution.institution_id}:`);
                      return (
                        <tr key={institution.institution_id} className="border-b border-slate-100 align-top last:border-none">
                          <td className="px-2 py-2">
                            <div className="font-medium text-slate-900">{institution.legal_name}</div>
                            <div className="text-xs text-slate-500">{institution.institution_id}</div>
                          </td>
                          <td className="px-2 py-2 text-slate-600">{institution.cvr_number}</td>
                          <td className="px-2 py-2 font-mono text-xs text-slate-600">{institution.pseudonymous_id}</td>
                          <td className="px-2 py-2 font-medium">{formatMoney(institution.eur_balance || '0')}</td>
                          <td className="px-2 py-2">
                            <StatusPill status={institution.status} />
                          </td>
                          <td className="px-2 py-2">
                            <StatusPill status={institution.is_frozen ? 'frozen' : 'active'} />
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-500">{formatShortDate(institution.created_at)}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col gap-1">
                              {institution.status === 'pending' ? (
                                <button
                                  disabled={loadingAction}
                                  onClick={() => void runAction(institution, 'approve')}
                                  className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  Approve
                                </button>
                              ) : null}
                              {institution.status === 'approved' ? (
                                <button
                                  disabled={loadingAction}
                                  onClick={() => void runAction(institution, 'suspend')}
                                  className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  Suspend
                                </button>
                              ) : null}
                              {institution.is_frozen ? (
                                <button
                                  disabled={loadingAction}
                                  onClick={() => void runAction(institution, 'unfreeze')}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Unfreeze Wallet
                                </button>
                              ) : (
                                <button
                                  disabled={loadingAction}
                                  onClick={() => void runAction(institution, 'freeze')}
                                  className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                                >
                                  Freeze Wallet
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ShellCard>
        </div>
      </section>
    </div>
  );
}
