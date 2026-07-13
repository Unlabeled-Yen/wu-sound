-- Phase 2 migration:大型設備位置追蹤
-- 對現有 DB 執行這份即可;全新專案跑 schema.sql 已含。

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

alter table equipment enable row level security;
alter table equipment_movements enable row level security;
