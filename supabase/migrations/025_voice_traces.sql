-- 語音助理的對話軌跡紀錄。
--
-- 為什麼要這個表:2026-08-24 以前,判斷「AI 表現好不好」唯一的資料來源是
-- Yen 口頭回報單次體感,結果連續踩了幾個坑——最嚴重的一次是回報「AI 說記好了
-- 但沒寫入」,我只查了 tasks 表就判定成「AI 說謊」,實際上東西寫進 worklogs
-- 了(分類錯配,不是說謊),而那個誤判又導致確認機制被整個拆掉。有完整軌跡
-- 的話一眼就看得出來。
--
-- 這是做「錯誤分析」(open coding → axial coding → 依頻率修)的前提:
-- 沒有軌跡就只能靠猜。方法學參考 hamel.dev/blog/posts/evals-faq。
--
-- 隱私:這裡存的是真實對話內容(使用者講的話、AI 回的話),屬敏感資料。
-- 只有老闆看得到(見 lib/acl.ts 的 ops 能力),而且下面有 90 天保留期的
-- 清理函式——不要無限期堆著。不存音檔,只存文字。

create table voice_traces (
  id uuid primary key default gen_random_uuid(),
  -- 一通通話一個 session_id(前端產生),同一通的事件靠它串起來看
  session_id text not null,
  user_id uuid not null references users(id),
  -- 這通通話裡的第幾個事件,用來還原順序(時間戳可能同毫秒,不夠可靠)
  seq integer not null,
  -- user_speech = 使用者講的話;ai_speech = AI 講的話;
  -- tool_call = 呼叫工具與結果;error = 出錯
  kind text not null check (kind in ('user_speech', 'ai_speech', 'tool_call', 'error')),
  -- 依 kind 不同:文字放 {text}, 工具放 {name, args, ok, result}
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 看軌跡一定是「挑一通通話,照順序看完」,這個索引直接對應那個查法
create index voice_traces_session_idx on voice_traces (session_id, seq);
-- 「最近幾通」的列表查詢
create index voice_traces_created_idx on voice_traces (created_at desc);

-- 保留期清理。刻意不做成自動排程(這個專案沒有 pg_cron),
-- 要清就手動執行:select prune_voice_traces();
create or replace function prune_voice_traces(keep_days integer default 90)
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  delete from voice_traces
  where created_at < now() - (keep_days || ' days')::interval;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- 驗證(套用後手動跑):
-- insert into voice_traces (session_id, user_id, seq, kind, payload)
--   values ('t1', (select id from users limit 1), 1, 'user_speech', '{"text":"測試"}');
-- select * from voice_traces where session_id = 't1';
-- select prune_voice_traces(0);  -- 應回傳 1,並把上面那筆清掉
