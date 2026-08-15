-- 場地知識:跨案子、掛場館(不掛案子)的長效筆記。見 docs/06-project-board.md 11c。
-- 進場必讀上限 5 條是刻意的摩擦,app 層強制(validatePin),不下 DB constraint——
-- 這條規則的意義是「逼人取捨」,不是資料完整性,不該用資料庫層級鎖死。

create table site_knowledge (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id),
  source_site_id uuid references sites(id),
  content text not null,
  area_label text,
  pinned boolean not null default false,
  promoted_to_checklist boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_viewed_at timestamptz
);

create index site_knowledge_venue_idx on site_knowledge (venue_id);
create index site_knowledge_venue_pinned_idx on site_knowledge (venue_id) where pinned = true;

create trigger site_knowledge_bump_updated
before update on site_knowledge for each row execute function bump_updated_at();

alter table site_knowledge enable row level security;

-- === 驗證查詢 ===
-- select venue_id, count(*) filter (where pinned) from site_knowledge group by venue_id;
