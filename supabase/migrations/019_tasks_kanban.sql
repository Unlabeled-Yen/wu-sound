-- 待辦看板化:tasks.status 從 open/done 兩態擴成四欄(要老闆決定/待辦/卡住等料/完成),
-- 加上看板卡片需要的欄位(標籤、封面照、卡住原因與起算時間、子項清單)。
-- 見 docs/06-project-board.md 11a §4「四欄工作面」。

-- 先回填,CHECK 換掉之前舊值必須先合法化,否則 constraint 會直接擋住既有資料。
update tasks set status = 'todo' where status = 'open';

alter table tasks drop constraint tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('boss_decision', 'todo', 'blocked', 'done'));
alter table tasks alter column status set default 'todo';

alter table tasks add column tags text[] not null default '{}';
alter table tasks add column cover_photo_path text;
alter table tasks add column waiting_reason text;
alter table tasks add column stuck_since timestamptz;
alter table tasks add column checklist jsonb not null default '[]';

-- === 驗證查詢 ===
-- select status, count(*) from tasks group by status; -- 不應再有 'open'
-- insert into tasks (site_id, title, status, created_by) values ('...', 'x', 'blocked', '...');
--   -- 應該仍然成功(waiting_reason 必填是 app 層驗證,不是 DB constraint)
