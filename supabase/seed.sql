-- 開發用 seed。PIN hash 用應用內 npm run seed 產生(避免把明碼寫死在 SQL)。
-- 這份只放案場、預設老闆記錄佔位。實際使用者、PIN 走 scripts/seed-users.ts。
-- sites.venue_id 為 not null(見 migrations/018),seed 也各自配一個同名場館。
insert into venues (name) values
  ('恩光堂'), ('磐頂長老教會'), ('THE HOPE Taipei'), ('北屯旌旗'),
  ('新竹旌旗'), ('斗六旌旗'), ('豐原旌旗')
on conflict do nothing;

insert into sites (name, venue_id)
select v.name, v.id from venues v
where v.name in ('恩光堂', '磐頂長老教會', 'THE HOPE Taipei', '北屯旌旗', '新竹旌旗', '斗六旌旗', '豐原旌旗')
on conflict (name) do nothing;
