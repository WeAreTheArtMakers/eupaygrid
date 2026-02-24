export default function EmptyState({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-1">{body}</p>
    </div>
  );
}
