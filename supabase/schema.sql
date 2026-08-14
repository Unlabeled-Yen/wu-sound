-- wu-sound-fde canonical 全庫 schema(反映 phase 1-4 應用後的完整狀態)
-- 執行順序:在 Supabase SQL editor 一次貼上執行。
-- 金額一律以整數(元)存 amount_twd。
-- migrations/*.sql 是給已上線 DB 升級用的歷史 patch、新 setup 不必跑。

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

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
  line_user_id text unique,
  created_at timestamptz not null default now()
);

-- LINE bot 綁定:一次性綁定碼(6 位數字,10 分鐘 TTL)。
-- 綁定 flow:使用者在 web 產生碼 → 加 bot 好友後傳「綁定 123456」→ webhook 查碼綁 line_user_id。
create table line_bind_codes (
  code text primary key,
  user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index line_bind_codes_expiry_idx on line_bind_codes (expires_at);

create table site_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  category_id uuid references site_categories(id),
  customer_name text,
  created_at timestamptz not null default now()
);

create index sites_category_idx on sites (category_id);

-- voice-lab Lab 2 案場模糊搜尋:trigram 相似度接住跳字省略的口語講法
-- (例:講「磐頂教會」要能搜到「磐頂長老教會」)。見 migrations/016。
create index sites_name_trgm_idx on sites using gin (name gin_trgm_ops);

create or replace function search_sites_by_query(q text)
returns table (
  id uuid,
  name text,
  active boolean,
  is_substring_match boolean,
  match_score real
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.active,
    (s.name ilike '%' || q || '%') as is_substring_match,
    greatest(
      similarity(s.name, q),
      case when s.name ilike '%' || q || '%' then 1.0 else 0.0 end
    ) as match_score
  from sites s
  where s.active = true
    and (
      s.name ilike '%' || q || '%'
      or similarity(s.name, q) > 0.15
    )
  order by
    (s.name ilike q || '%') desc,
    match_score desc,
    s.name
  limit 20;
$$;

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

-- voice-lab Lab 1:語音/打字介面,任務(派工最小版)。見 voice-lab/lab1-wu-adapter-spec-v1.md §3。
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

-- 兩階段寫入的提案/token。存 DB 而非記憶體:Vercel serverless 不保證同一實例,
-- 記憶體 token 會隨函式回收蒸發 → 確認流程隨機失敗,違反可靠性要求。
create table write_proposals (
  token uuid primary key default gen_random_uuid(),
  action text not null check (action in ('create_task', 'log_note')),
  payload jsonb not null,
  payload_hash text not null,
  actor_id uuid not null references users(id),
  source text not null check (source in ('voice', 'text')),
  transcript_ref text,
  capture_ref text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  result jsonb
);

create index write_proposals_expiry_idx on write_proposals (expires_at);

-- updated_at 自動維護
create or replace function bump_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

create trigger expenses_bump_updated
before update on expenses for each row execute function bump_updated_at();

create trigger tasks_bump_updated
before update on tasks for each row execute function bump_updated_at();

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
-- 'draft' 保留給未來定期帳範本 UI 用,屆時獨立一個 migration 執行
-- `alter type ledger_status add value 'draft';`,不要混在其他 DDL 的 transaction 裡。
create type receivable_direction as enum ('receivable', 'payable');
create type receivable_status as enum ('open', 'closed', 'voided');

-- 帳務 v3(2026-08):帳簿/狀態機/付款方式/案子分攤。見 docs/ledger-v3-spec-v1.md 與
-- migrations/014、015。credit_card 仍留在 ledger_kind 列舉中(僅不再簽發新值,
-- 刪值需獨立 migration 執行,見下方 013 教訓註記),新專案 setup 不會用到它。
create type ledger_journal as enum ('customer', 'vendor', 'pettycash', 'payroll', 'personal');
create type ledger_payment_method as enum ('transfer', 'cash', 'credit_card', 'check');
create type ledger_state as enum ('draft', 'posted', 'voided');

create table receivables (
  id uuid primary key default gen_random_uuid(),
  direction receivable_direction not null,
  party text not null,
  site_id uuid references sites(id),
  total_amount_twd integer not null check (total_amount_twd > 0),
  memo text,
  status receivable_status not null default 'open',
  -- 約定收款日(應收)/到期日(應付),見 018。可為 NULL——舊約定與未填的新約定一律留空,
  -- 帳務首頁的未來四週現金分桶要把 NULL 獨立列成「未排定」,不可預設塞進某一週。
  agreed_due_date date,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receivables_status_idx on receivables (status);
create index receivables_site_idx on receivables (site_id) where site_id is not null;

create trigger receivables_bump_updated
before update on receivables for each row execute function bump_updated_at();

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

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  direction ledger_direction not null,
  kind ledger_kind not null,
  amount_twd integer not null check (amount_twd > 0),
  fee_twd integer not null default 0 check (fee_twd >= 0),
  party text,
  memo text,
  is_external boolean not null default false,
  invoice_status invoice_status not null default 'none',
  invoice_no text,
  invoice_date date,
  tax_amount_twd integer not null default 0 check (tax_amount_twd >= 0),
  status ledger_status not null default 'active',
  voided_reason text,
  state ledger_state not null default 'posted',
  to_check boolean not null default false,
  journal ledger_journal not null,
  payment_method ledger_payment_method,
  site_distribution jsonb,
  site_id uuid references sites(id),
  receivable_id uuid references receivables(id),
  recurring_template_id uuid references recurring_templates(id),
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
  ),
  -- status/state 兩欄必須同步(至少在 voided 這個交集上)——見 migrations/017。
  constraint ledger_status_state_voided_sync check (
    (status = 'voided') = (state = 'voided')
  )
);

create index ledger_month_idx on ledger_entries (occurred_on desc);
create index ledger_status_idx on ledger_entries (status);
create index ledger_direction_kind_idx on ledger_entries (direction, kind);
create index ledger_external_idx on ledger_entries (is_external, invoice_status);
create index ledger_site_idx on ledger_entries (site_id) where site_id is not null;
create index ledger_receivable_idx on ledger_entries (receivable_id) where receivable_id is not null;
create index ledger_state_idx on ledger_entries (state);
create index ledger_journal_idx on ledger_entries (journal);
create index ledger_to_check_idx on ledger_entries (to_check) where to_check = true;
-- 只鎖「還算數」的列(state<>voided),作廢後同批同人才能重新匯入。見 migrations/017。
create unique index ledger_batch_party_uidx
  on ledger_entries (source_batch_id, party)
  where source_batch_id is not null and state <> 'voided';
create unique index ledger_recurring_month_uidx
  on ledger_entries (recurring_template_id, date_trunc('month', occurred_on::timestamp))
  where recurring_template_id is not null;

create trigger ledger_bump_updated
before update on ledger_entries for each row execute function bump_updated_at();

-- 未結金額派生視圖(DB 算總數,前端/API 不自己 reduce)。見 migrations/015。
create or replace view receivable_payment_state as
select
  r.id,
  r.direction,
  r.party,
  r.site_id,
  r.total_amount_twd,
  r.memo,
  r.status,
  r.agreed_due_date,
  r.created_by,
  r.created_at,
  r.updated_at,
  coalesce(settled.settled_twd, 0) as settled_twd,
  r.total_amount_twd - coalesce(settled.settled_twd, 0) as remaining_twd,
  coalesce(settled.settled_twd, 0) > r.total_amount_twd as overpaid
from receivables r
left join (
  -- 只認 posted 為已結——draft 尚未確認、voided 已作廢,兩者都不算已結金額。見 migrations/017。
  select receivable_id, sum(amount_twd) as settled_twd
  from ledger_entries
  where receivable_id is not null and state = 'posted'
  group by receivable_id
) settled on settled.receivable_id = r.id;

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

-- 月結凍結快照(第二批:工時↔薪資鎖定機制上線後才會寫入,先建骨架)
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

-- Phase 3:品項庫 + 報價單
create type quote_status as enum ('draft', 'sent', 'won', 'lost');

create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  brand text,
  name text not null,
  item_type text,
  unit text not null default '式',
  cost_price_twd integer check (cost_price_twd is null or cost_price_twd >= 0),
  sell_price_twd integer check (sell_price_twd is null or sell_price_twd >= 0),
  category text,
  note text,
  active boolean not null default true,
  -- 聲學規格(全部可 null——缺值 loud 原則,不強迫立刻補全,計算器缺值時走手動輸入)
  max_spl_db numeric check (max_spl_db is null or max_spl_db > 0),
  spl_ref_distance_m numeric check (spl_ref_distance_m is null or spl_ref_distance_m > 0),
  sensitivity_db_1w1m numeric check (sensitivity_db_1w1m is null or sensitivity_db_1w1m > 0),
  amp_power_w numeric check (amp_power_w is null or amp_power_w > 0),
  speaker_impedance_ohm numeric check (speaker_impedance_ohm is null or speaker_impedance_ohm > 0),
  amp_power_mode text check (amp_power_mode is null or amp_power_mode in ('rms', 'burst')),
  coverage_h_deg numeric check (coverage_h_deg is null or (coverage_h_deg > 0 and coverage_h_deg <= 360)),
  coverage_v_deg numeric check (coverage_v_deg is null or (coverage_v_deg > 0 and coverage_v_deg <= 360)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_active_idx on catalog_items (active);
create index catalog_category_idx on catalog_items (category);
create index catalog_search_idx on catalog_items using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(item_type,'')));

create trigger catalog_bump_updated
before update on catalog_items for each row execute function bump_updated_at();

-- 標配套組:報價常用配置模板,new quote 可從 bundle materialize 出 quote_lines
create table bundle_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  applicable_to text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bundle_templates_active_idx on bundle_templates (active, name);

create trigger bundle_templates_bump_updated
before update on bundle_templates for each row execute function bump_updated_at();

create table bundle_lines (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references bundle_templates(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id),
  name text not null,
  spec text,
  qty integer not null default 1 check (qty > 0),
  unit text,
  section text not null default '器材' check (section in ('器材', '安裝')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index bundle_lines_bundle_idx on bundle_lines (bundle_id, sort_order);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  project_name text,
  status quote_status not null default 'draft',
  need_text text,
  ai_rationale text,
  note text,
  site_id uuid references sites(id),
  tax_rate numeric(4,3) not null default 0.05 check (tax_rate >= 0 and tax_rate <= 1),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_client_idx on quotes (client_name);
create index quotes_status_idx on quotes (status, created_at desc);
create index quotes_site_idx on quotes (site_id) where site_id is not null;

create trigger quotes_bump_updated
before update on quotes for each row execute function bump_updated_at();

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id),
  name text not null,
  spec text,
  qty integer not null default 1 check (qty > 0),
  unit text,
  unit_price_twd integer check (unit_price_twd is null or unit_price_twd >= 0),
  section text not null default '器材' check (section in ('器材', '安裝')),
  is_ai_suggested boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index quote_lines_quote_idx on quote_lines (quote_id, sort_order);

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
alter table catalog_items enable row level security;
alter table quotes enable row level security;
alter table quote_lines enable row level security;
alter table site_categories enable row level security;
alter table receivables enable row level security;
alter table recurring_templates enable row level security;
alter table day_site_allocations enable row level security;
alter table user_pay_profiles enable row level security;
alter table monthly_cost_rates enable row level security;
alter table bundle_templates enable row level security;
alter table bundle_lines enable row level security;
alter table line_bind_codes enable row level security;
alter table tasks enable row level security;
alter table write_proposals enable row level security;
-- 只有 service_role 能存取(anon 全部拒絕),應用端一律由 server 走。
-- 若日後改用 Supabase Auth,改為以 auth.uid() 比對 users.id 即可。
-- user_pay_profiles/monthly_cost_rates 額外強調:即使 service_role 繞過 RLS,
-- 應用層 API/頁面也必須是 boss-only,任何員工可達的 query 絕不可 select 這兩張表。
