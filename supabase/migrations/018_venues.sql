-- 場館/場地實體。既有 sites 表一直被當「案子」用(一次性、掛 category/customer),
-- 但 06-project-board.md 的「場地知識」明講跟著地點走、不跟著案子——同一場館可能
-- 被好幾個不同案子重複進場。新增 venues 承接「地點」這個維度,sites(案子)引用它。
-- 見 docs/06-project-board.md 11c。

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamptz not null default now()
);

alter table sites add column venue_id uuid references venues(id);

-- 回填:既有每一筆案子視為一次性案子,各自產生一個同名場館並指回去。
-- 之後新案子在建立時可以選既有場館,場地知識才真正開始跨案子累積。
insert into venues (name)
select s.name from sites s;

update sites s
set venue_id = v.id
from venues v
where v.name = s.name and s.venue_id is null;

alter table sites alter column venue_id set not null;

create index sites_venue_idx on sites (venue_id);

alter table venues enable row level security;

-- === 驗證查詢 ===
-- select count(*) from sites where venue_id is null; -- 應為 0
-- select s.name, v.name from sites s join venues v on v.id = s.venue_id limit 5;
