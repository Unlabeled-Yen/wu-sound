-- Phase 3 migration:品項庫 + 報價單
-- 對現有 DB 執行這份。全新專案跑 schema.sql 已含。

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_active_idx on catalog_items (active);
create index catalog_category_idx on catalog_items (category);
create index catalog_search_idx on catalog_items using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(item_type,'')));

create trigger catalog_bump_updated
before update on catalog_items for each row execute function bump_updated_at();

create table quotes (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  project_name text,
  status quote_status not null default 'draft',
  need_text text,
  ai_rationale text,
  note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_client_idx on quotes (client_name);
create index quotes_status_idx on quotes (status, created_at desc);

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
  is_ai_suggested boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index quote_lines_quote_idx on quote_lines (quote_id, sort_order);

alter table catalog_items enable row level security;
alter table quotes enable row level security;
alter table quote_lines enable row level security;
