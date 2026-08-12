-- LINE bot 綁定:users 加 line_user_id + 一次性綁定碼表
-- 綁定 flow:使用者在 web(/staff/settings 或 /boss/more)產生 6 位數字碼(10 分鐘 TTL)
-- → 加 bot 好友後傳「綁定 123456」→ webhook 查碼綁 line_user_id → 完成、碼即刻失效

alter table users
  add column line_user_id text unique;

create table line_bind_codes (
  code text primary key,                 -- 6 位數字
  user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,       -- created_at + 10 分鐘
  used_at timestamptz                    -- 非 null = 已使用,不可再綁
);

create index line_bind_codes_expiry_idx on line_bind_codes (expires_at);

alter table line_bind_codes enable row level security;
