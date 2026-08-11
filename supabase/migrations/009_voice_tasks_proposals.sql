-- 語音/打字介面:任務(派工最小版)+ 兩階段寫入提案
-- 詳見 voice-lab/lab1-wu-adapter-spec-v1.md §3

create table tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  title text not null,
  description text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid not null references users(id),
  source text not null default 'web' check (source in ('voice', 'text', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_site_status_idx on tasks (site_id, status, due_date);

create trigger tasks_bump_updated
before update on tasks for each row execute function bump_updated_at();

-- 兩階段寫入的提案/token。存 DB 而非記憶體:Vercel serverless 不保證同一實例,
-- 記憶體 token 會隨函式回收蒸發 → 確認流程隨機失敗,違反可靠性要求。
create table write_proposals (
  token uuid primary key default gen_random_uuid(),
  action text not null check (action in ('create_task', 'log_note')),
  payload jsonb not null,
  payload_hash text not null,          -- canonical JSON 的 SHA-256
  actor_id uuid not null references users(id),
  source text not null check (source in ('voice', 'text')),
  transcript_ref text,
  capture_ref text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,     -- created_at + 60s
  used_at timestamptz,                 -- 已消費時間;非 null = 不可再用於新寫入
  result jsonb                         -- 成功寫入的回傳(冪等重試直接回這個)
);

create index write_proposals_expiry_idx on write_proposals (expires_at);

alter table tasks enable row level security;
alter table write_proposals enable row level security;
