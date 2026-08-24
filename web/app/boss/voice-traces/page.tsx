import { requirePageCapability } from '@/lib/require-capability';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 語音助理對話軌跡檢視。做「錯誤分析」用的最小可用介面
 * (方法學見 hamel.dev/blog/posts/evals-faq:開放編碼 → 軸向編碼 → 依頻率修)。
 *
 * 為什麼需要:在這之前,判斷 AI 表現的唯一依據是使用者口頭回報單次體感,
 * 誤判過好幾次。要做錯誤分析就得先看得到完整軌跡——使用者講了什麼、
 * AI 呼叫了什麼工具帶什麼參數、工具回什麼、AI 最後說了什麼,照順序排。
 *
 * 刻意做得陽春:先解決「看得到」,標註/分類功能等真的開始跑錯誤分析、
 * 知道需要哪些欄位再加。現在就做完整標註工具是在猜需求。
 *
 * 敏感資料:這頁顯示**所有使用者**的真實對話內容,只有老闆進得來。
 * 能力用 'more' 不是 'ops'——ops 不在 STAFF_DENIED 裡,員工照樣進得來。
 */

interface TraceRow {
  id: string;
  session_id: string;
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
  users: { name: string } | null;
}

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  user_speech: { label: '使用者', color: 'var(--nm-text-primary)' },
  ai_speech: { label: 'AI', color: 'var(--nm-text-body)' },
  tool_call: { label: '工具', color: 'var(--nm-warning-glass-text)' },
  error: { label: '錯誤', color: 'var(--nm-danger-glass-text)' },
};

function summarizeRow(row: TraceRow): string {
  const p = row.payload ?? {};
  if (row.kind === 'user_speech' || row.kind === 'ai_speech') return String(p.text ?? '');
  if (row.kind === 'error') return String(p.message ?? '');
  // tool_call:把最關鍵的三件事擺在最前面——呼叫了什麼、成不成功、寫了什麼
  const name = String(p.name ?? '?');
  const ok = p.ok === true ? '成功' : p.ok === false ? '失敗' : '';
  const extra = p.wrote ? ` → ${String(p.wrote)}` : p.error_zh ? ` → ${String(p.error_zh)}` : '';
  return `${name}(${ok})${extra}`;
}

export default async function VoiceTracesPage() {
  await requirePageCapability('more');
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from('voice_traces')
    .select('id, session_id, seq, kind, payload, created_at, users(name)')
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) {
    return (
      <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'rgba(224,122,122,0.08)', border: '1px solid rgba(224,122,122,0.34)', color: 'var(--nm-danger-glass-text)' }}>
        讀取失敗:{error.message}
        <div className="mt-2 text-[12px]" style={{ color: 'var(--nm-text-secondary)' }}>
          若訊息是「relation voice_traces does not exist」,表示 migration 025_voice_traces.sql 還沒在 Supabase 套用。
        </div>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as TraceRow[];

  // 依通話分組,組內照 seq 由小到大(還原對話順序),組間照時間由新到舊
  const bySession = new Map<string, TraceRow[]>();
  for (const r of rows) {
    const list = bySession.get(r.session_id) ?? [];
    list.push(r);
    bySession.set(r.session_id, list);
  }
  const sessions = Array.from(bySession.entries()).map(([sid, list]) => ({
    sid,
    rows: [...list].sort((a, b) => a.seq - b.seq),
    startedAt: list.reduce((min, r) => (r.created_at < min ? r.created_at : min), list[0].created_at),
    who: list[0]?.users?.name ?? '?',
  }));
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--nm-text-primary)' }}>語音對話軌跡</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--nm-text-secondary)' }}>
          最近 {sessions.length} 通、{rows.length} 筆事件。做錯誤分析用:一通一通看,標記第一個出錯的地方,
          歸類之後數哪一類最常發生,先修那一類。
        </p>
      </div>

      {sessions.length === 0 && (
        <div className="nm-inset rounded-2xl px-4 py-6 text-[13px] text-center" style={{ color: 'var(--nm-text-secondary)' }}>
          還沒有任何軌跡。用手機講一通就會出現在這裡。
        </div>
      )}

      {sessions.map((s) => (
        <div key={s.sid} className="nm-raised rounded-2xl overflow-hidden">
          <div
            className="px-4 py-2.5 flex items-baseline justify-between text-[12px]"
            style={{ borderBottom: '1px solid var(--nm-border-hair)', color: 'var(--nm-text-muted)' }}
          >
            <span>{s.who}　·　{s.rows.length} 個事件</span>
            <span className="tabular-nums">{new Date(s.startedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>
          </div>
          <div className="flex flex-col">
            {s.rows.map((r) => {
              const meta = KIND_LABEL[r.kind] ?? { label: r.kind, color: 'var(--nm-text-muted)' };
              return (
                <div
                  key={r.id}
                  className="px-4 py-2 grid gap-3 text-[13px] items-start"
                  style={{ gridTemplateColumns: '58px 1fr', borderTop: '1px solid rgba(255,255,255,.04)' }}
                >
                  <span className="text-[11px] pt-0.5" style={{ color: meta.color }}>{meta.label}</span>
                  <span style={{ color: 'var(--nm-text-body)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {summarizeRow(r) || <em style={{ color: 'var(--nm-text-faint)' }}>(空)</em>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
