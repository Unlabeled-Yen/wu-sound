import NewQuoteForm from './NewQuoteForm';

export const dynamic = 'force-dynamic';

export default function NewQuotePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增報價單</h1>
      <NewQuoteForm />
    </div>
  );
}
