# wu-sound-fde web

Phase 1 員工手機三件套。規格見 `../docs/phase1-spec-v1.md`。

## 開發環境

需要 Node 20+、Supabase 專案、Anthropic API key。

```bash
cp .env.example .env.local  # 填入 Supabase / Anthropic 憑證
npm install
npm run dev
```

## Supabase 初始化

1. 建新專案(免費層即可)。
2. SQL editor 執行 `../supabase/schema.sql`,再執行 `../supabase/seed.sql`。
3. Storage 建 `receipts` bucket(private)。
4. 把 URL、anon key、service_role key 填進 `.env.local`。
5. 建立第一組使用者:`npm run seed:users`(互動式)。

## 部署

Vercel free tier 直接 import repo。環境變數對應 `.env.example`。

## 憲章提醒

- 金額整數為單位存(元),UI 顯示才格式化。
- AI 只出草稿,不寫金額到 DB 的 `amount_twd`。使用者按送出才升為 `submitted`。
- 所有失敗要 loud;不允許看似成功實則靜默失效。
