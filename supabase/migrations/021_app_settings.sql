-- 簡易 key-value 設定表。用途:存「現金起點」「安全水位」等老闆自行設定的全域數字,
-- 不值得為每個設定建獨立欄位。key 用明確的 snake_case 字串,value 一律存 text,
-- 呼叫端自行轉型(避免 jsonb 反序列化的隱含成本與型別模糊)。
create table app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- 預設值:起點 0、安全水位 150000(TWD)。老闆可隨時從帳務首頁改。
insert into app_settings (key, value) values
  ('cash_start_balance', '0'),
  ('cash_safety_level', '150000');
