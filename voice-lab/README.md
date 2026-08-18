# voice-lab — 現場語音/打字紀錄介面

工程現場「個人重點摘要」的語音+打字紀錄介面。設計於 wu-sound-fde repo 內,與主系統共用 monorepo,但契約層獨立,未來要拆去別的專案也不會綁死。

**目標場景**:員工在工程現場口述會議內容/注意事項,離線也能捕捉,回連後結構化寫回 PM 資料層(sites/worklogs/tasks 或等價實體)。

**原始 spec**:[handoff-v0.1.md](handoff-v0.1.md) v0.1 draft
**已定案的三個範圍決策**:
1. 口述 = 個人重點摘要(不做多說話者分離)
2. 台語比例低(STT 選型放寬,擂台仍要測工地噪音+中英夾雜)
3. **離線優先**:錄音/打字先落本地佇列,連線後批次處理;打字與語音共用同一條「結構化→對齊→確認→寫入」管線

## 定位(2026-08-18 Yen 確認):平台 + 一個會讀寫的 AI,入口只是媒介

**不是兩套獨立的 AI 產品。** 桌面 ⌘K 跳去的助理頁、手機 logo 點下去的入口,都應該是
**同一個 AI**(同一套對話邏輯、同一組工具)——差別只在使用者從哪扇門進來(鍵盤 vs
觸控/語音)。往下擴充語音/打字功能時,不要把手機端另外長出一套邏輯,兩端共用
Lab 1 的工具轉發層跟 Lab 2 的 runtime。

**AI 的讀寫權限要跟人一樣,不是另一套規則。** 員工對 AI 說「查本月帳目」,AI 應該
像員工本人一樣看不到財務,而不是偷偷幫他查——跟 `web/lib/acl.ts` 那份人類 UI 用的
能力表是同一份鐵律,不能因為換成 AI 代為操作就繞過去。

**現況誠實記錄(不是已經做到,是還沒被測試到)**:目前 `AGENT_TOOLS`
(`web/lib/voice-agent-tools.ts`)只有 `search_projects`/`get_project_summary`/
`list_tasks`/`propose_create_task`/`propose_log_note` 五個工具,對應到 `lib/acl.ts`
的 `sites` 能力——這塊本來就對員工/老闆兩邊都開放,所以現在**没有**已知的越權缺口,
但那是因為工具面還沒碰到財務/標案這類禁區,**不是因為有一層機制在擋**。
`app/api/voice/tools/[tool]/route.ts` 的 `authenticateVoiceRequest` 已經拿得到
呼叫者的 `actorId`,但沒有任何地方拿它去對 `can(role, cap)` 查表。

**之後要新增任何會碰到財務/標案/使用者管理資料的工具之前**,必須先補上這一層
(工具本身依 `actorId` 查角色、依 `lib/acl.ts` 的能力表擋),不能假設「現在沒事」
就繼續這樣擴充——那正是這個專案的憲章要擋的那種靜默失效。

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
| Lab 3 | 語音層:A+B 雙軌確認(螢幕優先、免手情境開口令)、3a 瀏覽器內建 STT,規格見 [lab3-voice-spec-v1.md](lab3-voice-spec-v1.md) | 四件事已確認(2026-08-18),3a 待動工 |
| Lab 4 | 語音掛載:手機 PWA push-to-talk + 本地佇列 + 批次處理管線;員工首頁 AI 入口(logo 即狀態指示器)第一版元件已做出來,規格見 [lab4-mobile-agent-entry-brief-v1.md](lab4-mobile-agent-entry-brief-v1.md) | 視覺層已做(純狀態機,未接語音),等 Lab 3 動工才能真的接上 |

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
