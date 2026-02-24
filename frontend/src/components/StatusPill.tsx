import { statusClass } from '@/lib/format';

export default function StatusPill({ status }: { status: string }): React.JSX.Element {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}>
      {status}
    </span>
  );
}
