-- 開發用 seed。PIN hash 用應用內 npm run seed 產生(避免把明碼寫死在 SQL)。
-- 這份只放案場、預設老闆記錄佔位。實際使用者、PIN 走 scripts/seed-users.ts。
insert into sites (name) values
  ('恩光堂'), ('磐頂長老教會'), ('THE HOPE Taipei'), ('北屯旌旗'),
  ('新竹旌旗'), ('斗六旌旗'), ('豐原旌旗')
on conflict (name) do nothing;
