'use client';

import { useEffect, useRef, useState } from 'react';

interface Site {
  id: string;
  name: string;
}

interface PhotoUrl {
  kind: string;
  url: string | null;
}

interface WorklogRow {
  id: string;
  site_id: string | null;
  note: string;
  no_photo_reason: string | null;
  created_at: string;
  sites?: { name: string } | null;
  photo_urls: PhotoUrl[];
}

const REASON_LABEL: Record<string, string> = {
  delivery: '交貨',
  maintenance: '保養',
  interview: '訪談',
  other: '其他',
};

export default function StaffWorklogPage() {
  const [logs, setLogs] = useState<WorklogRow[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [siteId, setSiteId] = useState('');
  const [note, setNote] = useState('');
  const [noPhotoReason, setNoPhotoReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const [hasBefore, setHasBefore] = useState(false);
  const [hasAfter, setHasAfter] = useState(false);

  const needReason = !hasBefore || !hasAfter;

  async function loadAll() {
    setLoading(true);
    setListError(null);
    try {
      const [logsRes, sitesRes] = await Promise.all([
        fetch('/api/worklogs?date=today', { cache: 'no-store' }),
        fetch('/api/sites?active=1', { cache: 'no-store' }),
      ]);
      if (!logsRes.ok) {
        const j = await logsRes.json().catch(() => ({}));
        throw new Error(j.error || '讀取工作記錄失敗');
      }
      if (!sitesRes.ok) {
        const j = await sitesRes.json().catch(() => ({}));
        throw new Error(j.error || '讀取案場失敗');
      }
      const lj = await logsRes.json();
      const sj = await sitesRes.json();
      setLogs(lj.worklogs || []);
      setSites(sj.sites || []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!siteId) {
      setFormError('請選擇案場');
      return;
    }
    if (!note.trim()) {
      setFormError('請填寫一句話說明');
      return;
    }
    if (needReason && !noPhotoReason) {
      setFormError('未附照片時,請選擇無照片原因');
      return;
    }

    const fd = new FormData();
    fd.set('site_id', siteId);
    fd.set('note', note.trim());
    if (needReason) fd.set('no_photo_reason', noPhotoReason);
    const bf = beforeRef.current?.files?.[0];
    const af = afterRef.current?.files?.[0];
    if (bf) fd.set('before_photo', bf);
    if (af) fd.set('after_photo', af);

    setSubmitting(true);
    try {
      const res = await fetch('/api/worklogs', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || '送出失敗');
      // reset
      setSiteId('');
      setNote('');
      setNoPhotoReason('');
      setHasBefore(false);
      setHasAfter(false);
      if (beforeRef.current) beforeRef.current.value = '';
      if (afterRef.current) afterRef.current.value = '';
      setShowForm(false);
      await loadAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '送出失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-4 pb-24">
      <header className="mb-4">
        <h1 className="text-xl font-bold">今日工作記錄</h1>
        <p className="text-sm text-neutral-500">{new Date().toLocaleDateString('zh-TW')}</p>
      </header>

      {listError && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">載入中…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-neutral-500">今天還沒有工作記錄</p>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="mb-1 text-sm font-medium text-neutral-800">
                {log.sites?.name || '(未指定案場)'}
              </div>
              <div className="mb-2 text-sm text-neutral-700">{log.note}</div>
              {log.photo_urls.length > 0 ? (
                <div className="flex gap-2">
                  {log.photo_urls.map((p, i) => (
                    <div key={i} className="text-xs">
                      <div className="mb-0.5 text-neutral-500">
                        {p.kind === 'before' ? '施工前' : '施工後'}
                      </div>
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.url} alt={p.kind} className="h-20 w-20 rounded object-cover" />
                      ) : (
                        <div className="h-20 w-20 rounded bg-neutral-100" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-neutral-500">
                  無照片原因:{log.no_photo_reason ? REASON_LABEL[log.no_photo_reason] || log.no_photo_reason : '未填'}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="fixed bottom-4 left-4 right-4 rounded-lg bg-blue-600 py-4 text-lg font-bold text-white shadow-lg active:bg-blue-700"
        >
          + 新增工作記錄
        </button>
      )}

      {showForm && (
        <div className="fixed inset-0 z-10 bg-black/40 p-4 pt-10 overflow-y-auto">
          <form
            onSubmit={onSubmit}
            className="mx-auto max-w-md rounded-lg bg-white p-4 shadow-xl"
          >
            <h2 className="mb-3 text-lg font-bold">新增工作記錄</h2>

            {formError && (
              <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium">案場</span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white p-2 text-sm"
                required
              >
                <option value="">請選擇</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className="mb-1 flex justify-between text-sm font-medium">
                <span>一句話說明</span>
                <span className={note.length > 200 ? 'text-red-600' : 'text-neutral-400'}>
                  {note.length}/200
                </span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={2}
                className="w-full rounded border border-neutral-300 p-2 text-sm"
                placeholder="今天做了什麼"
                required
              />
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">施工前照片</span>
                <input
                  ref={beforeRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setHasBefore(!!e.target.files?.[0])}
                  className="block w-full text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">施工後照片</span>
                <input
                  ref={afterRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setHasAfter(!!e.target.files?.[0])}
                  className="block w-full text-xs"
                />
              </label>
            </div>

            {needReason && (
              <fieldset className="mb-3 rounded border border-amber-300 bg-amber-50 p-3">
                <legend className="px-1 text-sm font-medium text-amber-800">無照片原因(必填)</legend>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(Object.keys(REASON_LABEL) as Array<keyof typeof REASON_LABEL>).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="no_photo_reason"
                        value={k}
                        checked={noPhotoReason === k}
                        onChange={(e) => setNoPhotoReason(e.target.value)}
                      />
                      {REASON_LABEL[k]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={submitting}
                className="flex-1 rounded border border-neutral-300 py-3 text-sm font-medium"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-[2] rounded bg-blue-600 py-3 text-sm font-bold text-white disabled:bg-neutral-400"
              >
                {submitting ? '送出中…' : '送出'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
