'use client';

export default function PrintToolbar({ quoteId }: { quoteId: string }) {
  return (
    <div
      className="print-hide"
      style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #ddd', background: '#f5f5f5' }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #999', background: '#fff', cursor: 'pointer' }}
      >
        列印
      </button>
      <a href={`/boss/quotes/${quoteId}`} style={{ color: '#555' }}>返回</a>
    </div>
  );
}
