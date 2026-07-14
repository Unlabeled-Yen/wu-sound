-- 標配套組:報價常用配置模板,new quote 可從 bundle materialize 出 quote_lines

create table bundle_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- 例: "教會主堂-小型基礎"
  applicable_to text,                    -- 例: "100坪以下教會主堂",給老闆挑選時判斷用
  note text,                             -- 例: "低頻不足時另加 KW181 x2",老闆給自己看的
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
  catalog_item_id uuid references catalog_items(id),  -- 連到價目表(可 null=手動加自由行)
  name text not null,                                  -- 快照(價目表改名不影響 bundle)
  spec text,
  qty integer not null default 1 check (qty > 0),
  unit text,
  section text not null default '器材' check (section in ('器材', '安裝')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index bundle_lines_bundle_idx on bundle_lines (bundle_id, sort_order);

alter table bundle_templates enable row level security;
alter table bundle_lines enable row level security;
