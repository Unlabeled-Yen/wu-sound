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
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>今日工作記錄</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--nm-text-muted)' }}>
          {new Date().toLocaleDateString('zh-TW')}
        </p>
      </header>

      {listError && (
        <div className="nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
          {listError}
        </div>
      )}

      {loading ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>載入中…</p>
      ) : logs.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--nm-text-muted)' }}>今天還沒有工作記錄</p>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="nm-raised rounded-[20px] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[15px] font-semibold" style={{ color: 'var(--nm-text-primary)' }}>
                  {log.sites?.name || '(未指定案場)'}
                </div>
                <div className="tabular text-[12px] shrink-0" style={{ color: 'var(--nm-text-muted)' }}>
                  {new Date(log.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div
                className="mt-1.5 text-[14px]"
                style={{ color: 'var(--nm-text-secondary)', lineHeight: 1.7 }}
              >
                {log.note}
              </div>
              {log.photo_urls.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {log.photo_urls.map((p, i) => (
                    <div key={i}>
                      <div className="mb-1 text-[11px]" style={{ color: 'var(--nm-text-muted)' }}>
                        {p.kind === 'before' ? '施工前' : '施工後'}
                      </div>
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.url}
                          alt={p.kind}
                          className="w-full h-[84px] rounded-xl object-cover"
                          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                      ) : (
                        <div className="w-full h-[84px] rounded-xl nm-inset" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-[12px]" style={{ color: 'var(--nm-text-muted)' }}>
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
          className="fixed left-[22px] right-[22px] bottom-24 z-30 nm-btn-solid rounded-2xl"
          style={{ height: 54 }}
        >
          ＋ 新增工作記錄
        </button>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 pt-10 overflow-y-auto">
          <form onSubmit={onSubmit} className="mx-auto max-w-md nm-raised-lg rounded-2xl p-4">
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--nm-text-primary)' }}>新增工作記錄</h2>

            {formError && (
              <div className="mb-3 nm-inset rounded-xl p-3 text-[13px]" style={{ color: 'var(--nm-danger)' }}>
                {formError}
              </div>
            )}

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--nm-text-secondary)' }}>案場</span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="nm-input text-sm"
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
              <span className="mb-1 flex justify-between text-sm font-medium" style={{ color: 'var(--nm-text-secondary)' }}>
                <span>一句話說明</span>
                <span style={{ color: note.length > 200 ? 'var(--nm-danger)' : 'var(--nm-text-faint)' }}>
                  {note.length}/200
                </span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={2}
                className="nm-input text-sm"
                placeholder="今天做了什麼"
                required
              />
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--nm-text-secondary)' }}>施工前照片</span>
                <input
                  ref={beforeRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setHasBefore(!!e.target.files?.[0])}
                  className="block w-full text-xs"
                  style={{ color: 'var(--nm-text-secondary)' }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--nm-text-secondary)' }}>施工後照片</span>
                <input
                  ref={afterRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setHasAfter(!!e.target.files?.[0])}
                  className="block w-full text-xs"
                  style={{ color: 'var(--nm-text-secondary)' }}
                />
              </label>
            </div>

            {needReason && (
              <fieldset
                className="mb-3 rounded-xl p-3"
                style={{ background: 'rgba(217,181,107,0.08)', border: '1px solid rgba(217,181,107,0.28)' }}
              >
                <legend className="px-1 text-sm font-medium" style={{ color: 'var(--nm-warning)' }}>無照片原因(必填)</legend>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(Object.keys(REASON_LABEL) as Array<keyof typeof REASON_LABEL>).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm" style={{ color: 'var(--nm-text-body)' }}>
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
                className="flex-1 nm-btn text-sm nm-focus"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-[2] nm-btn-solid text-sm nm-focus"
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
