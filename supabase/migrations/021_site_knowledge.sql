-- 場地知識:跨案子、掛地點(不掛案子)的長效筆記。見 06-project-board.md 11c、
-- 08-專案管理新建清單.md §1。掛 site_id 直接就是「地點」——這個 repo 的
-- sites 表本來就代表案場/地點,不新增 venues 這層(跟舊版方向不同,08 定案)。
-- 進場必讀上限 5 條是刻意的摩擦,app 層強制(validatePin),不下 DB constraint——
-- 這條規則的意義是「逼人取捨」,不是資料完整性,不該用資料庫層級鎖死。

create table site_knowledge (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  body text not null,
  hall text,
  pinned boolean not null default false,
  promoted_to_checklist boolean not null default false,
  author_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_viewed_at timestamptz
);

create index site_knowledge_site_idx on site_knowledge (site_id);
create index site_knowledge_site_pinned_idx on site_knowledge (site_id) where pinned = true;

create trigger site_knowledge_bump_updated
before update on site_knowledge for each row execute function bump_updated_at();

alter table site_knowledge enable row level security;

-- === 驗證查詢 ===
-- select site_id, count(*) filter (where pinned) from site_knowledge group by site_id;
