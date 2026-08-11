# 工具面契約 v1.0(語音/打字 → PM 系統)

**狀態**:定稿草案,發 PM 系統側確認後凍結
**日期**:2026-08-11
**變更政策**:任何欄位增刪改都要動版本號並通知雙方;破壞性變更動主版號。兩側整合測試以本契約的自動化測試(`contract/tests/`)為準——mock 跑得過的,真實作也必須跑得過。

---

## 0. 共同語彙

- **捕捉項(capture)**:現場產生的一筆原始輸入——錄音檔或打字文字。捕捉層在客戶端本地,離線可用,不在本契約範圍;但寫入工具接受 `capture_ref` 以維持稽核鏈(紀錄 → 轉寫 → 原始音檔)。
- **捕捉生命週期**(客戶端狀態,列此作為雙方共同語彙):
  `已錄存 → 待上傳 → 已上傳 → 已轉寫 → 草稿待確認 → 已寫入 | 已捨棄`
  鐵律:任一筆在任一時刻屬於且僅屬於一個狀態;失敗必須顯性(例:上傳失敗停在「待上傳」並顯示,不得靜默消失)。
- **兩階段寫入**:所有寫入 = `propose_write`(取 token)→ 使用者確認 → 帶 token 呼叫寫入工具。token 由**伺服器端(工具面)**簽發,不是 Agent 自產。

## 1. 通用規則

1. 讀取工具:冪等、免 token、免確認。
2. 寫入工具:必帶 `confirmation_token`;無 token 或 token 無效 → HTTP 401,`error_code: "TOKEN_REQUIRED" | "TOKEN_INVALID"`。**100% 拒絕,無例外。**
3. token 規則:
   - 由 `propose_write` 簽發,綁定 payload 的 SHA-256(canonical JSON:鍵排序、無空白)
   - TTL 60 秒;單次使用
   - payload 與簽發時不符 → `TOKEN_PAYLOAD_MISMATCH`
   - **冪等**:同一 token 在成功寫入後重試 → 回傳原結果(同一 `task_id`/`note_id`),不重複寫入
4. 所有 id 由伺服器端產生與驗證;不存在的 `project_id` → 404 `PROJECT_NOT_FOUND`。客戶端(Agent)規則:id 只能來自當輪 `search_projects` 回傳,禁止憑記憶填 id。
5. 錯誤格式統一:`{ "error_code": string, "message_zh": string }`。message_zh 需可直接唸給使用者聽。
6. 回傳 TTS-friendly:候選 ≤ 5、任務 ≤ 10 + 總數、欄位精簡預排序。
7. 稽核:每次 proposal 與每次寫入各落一筆(§4)。

## 2. 工具清單

### 2.1 `search_projects`(讀)
- 參數:`{ query: string }`
- 回傳:`{ candidates: [{ id, name, status, client_name }] }`,上限 5 筆,依相似度排序
- 模糊比對(名稱、客戶名、地址片段)

### 2.2 `get_project_summary`(讀)
- 參數:`{ project_id: string }`
- 回傳:`{ name, status, open_task_count, recent_updates: [{ ts, summary }] }`,recent_updates ≤ 3 筆

### 2.3 `list_tasks`(讀)
- 參數:`{ project_id: string, status?: "open" | "done" | "all" }`(預設 open)
- 回傳:`{ tasks: [{ id, title, status, due_date }], total: number }`,tasks ≤ 10

### 2.4 `propose_write`(寫入第一階段)
- 參數:`{ action: "create_task" | "log_note", payload: object }`
  - payload 形狀 = 對應寫入工具的參數(不含 confirmation_token)
- 行為:驗 payload 形狀與 project_id 存在性 → 簽發 token → 落「proposal」稽核
- 回傳:`{ confirmation_token: string, canonical_echo: object, expires_in_seconds: 60 }`
  - `canonical_echo` = 伺服器解析後的正規化 payload(日期展開成絕對日期等),Agent 必須以此複述,不得用自己記憶中的版本

### 2.5 `create_task`(寫入第二階段)
- 參數:`{ project_id, title, description?, due_date?, capture_ref?, confirmation_token }`
- 回傳:`{ task_id }`

### 2.6 `log_note`(寫入第二階段)
- 參數:`{ project_id, content, tags?, capture_ref?, confirmation_token }`
- 回傳:`{ note_id }`

**刻意不存在的工具**:修改、刪除、金額相關。使用者要求時 Agent 回覆「此操作不支援語音/快速紀錄,請用系統介面」。

## 3. 日期正規化

- `due_date` 一律 `YYYY-MM-DD`。
- 口語相對日期(「下週三」「月底前」)由 Agent 層正規化;Agent 的 system prompt 每輪注入 `今天日期、星期、時區 Asia/Taipei`。
- `propose_write` 的 `canonical_echo` 回顯絕對日期,複述時必唸出(「到期日八月十五號」),確認層兜底。

## 4. 稽核格式

每筆 proposal 與寫入:

```json
{
  "actor": "user_id",
  "ts": "ISO-8601",
  "tool": "propose_write | create_task | log_note",
  "params": { },
  "source": "voice | text",
  "transcript_ref": "轉寫文字之引用(語音來源必填)",
  "capture_ref": "原始捕捉項引用(有則填)",
  "proposal_token": "關聯的 token"
}
```

驗收:隨機抽 10 筆語音寫入,能從紀錄回溯到轉寫文字與原始音檔。

## 5. 認證(佔位,Phase 1 單一使用者)

- 工具面僅接受帶有效 API key 的呼叫(`Authorization: Bearer`);key 配發給 Agent 服務端,不進客戶端。
- 多使用者/權限分級為 Phase 2,欄位 `actor` 先行保留。

## 6. 版本

- 所有回應帶 `X-Contract-Version: 1.0`。
- 測試套件斷言版本相容。
