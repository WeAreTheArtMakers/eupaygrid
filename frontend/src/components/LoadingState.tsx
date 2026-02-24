export default function LoadingState({ label = 'Loading...' }: { label?: string }): React.JSX.Element {
  return <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">{label}</div>;
}
