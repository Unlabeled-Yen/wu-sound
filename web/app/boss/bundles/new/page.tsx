import NewBundleForm from './NewBundleForm';

export const dynamic = 'force-dynamic';

export default function NewBundlePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增標配套組</h1>
      <NewBundleForm />
    </div>
  );
}
