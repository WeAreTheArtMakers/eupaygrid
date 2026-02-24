import PageHeader from '@/components/PageHeader';
import ShellCard from '@/components/ShellCard';

export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Environment-level controls for demo sessions." />
      <ShellCard title="Settings Placeholder" subtitle="MVP scaffold for future environment and policy controls.">
        <p className="text-sm text-slate-600">
          TODO: Add configurable network policy profiles, institution-level limits, and observability thresholds.
        </p>
      </ShellCard>
    </div>
  );
}
