# 部署 SOP(v1,2026-07-13)

從空專案到雇主可以打開網址、員工可以拿手機拍收據,一路到底。全部按下去約 30–45 分鐘。

## 一次性準備

- Node 20+ 已在 `web/` 用得起(`node -v`)
- GitHub repo 已建:`Unlabeled-Yen/wu-sound-fde`
- 帳號:Supabase(免費層)、Vercel(免費層)、Anthropic Console(API key,用量制)

---

## 步驟 1 — 建 Supabase 專案

1. 打開 [supabase.com](https://supabase.com) → New project。
2. Name:`wu-sound-fde`,Region:選 `East Asia (Tokyo)`(對台灣延遲最低)。
3. Database password:**用 password manager 存**,之後才拿得回。
4. 專案建好後(約 2 分鐘),記下:
   - `Project URL`(Settings → API)→ 之後填 `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → 填 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → 填 `SUPABASE_SERVICE_ROLE_KEY`(**極機密,只在 server 用**)

## 步驟 2 — 建 schema

1. 左側 SQL Editor → New query。
2. 打開 repo 的 `supabase/schema.sql`,全部貼進去 → Run。應該顯示成功、無錯誤。
3. 再開一個 New query,貼 `supabase/seed.sql` → Run。這只是先塞入案場清單。

若中途要重來:`drop schema public cascade; create schema public;` 然後重跑上面兩份。**注意這會清所有資料**,只在還沒上線前這樣做。

## 步驟 3 — 建 Storage bucket

1. 左側 Storage → New bucket。
2. Name:`receipts`。**Public:關**(切記,收據和員工照片不能公開)。File size limit:預設即可。
3. 建好後不用另設 policy——本系統統一由 server 端 service_role 存取,不走 anon。

## 步驟 4 — 本地執行

```bash
cd web
cp .env.example .env.local
```

編輯 `.env.local`,依步驟 1 貼入三個 Supabase 值,和以下:

| 變數 | 從哪拿 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上(reveal 一下) |
| `SUPABASE_STORAGE_BUCKET` | 保持 `receipts` |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/) → API keys |
| `SESSION_SECRET` | 執行 `openssl rand -base64 32` 產出的字串 |

裝依賴、建首組使用者、啟服務:

```bash
npm install
npm run seed:users -- 吳智仁 boss 8899
npm run seed:users -- 許舒韶 staff 1234
npm run seed:users -- 賴泯亘 staff 5678
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000) → 應該被導向 `/login` → 選姓名 + 4 位 PIN → 老闆進 `/boss`、員工進 `/staff`。

## 步驟 5 — 冒煙驗證(3 分鐘)

- [ ] 員工登入 → `/staff/capture` 打開直接是相機按鈕
- [ ] 拍任何一張照片(或按無收據 → 加油 → 200)→ 看到「已收到 · 待確認 +1」
- [ ] `/staff/queue` 出現 1 筆草稿,點入編輯 → 送出
- [ ] 老闆登入 → `/boss/expenses` 看得到那筆 → 按確認
- [ ] `/boss/close` 選當月 → 若還有其他草稿要看到紅色橫幅擋住月結
- [ ] 匯出 CSV 打開,用 Excel 開沒亂碼

任何一步炸開 = 讀錯誤訊息,常見狀況見文末。

## 步驟 6 — Vercel 部署

1. [Vercel Dashboard](https://vercel.com) → Add New → Project → Import `Unlabeled-Yen/wu-sound-fde`。
2. Framework Preset:Next.js(自動偵測)。**Root Directory 一定要設 `web`**。
3. Environment Variables:把 `.env.local` 那 6 個變數逐一填入(對照 `web/.env.example`)。`SESSION_SECRET` 用**跟本地不同**的一組(再跑一次 `openssl rand`)。
4. Deploy。約 3 分鐘出網址。

打開 Vercel 給的 URL,重跑步驟 5 的冒煙驗證,通過即完成部署。

## 步驟 7 — 給雇主的最終交付

- 網址:Vercel 生的 `wu-sound-fde-xxx.vercel.app`(或綁自訂域名)
- 老闆帳號 + PIN(密碼管理器交付,不用 LINE)
- 員工帳號:三人都由老闆代領 PIN,再私下告知本人
- 員工手機教學一句話:「用 Safari 打開網址 → 分享 → 加入主畫面 → 之後點桌面圖示就能拍」

---

## 常見錯誤

| 症狀 | 原因 | 修法 |
|---|---|---|
| 打開 `/login` 500 | Supabase env 沒填/填錯 | `web/.env.local` 對照 example 每個 key 檢查 |
| `SESSION_SECRET must be set` | 部署時漏填 | Vercel Env 補齊,Redeploy |
| 拍照上傳失敗:`Bucket not found` | 沒建 `receipts` bucket | 回步驟 3 建 |
| AI 抽不到金額但員工卻不知道 | ai_draft.confidence='low' 是**預期行為**,員工端會顯示紅色橫幅要求手填 | 不是 bug |
| 月結按不下去 | 有 draft/submitted 待處理 | 這是**故意**的,雇主必須先清完當月未處理才能結算(憲章:無靜默失效) |
| Vercel 部署炸 `Cannot find module @/lib/session` | Root Directory 沒設 `web` | 專案設定改 Root Directory |
| 員工手機拍照後 app 白畫面 | Safari 對 `capture="environment"` 版本敏感 | iOS 15+ OK;更舊要升級系統 |

## 之後怎麼更新程式

1. `git pull` → 改 code → 在 `web/` 跑 `npm run build` 檢查
2. `git push` → GitHub Actions CI 綠燈 → Vercel 自動 redeploy
3. 有 schema 變更:在 Supabase SQL editor 執行對應 migration(未來建 `supabase/migrations/` 目錄管理)

---

**憲章提醒**:任何新功能都要能通過「這在雇主 Excel 上 loud 出錯 vs. 靜默失效」的檢驗。不確定就選 loud。
