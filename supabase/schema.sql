-- wu-sound-fde Phase 1 schema
-- 執行順序:在 Supabase SQL editor 一次貼上執行。
-- 金額一律以整數(元)存 amount_twd。

create extension if not exists pgcrypto;

create type user_role as enum ('boss', 'staff');
create type expense_source as enum ('app', 'line');
create type expense_status as enum ('draft', 'submitted', 'confirmed', 'rejected', 'booked');
create type expense_category as enum ('fuel', 'parking', 'materials', 'other');
create type clockin_type as enum ('in', 'out');

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role user_role not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table book_batches (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  totals jsonb not null default '{}'::jsonb,
  unique (month)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  captured_at timestamptz not null default now(),
  spent_on date,
  category expense_category,
  amount_twd integer,
  item_text text,
  site_id uuid references sites(id),
  receipt_url text,
  ai_draft jsonb,
  source expense_source not null default 'app',
  status expense_status not null default 'draft',
  rejected_reason text,
  booked_batch_id uuid references book_batches(id),
  updated_at timestamptz not null default now()
);

create index expenses_user_status_idx on expenses (user_id, status);
create index expenses_status_captured_idx on expenses (status, captured_at desc);

create table worklogs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  site_id uuid references sites(id),
  logged_on date not null default (current_date),
  note text not null,
  photos jsonb not null default '[]'::jsonb,
  no_photo_reason text,
  created_at timestamptz not null default now()
);

create index worklogs_site_date_idx on worklogs (site_id, logged_on desc);
create index worklogs_user_date_idx on worklogs (user_id, logged_on desc);

create table clockins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  ts timestamptz not null default now(),
  type clockin_type not null,
  is_backfill boolean not null default false,
  backfill_reason text,
  created_at timestamptz not null default now()
);

create index clockins_user_ts_idx on clockins (user_id, ts desc);

create table audit_log (
  id bigserial primary key,
  actor_id uuid references users(id),
  action text not null,
  target_table text not null,
  target_id text,
  ts timestamptz not null default now(),
  diff jsonb
);

create index audit_log_ts_idx on audit_log (ts desc);

-- updated_at 自動維護
create or replace function bump_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

create trigger expenses_bump_updated
before update on expenses for each row execute function bump_updated_at();

-- RLS: 用 app 層以 users.id 通過 service role 存取(Phase 1 不用 Supabase Auth,
-- 應用端 server actions 帶 user_id 過來,靠 service key + 明確 where 條件把關)。
alter table users enable row level security;
alter table sites enable row level security;
alter table expenses enable row level security;
alter table worklogs enable row level security;
alter table clockins enable row level security;
alter table book_batches enable row level security;
alter table audit_log enable row level security;
-- 只有 service_role 能存取(anon 全部拒絕),應用端一律由 server 走。
-- 若日後改用 Supabase Auth,改為以 auth.uid() 比對 users.id 即可。
