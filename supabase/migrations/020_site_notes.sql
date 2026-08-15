-- 場地知識:案場累積的經驗筆記。依廳別(zone)分群,可釘選(上限 5),
-- 可升級成檢查表項目(is_checklist = true 後在施工前清單出現)。

create table site_notes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  zone text not null default '',
  content text not null,
  is_pinned boolean not null default false,
  is_checklist boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_notes_site_idx on site_notes (site_id, is_pinned desc, created_at desc);

alter table site_notes enable row level security;
