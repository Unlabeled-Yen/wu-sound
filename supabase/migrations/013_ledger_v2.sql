-- 帳務 v2 批次一:應收應付、案件類別、site_id 地基、每日案場歸屬、定期帳範本骨架、月薪設定骨架。
-- 對應 docs/ledger-v2-spec-v1.md。schema.sql 已同步反映(新專案 setup 不必再跑本檔)。

-- 案件類別:老闆自管清單,系統不預塞。
create table site_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table sites
  add column category_id uuid references site_categories(id),
  add column customer_name text;

create index sites_category_idx on sites (category_id);

-- ledger_entries 追加:專案歸屬、應收應付連結、手續費、draft 狀態(定期帳範本用)。
alter table ledger_status add value if not exists 'draft';

alter table ledger_entries
  add column site_id uuid references sites(id),
  add column fee_twd integer not null default 0 check (fee_twd >= 0);

create index ledger_site_idx on ledger_entries (site_id) where site_id is not null;

-- 應收應付約定
create type receivable_direction as enum ('receivable', 'payable');
create type receivable_status as enum ('open', 'closed', 'voided');

create table receivables (
  id uuid primary key default gen_random_uuid(),
  direction receivable_direction not null,
  party text not null,
  site_id uuid references sites(id),
  total_amount_twd integer not null check (total_amount_twd > 0),
  memo text,
  status receivable_status not null default 'open',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receivables_status_idx on receivables (status);
create index receivables_site_idx on receivables (site_id) where site_id is not null;

create trigger receivables_bump_updated
before update on receivables for each row execute function bump_updated_at();

alter table ledger_entries
  add column receivable_id uuid references receivables(id);

create index ledger_receivable_idx on ledger_entries (receivable_id) where receivable_id is not null;

-- 定期帳範本(骨架;產生草稿的邏輯在應用層,lazy 產生不用 cron)
create table recurring_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  direction ledger_direction not null,
  kind ledger_kind not null,
  amount_twd integer not null check (amount_twd > 0),
  fee_twd integer not null default 0 check (fee_twd >= 0),
  party text,
  is_external boolean not null default false,
  site_id uuid references sites(id),
  day_of_month integer not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_templates_bump_updated
before update on recurring_templates for each row execute function bump_updated_at();

-- 定期範本產生的草稿,靠這個關聯欄防重複產生(每個範本每月最多一筆)
alter table ledger_entries
  add column recurring_template_id uuid references recurring_templates(id);

create unique index ledger_recurring_month_uidx
  on ledger_entries (recurring_template_id, date_trunc('month', occurred_on))
  where recurring_template_id is not null;

-- 每日案場歸屬(下班打卡時記錄;老闆可事後改)
create table day_site_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  worked_on date not null,
  site_id uuid not null references sites(id),
  hours numeric check (hours is null or hours > 0),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index day_site_alloc_uidx on day_site_allocations (user_id, worked_on, site_id);
create index day_site_alloc_user_date_idx on day_site_allocations (user_id, worked_on desc);
create index day_site_alloc_site_idx on day_site_allocations (site_id);

create trigger day_site_allocations_bump_updated
before update on day_site_allocations for each row execute function bump_updated_at();

-- 月薪設定(生效日期制,boss-only;第二批數字化用,先建骨架)
create table user_pay_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  monthly_salary_twd integer not null check (monthly_salary_twd > 0),
  effective_from date not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create unique index user_pay_profiles_uidx on user_pay_profiles (user_id, effective_from);
create index user_pay_profiles_user_idx on user_pay_profiles (user_id, effective_from desc);

-- 月結凍結快照(第二批:真正的工時↔薪資鎖定機制上線後才會寫入,先建骨架)
create table monthly_cost_rates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references book_batches(id),
  user_id uuid not null references users(id),
  monthly_salary_twd integer not null,
  total_hours numeric not null,
  hourly_rate_twd numeric not null,
  created_at timestamptz not null default now()
);

create unique index monthly_cost_rates_uidx on monthly_cost_rates (batch_id, user_id);

-- quotes 加選填 site_id(第二批報價↔實際毛利對照用,先建欄位)
alter table quotes
  add column site_id uuid references sites(id);

create index quotes_site_idx on quotes (site_id) where site_id is not null;

-- RLS:沿用專案模式,anon 全拒,server 走 service_role。
alter table site_categories enable row level security;
alter table receivables enable row level security;
alter table recurring_templates enable row level security;
alter table day_site_allocations enable row level security;
alter table user_pay_profiles enable row level security;
alter table monthly_cost_rates enable row level security;
-- user_pay_profiles/monthly_cost_rates 額外強調:即使 service_role 繞過 RLS,
-- 應用層 API/頁面也必須是 boss-only,任何員工可達的 query 絕不可 select 這兩張表。
