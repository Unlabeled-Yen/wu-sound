# voice-lab — 現場語音/打字紀錄介面

工程現場「個人重點摘要」的語音+打字紀錄介面。設計於 wu-sound-fde repo 內,與主系統共用 monorepo,但契約層獨立,未來要拆去別的專案也不會綁死。

**目標場景**:員工在工程現場口述會議內容/注意事項,離線也能捕捉,回連後結構化寫回 PM 資料層(sites/worklogs/tasks 或等價實體)。

**原始 spec**:[handoff-v0.1.md](handoff-v0.1.md) v0.1 draft
**已定案的三個範圍決策**:
1. 口述 = 個人重點摘要(不做多說話者分離)
2. 台語比例低(STT 選型放寬,擂台仍要測工地噪音+中英夾雜)
3. **離線優先**:錄音/打字先落本地佇列,連線後批次處理;打字與語音共用同一條「結構化→對齊→確認→寫入」管線

---

## 兩段式生命週期(核心架構)

```
【現場・可完全離線】捕捉層(手機 PWA)
  按住錄音 / 打字 → 本地佇列
  狀態:已錄存 → 待上傳 → 已上傳 → 已轉寫 → 草稿待確認 → 已寫入 | 已捨棄
  鐵律:任一筆任一時刻僅屬一個狀態,絕不靜默消失

【有網路時】處理層
  上傳 → 批次轉寫(語音)→ LLM 結構化 → 實體對齊
  → 草稿確認(複述/顯示)→ 兩階段 token 寫入
```

## Milestones

| Lab | 內容 | 狀態 |
|---|---|---|
| Lab 0 | 契約定稿(`contract/`):6 工具、伺服器簽發兩階段 token、冪等、稽核格式、可執行測試 | ✅ 已交付 |
| Lab 1 | wu 後端轉接層(A 路):`tasks`/`write_proposals` 新表 + 6 端點,規格見 [lab1-wu-adapter-spec-v1.md](lab1-wu-adapter-spec-v1.md) | ✅ **程式碼已交付**,⏳ 待套 migration + 手動驗收 |
| Lab 2 | 文字模式 Agent:狀態機、實體對齊、確認流程 —— **此即打字系統本體,非測試工具** | 待做 |
| Lab 3 | STT 擂台:批次轉寫為主,語料含工地噪音、中英夾雜案名、少量台語;TTS 盲測 | 待做 |
| Lab 4 | 語音掛載:手機 PWA push-to-talk + 本地佇列 + 批次處理管線 | 待做 |

## Lab 1 現況(2026-08-11)

**已完成**:
- `supabase/migrations/009_voice_tasks_proposals.sql`(`tasks` + `write_proposals` 兩表)
- `web/lib/voice.ts`(認證、canonical hash、統一錯誤格式、DB 錯誤轉 loud 503)
- `web/app/api/voice/tools/[tool]/route.ts`(6 工具的完整實作)
- `web/lib/types.ts` 追加 `VoiceTask` / `WriteProposal` 型別
- `web/.env.example` 追加 `VOICE_API_KEY` / `VOICE_ACTOR_USER_ID`
- `web/scripts/voice-lab-probe.mjs`(查現有 active 使用者/測試 site/兩張新表是否已建)、
  `web/scripts/voice-lab-setup.mjs`(建立 `__voice_lab_test__` 測試 site,冪等可重跑)
- `.env.local` 本機已設好 `VOICE_API_KEY` / `VOICE_ACTOR_USER_ID`(= 老闆)/ `VOICE_TEST_SITE_ID`
- `tsc --noEmit`、`npm run build` 全綠

**驗證中抓到並修掉兩個真的 bug**(migration 套用前用本機 dev server 實測發現):
1. `get_project_summary` 原本用 `{ count: 'exact', head: true }` 查任務數 —— 實測發現 PostgREST 對「表不存在」的 HEAD 請求會回 `204 + error:null + count:null`,等於把「查不到」偽裝成「0 筆任務」。改用一般 count 查詢讓錯誤正常浮現。
2. `isUndefinedTableError` 原本只認 Postgres 原生代碼 `42P01`,但 PostgREST 實際回的是自己包過的 `PGRST205`,導致「表不存在」被誤判成普通 500 而非設計中的 loud 503。兩種代碼現在都收。

**已實測通過**(本機 dev server + 假 site,未動任何正式資料):
- 缺 `VOICE_API_KEY` → 503 `SERVICE_UNAVAILABLE`
- API key 錯誤 → 401 `UNAUTHORIZED`
- `tasks`/`write_proposals` 未建立時,`get_project_summary` / `list_tasks` / `propose_write` 三支都一致回 503「voice 資料表尚未建立」,不再有任何一支假裝成功
- `search_projects`(只碰既有 `sites` 表)正常運作,能搜到測試 site

**待 Yen 做**(見 [lab1-wu-adapter-spec-v1.md](lab1-wu-adapter-spec-v1.md) 附錄「7c 手動驗收步驟」):
1. 套用 migration 009(貼 Supabase SQL Editor)—— 這是唯一剩下、且只有你能做的手動步驟
2. 套完後跑 `voice-lab/contract/tests`(契約測試 12 條 + 補充測試 8 條),或請我幫你跑
3. 測完記得把 `__voice_lab_test__` 這個測試 site 停用或刪除

**零改動**:既有表、既有 API 完全沒動,可用 `git diff` 稽核。

## 測試用法

```bash
cd voice-lab/contract/tests && npm install

# 契約測試(12 條,只驗回傳形狀)
BASE_URL=http://localhost:3000/api/voice VOICE_API_KEY=<...> npm test -- contract

# 補充測試(8 條,驗 DB 落地、冪等、稽核;需 migration + 測試 site,見 spec 附錄)
BASE_URL=http://localhost:3000/api/voice VOICE_API_KEY=<...> VOICE_TEST_SITE_ID=<...> \
NEXT_PUBLIC_SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> npm test -- wu-adapter
```

契約變更政策見 [contract/tool-contract-v1.md](contract/tool-contract-v1.md) 開頭。
