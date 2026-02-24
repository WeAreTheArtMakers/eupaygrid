export function formatMoney(value: string | number, currency = 'EUR'): string {
  const amount = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(amount)) {
    return `${value} ${currency}`;
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function statusClass(status: string): string {
  if (status === 'settled' || status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed' || status === 'suspended') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}
