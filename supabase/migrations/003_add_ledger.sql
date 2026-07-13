-- Phase 4 migration:內帳結構化
-- 對現有 DB 執行;新專案 schema.sql 已含。

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

-- 每個 batch 每個對象只能被匯入一次,防止重複點按鈕
create unique index ledger_batch_party_uidx
  on ledger_entries (source_batch_id, party)
  where source_batch_id is not null;

create trigger ledger_bump_updated
before update on ledger_entries for each row execute function bump_updated_at();

alter table ledger_entries enable row level security;
