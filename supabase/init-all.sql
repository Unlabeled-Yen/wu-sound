-- ============================================================
-- wu-sound-fde 一次性初始化(全新 Supabase 專案用)
-- 在 Supabase SQL Editor 全部貼上、按 Run。含 schema + 案場 + 設備 seed。
-- ============================================================

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

-- Phase 2:大型設備位置追蹤
create type equipment_category as enum (
  'speaker', 'subwoofer', 'amplifier', 'mixer',
  'mic_wired', 'mic_wireless', 'di_box',
  'light', 'light_console', 'stage', 'projector', 'rack', 'other'
);

create type equipment_status as enum (
  'in_storage', 'on_site', 'in_repair', 'retired'
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  model_number text,
  category equipment_category not null,
  serial_number text,
  quantity integer not null default 1 check (quantity > 0),
  unit text not null default '台',
  status equipment_status not null default 'in_storage',
  current_site_id uuid references sites(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_location_matches_status check (
    (status = 'on_site' and current_site_id is not null)
    or (status <> 'on_site' and current_site_id is null)
  )
);

create index equipment_status_idx on equipment (status);
create index equipment_category_idx on equipment (category);
create index equipment_site_idx on equipment (current_site_id) where current_site_id is not null;
create index equipment_name_search_idx on equipment using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(model_number,'') || ' ' || coalesce(brand,'')));

create trigger equipment_bump_updated
before update on equipment for each row execute function bump_updated_at();

-- Phase 4:內帳結構化
create type ledger_direction as enum ('income', 'expense');
create type ledger_kind as enum (
  'project', 'loan', 'other_income',
  'salary', 'bonus', 'reimbursement', 'goods', 'vehicle',
  'rent', 'utility', 'credit_card', 'tax', 'investment', 'health', 'other_expense'
);
create type invoice_status as enum ('none', 'to_issue', 'issued');
create type ledger_status as enum ('active', 'voided');

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  direction ledger_direction not null,
  kind ledger_kind not null,
  amount_twd integer not null check (amount_twd > 0),
  party text,
  memo text,
  is_external boolean not null default false,
  invoice_status invoice_status not null default 'none',
  invoice_no text,
  invoice_date date,
  tax_amount_twd integer not null default 0 check (tax_amount_twd >= 0),
  status ledger_status not null default 'active',
  voided_reason text,
  source_batch_id uuid references book_batches(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_only_when_external check (
    is_external = true or tax_amount_twd = 0
  ),
  constraint issued_requires_external check (
    invoice_status <> 'issued' or is_external = true
  ),
  constraint issued_requires_date check (
    invoice_status <> 'issued' or invoice_date is not null
  )
);

create index ledger_month_idx on ledger_entries (occurred_on desc);
create index ledger_status_idx on ledger_entries (status);
create index ledger_direction_kind_idx on ledger_entries (direction, kind);
create index ledger_external_idx on ledger_entries (is_external, invoice_status);
create unique index ledger_batch_party_uidx
  on ledger_entries (source_batch_id, party)
  where source_batch_id is not null;

create trigger ledger_bump_updated
before update on ledger_entries for each row execute function bump_updated_at();

create table equipment_movements (
  id bigserial primary key,
  equipment_id uuid not null references equipment(id) on delete cascade,
  moved_by uuid not null references users(id),
  moved_at timestamptz not null default now(),
  from_status equipment_status not null,
  to_status equipment_status not null,
  from_site_id uuid references sites(id),
  to_site_id uuid references sites(id),
  notes text
);

create index equipment_movements_eq_idx on equipment_movements (equipment_id, moved_at desc);

-- RLS: 用 app 層以 users.id 通過 service role 存取(Phase 1 不用 Supabase Auth,
-- 應用端 server actions 帶 user_id 過來,靠 service key + 明確 where 條件把關)。
alter table users enable row level security;
alter table sites enable row level security;
alter table expenses enable row level security;
alter table worklogs enable row level security;
alter table clockins enable row level security;
alter table book_batches enable row level security;
alter table audit_log enable row level security;
alter table equipment enable row level security;
alter table equipment_movements enable row level security;
alter table ledger_entries enable row level security;
-- 只有 service_role 能存取(anon 全部拒絕),應用端一律由 server 走。
-- 若日後改用 Supabase Auth,改為以 auth.uid() 比對 users.id 即可。

-- ===== 案場 seed =====
-- 開發用 seed。PIN hash 用應用內 npm run seed 產生(避免把明碼寫死在 SQL)。
-- 這份只放案場、預設老闆記錄佔位。實際使用者、PIN 走 scripts/seed-users.ts。
insert into sites (name) values
  ('恩光堂'), ('磐頂長老教會'), ('THE HOPE Taipei'), ('北屯旌旗'),
  ('新竹旌旗'), ('斗六旌旗'), ('豐原旌旗')
on conflict (name) do nothing;

-- ===== 大型設備 seed =====
-- Phase 2 seed:雇主自報的大型設備清單。
-- 執行前提:schema.sql 或 002_add_equipment.sql 已跑過。
insert into equipment (name, brand, model_number, category, quantity, unit, status) values
  ('CODA HOPS8i(8寸主動式)', 'CODA', 'HOPS8i', 'speaker', 2, '顆', 'in_storage'),
  ('12寸主動式喇叭(型號待補)', null, null, 'speaker', 2, '顆', 'in_storage'),
  ('Soundcraft 類比控台', 'Soundcraft', null, 'mixer', 1, '台', 'in_storage'),
  ('Behringer X32 數位音控台', 'Behringer', 'X32', 'mixer', 2, '台', 'in_storage'),
  ('MA2 light 燈控台', 'MA', 'MA2 light', 'light_console', 1, '台', 'in_storage'),
  ('面燈', null, null, 'light', 2, '支', 'in_storage'),
  ('LED BAR', null, null, 'light', 8, '支', 'in_storage'),
  ('Wash', null, null, 'light', 2, '支', 'in_storage'),
  ('Blinder', null, null, 'light', 100, '支', 'in_storage'),
  ('煙機(含風扇)', null, null, 'light', 2, '台', 'in_storage'),
  ('移動式舞台 50×50', null, null, 'stage', 16, '座', 'in_storage'),
  ('無線麥克風(型號待補)', null, null, 'mic_wireless', 6, '支', 'in_storage'),
  ('投影機', null, null, 'projector', 1, '台', 'in_storage')
on conflict do nothing;
