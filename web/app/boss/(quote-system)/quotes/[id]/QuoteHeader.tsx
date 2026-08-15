function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} 天前`;
}

function Field({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-3 ${span2 ? 'col-span-2' : ''}`}>
      <div className="w-16 shrink-0 text-[12.5px]" style={{ color: 'var(--nm-text-muted)' }}>{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const inputShellCls = 'w-full min-h-[38px] flex items-center px-3 rounded-[13px] text-[13px] outline-none bg-transparent';
const inputShellStyle: React.CSSProperties = { background: 'rgba(8,8,10,.4)', border: '1px solid rgba(255,255,255,.13)', color: 'var(--nm-text-body)' };

// 表頭:一份文件的第一段,不是獨立卡片。客戶名撐大字級當文件標題;案件／案場／
// 內部備註收成兩欄。拿掉「儲存基本資料」按鈕——自動儲存(debounce 800ms 在
// QuoteEditor 裡做),這裡只負責顯示「最後儲存」時間戳,失敗就地變紅字,不彈窗。
export function QuoteHeader({
  clientName, setClientName, projectName, setProjectName,
  siteId, setSiteId, sites, note, setNote,
  createdAt, lastSavedAt, saveError,
}: {
  clientName: string;
  setClientName: (v: string) => void;
  projectName: string;
  setProjectName: (v: string) => void;
  siteId: string;
  setSiteId: (v: string) => void;
  sites: Array<{ id: string; name: string }>;
  note: string;
  setNote: (v: string) => void;
  createdAt: string;
  lastSavedAt: Date | null;
  saveError: string | null;
}) {
  return (
    <div style={{ padding: '22px 26px 20px', borderBottom: '1px solid var(--nm-border-hair)' }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="客戶名稱"
          className="bg-transparent outline-none flex-1 min-w-[160px]"
          style={{ font: '600 20px/1 inherit', color: 'var(--nm-text-primary)' }}
        />
        <div className="text-[12px] shrink-0" style={{ color: saveError ? 'var(--nm-danger-glass-text)' : 'var(--nm-text-faint)' }}>
          建立 {createdAt.slice(0, 10)}
          {saveError ? `　·　儲存失敗:${saveError}` : lastSavedAt ? `　·　最後儲存 ${relativeTime(lastSavedAt.toISOString())}` : null}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
        <Field label="案件">
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputShellCls} style={inputShellStyle} />
        </Field>
        <Field label="案場">
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputShellCls} style={inputShellStyle}>
            <option value="">— 不掛案場 —</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="內部備註" span2>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="不出現在列印與匯出" className={inputShellCls} style={inputShellStyle} />
        </Field>
      </div>
    </div>
  );
}
