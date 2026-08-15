-- 月結改版(docs/payroll-pettycash-merge-spec.md):把零用金管理+薪資結算併進
-- 帳務管理的「月結」模式。固定月薪走既有的 user_pay_profiles(舊表,一直沒程式碼
-- 用過);獎金是視案件/加班的人為決定,系統只記錄不計算,鎖定前可改、鎖定後
-- 轉成 ledger_entries 就不再回頭改分錄以外的地方。
--
-- 「鎖定」沿用既有 book_batches(unique on month)當作月級鎖——鎖定前 bonus 可編輯,
-- 鎖定後(該月已有 book_batches 列)一律唯讀,不新增 locked 欄位。
--
-- ⚠️ 尚未在真 postgres 環境跑過,套用前依專案慣例先在含代表性資料的副本演練。

create table payroll_bonuses (
  id uuid primary key default gen_random_uuid(),
  batch_month date not null,
  user_id uuid not null references users(id),
  amount_twd integer not null check (amount_twd > 0),
  memo text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_month, user_id)
);

create index payroll_bonuses_month_idx on payroll_bonuses (batch_month);

comment on table payroll_bonuses is
  '月結鎖定前的獎金草稿(視案件/加班,人為決定的金額,系統不計算)。鎖定時依
   batch_month 轉成 ledger_entries(kind=bonus),之後這張表的資料就只是歷史留存,
   不再是唯一真相——鎖定後的正確數字看 ledger_entries。是否已鎖定看
   book_batches 有沒有該月份(month = batch_month)的紀錄,這張表本身不加鎖定欄位。';

create trigger payroll_bonuses_bump_updated
before update on payroll_bonuses for each row execute function bump_updated_at();

-- === 驗證查詢 ===
-- select batch_month, count(*), sum(amount_twd) from payroll_bonuses group by 1 order by 1;
