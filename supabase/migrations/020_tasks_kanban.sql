-- 待辦看板化:tasks.status 從 open/done 兩態擴成四欄(要老闆決定/待辦/卡住等料/完成),
-- 加上看板卡片需要的欄位(標籤、照片、離線待上傳、卡住原因)。
-- 見 design_handoff_wu_sound/06-project-board.md 11a §4、08-專案管理新建清單.md §1。
-- 四欄鍵值採 08 文件定案:decide/todo/blocked/done。

-- 順序很重要:先拿掉舊 constraint,回填才寫得進新值('todo' 不在舊的
-- ('open','done') 允許清單裡),回填完才能加上收緊後的新 constraint。
-- (先前版本順序寫反,backfill 在舊 constraint 還在時就想寫 'todo',
-- 在正式庫上被舊 constraint 擋下,已確認正式庫因此完整回滾、未套用。)
alter table tasks drop constraint tasks_status_check;

update tasks set status = 'todo' where status = 'open';

alter table tasks add constraint tasks_status_check
  check (status in ('decide', 'todo', 'blocked', 'done'));
alter table tasks alter column status set default 'todo';

alter table tasks add column tags text[] not null default '{}';
alter table tasks add column photos jsonb not null default '[]';
alter table tasks add column upload_pending boolean not null default false;
-- status='blocked' 時必填,app 層驗證(server action 擋),不下 DB constraint——
-- DB constraint 沒辦法在「移入 blocked 的同一筆 update」跟「先前已經是 blocked」
-- 之間分辨,而 app 層可以,見 06-project-board.md 11a 的卡住區塊規則。
alter table tasks add column blocked_on text;
-- 「已卡 N 天」要從「移入 blocked 的那一刻」算,不是從 created_at 算——
-- 用建立時間頂替會把「案子開很久、昨天才卡住」的卡顯示成卡了很久,是假精確。
alter table tasks add column blocked_since timestamptz;
alter table tasks add column completed_at timestamptz;

-- site_id 改為可空:「先記,後歸案」——現場猜不出案子時 site_id=null,
-- 待歸案清單(08 §7)撈 site_id is null 的 tasks。
alter table tasks alter column site_id drop not null;

-- === 驗證查詢 ===
-- select status, count(*) from tasks group by status; -- 不應再有 'open'
-- insert into tasks (title, status, created_by) values ('x', 'todo', '...'); -- site_id 可省略,應成功
