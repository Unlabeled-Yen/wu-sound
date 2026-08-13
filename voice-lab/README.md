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
| Lab 1 | wu 後端轉接層(A 路):`tasks`/`write_proposals` 新表 + 6 端點,規格見 [lab1-wu-adapter-spec-v1.md](lab1-wu-adapter-spec-v1.md) | ✅ **完成,22/22 測試綠**(2026-08-11) |
| Lab 2 | 文字模式 Agent:狀態機、實體對齊、確認流程 —— **此即打字系統本體,非測試工具**,規格見 [lab2-text-agent-spec-v1.md](lab2-text-agent-spec-v1.md) | 規格草案,待 Yen 確認 3 題後動工 |
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

**過程中抓到並修掉 3 個真的 bug**(逐步驗證發現,細節見 spec §9):
1. `get_project_summary` 的 count 查詢用 `head:true`,PostgREST 對不存在的表回 `204+error:null+count:null`,把「查不到」偽裝成「0 筆」——改用一般 count 查詢。
2. `isUndefinedTableError` 誤判錯誤代碼(只認 `42P01`,PostgREST 實際回 `PGRST205`)——導致該 503 卻變普通 500。
3. **格式不對的 id 打進 DB 變成 500,不是契約要求的 404/401**——新增 `isWellFormedUuid()` 在打 DB 前先擋。這個是跑真正的契約測試(不是手動戳兩下)才抓到的,證明「跑測試」跟「本機驗證幾個 case」是不同等級的把關。

**migration 009 已套用**(2026-08-11,與 007/008/010 一起貼)。

**最終驗證結果:22/22 測試全綠**
- 契約測試 14/14(對著 wu 真實轉接層跑,非 mock)
- 補充測試 8/8(DB 落地、冪等、稽核完整性、search 過濾 inactive、既有 API 零迴歸、缺配置 loud)
- 測試用的 `__voice_lab_test__` site 已設 `active=false`,不會出現在老闆看到的正式案場清單

**零改動**:既有表、既有 API 完全沒動,可用 `git diff` 稽核。

## 測試用法

```bash
cd voice-lab/contract/tests && npm install

# 契約測試(12 條,只驗回傳形狀)
VOICE_BASE_URL=http://localhost:3000/api/voice VOICE_API_KEY=<...> npm test -- contract

# 補充測試(8 條,驗 DB 落地、冪等、稽核;需 migration + 測試 site,見 spec 附錄)
VOICE_BASE_URL=http://localhost:3000/api/voice VOICE_API_KEY=<...> VOICE_TEST_SITE_ID=<...> \
NEXT_PUBLIC_SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> npm test -- wu-adapter
```

契約變更政策見 [contract/tool-contract-v1.md](contract/tool-contract-v1.md) 開頭。
