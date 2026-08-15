'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TASK_TAGS, type TaskTag } from '@/lib/types';

export default function QuickCaptureButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: TaskTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('請填內容'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, title: title.trim(), tags }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '記錄失敗');
      setOpen(false);
      setTitle('');
      setTags([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '記錄失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="nm-btn-solid text-[13px]">＋ 記一筆</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl nm-raised-lg p-6 space-y-4"
            style={{ background: 'rgba(24,24,28,0.9)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>記一筆</h2>
              <button onClick={() => setOpen(false)} className="nm-focus" style={{ color: 'var(--nm-text-muted)' }}>✕</button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                autoFocus
                placeholder="今天你在這裡遇到的事,寫成一句話"
                className="nm-input w-full text-[15px]"
              />
              <div className="flex flex-wrap gap-1.5">
                {TASK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="nm-pill"
                    style={tags.includes(tag) ? { color: 'var(--nm-text-primary)', background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.2)' } : undefined}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <p className="text-xs" style={{ color: 'var(--nm-text-faint)' }}>預設落在「待辦」,你就是負責人。</p>

              {error && (
                <div className="rounded-xl nm-inset p-2 text-[13px]" style={{ color: 'var(--nm-danger)' }}>{error}</div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setOpen(false)} className="nm-btn text-[13px]">取消</button>
                <button type="submit" disabled={submitting} className="nm-btn-solid text-[13.5px]">
                  {submitting ? '記錄中…' : '記下來'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
