'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 案子動態軌的「今天發生了什麼？」——本來是不可互動的視覺佔位(comment
// 說老闆端寫日誌流程還沒接上),但 POST /api/worklogs 其實不分角色,只有
// GET 查詢才限 boss/staff 範圍。所以這裡直接接上去:純文字快速記錄,不
// 附照片(no_photo_reason 固定填 other),要附照片還是去「全部日誌」那邊
// 走 staff 那套完整流程。
export default function WriteWorklogBox({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!note.trim()) { setError('請填一句話'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('site_id', siteId);
      fd.set('note', note.trim());
      fd.set('no_photo_reason', 'other');
      const res = await fetch('/api/worklogs', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '寫入失敗');
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '寫入失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl mb-3.5" style={{ background: 'rgba(30,30,36,.55)', border: '1px solid rgba(255,255,255,.12)', padding: '11px 12px' }}>
      <div style={{ font: '400 12.5px/1.5 "Noto Sans TC",sans-serif', color: 'var(--nm-text-muted)', marginBottom: 10 }}>今天發生了什麼？</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="一句話就好,例如:完成音控台安裝"
        className="nm-input w-full text-[13px] mb-2"
      />
      {error && (
        <div className="text-[12px] mb-2" style={{ color: 'var(--nm-danger)' }}>{error}</div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-lg flex items-center justify-center disabled:opacity-50"
        style={{ minHeight: 34, background: '#f0f0f2', color: '#17171a', font: '500 12px/1 "Noto Sans TC",sans-serif' }}
      >
        {submitting ? '寫入中…' : '寫日誌'}
      </button>
    </div>
  );
}
