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
| Lab 1 | Mock 工具面(過契約測試)+ 假專案資料(含相似名測實體對齊) | 待做 |
| Lab 2 | 文字模式 Agent:狀態機、實體對齊、確認流程 —— **此即打字系統本體,非測試工具** | 待做 |
| Lab 3 | STT 擂台:批次轉寫為主,語料含工地噪音、中英夾雜案名、少量台語;TTS 盲測 | 待做 |
| Lab 4 | 語音掛載:手機 PWA push-to-talk + 本地佇列 + 批次處理管線 | 待做 |
| 接系統 | 契約對接 wu-sound-fde 既有 API(sites/worklogs)或另建 tasks 表 | 待決定 backend |

## 契約測試用法

```bash
cd voice-lab/contract/tests && npm install
BASE_URL=http://localhost:8787 API_KEY=dev-key npm test
```

Mock(Lab 1)與正式後端(未定)都要跑同一套。契約變更政策見 [contract/tool-contract-v1.md](contract/tool-contract-v1.md) 開頭。

## 待你拍板

**backend 是接誰?** 現在契約用的是通用 PM 詞彙(`search_projects`、`create_task`、`log_note`)——需要決定:

- **選 A**:直接接 wu-sound-fde 既有 API,`projects` 映射到 sites、`tasks` 需新建 tasks 表(即之前討論擱著的派工系統)、`log_note` 對應 worklogs
- **選 B**:接另一個外部 PM 系統(需對方提供技術棧)
- **選 C**:先做 mock,backend 之後再說

選定前 Lab 1 mock 都能做,不阻塞。
