# Lab 4 規格 v1 — AI 助理工具擴張

**日期**：2026-08-15
**狀態**：規格初稿,待 Yen 指示後動工
**前置**：Lab 2（打字模式 agent, CLOSED）、Lab 3c（Realtime 語音, 進行中）
**原則**：Yen 原話「我會做這兩條線」——Read（幾乎全開）和 Write·Field Records（可擴、兩階段確認）。

---

## 0. 教訓與設計約束

Lab 2 已實證的硬約束,本規格全部繼承,不重新辯論：

| 編號 | 約束 | 來源 |
|------|------|------|
| C1 | 每加一個工具,模型辨答率就下降。工具數從 8→11 時 Kimi 品質崩壞,gpt-4o 較穩但仍然有邊際效應 | Lab 2 民生/救難工具回退事件 |
| C2 | LLM 沒有寫入工具；只有 `propose_*`,真正寫入由伺服器端 `commitWrite` 執行 | spec §4 防禦設計 |
| C3 | respond 閘門：這一輪沒呼叫過任何 READ_TOOLS 就不准 respond（Realtime 模式放寬為 soft） | Lab 2 §8 |
| C4 | 財務終端動作永遠不存在工具型別裡（ADR-0002）| Yen 決策 |
| C5 | 確認口令走白名單字串比對,不讓 LLM 判斷「使用者是否同意」 | Lab 2/3c |

**C1 的操作推論：不把所有工具一次灌進去。按頁面情境載入子集。**

---

## 1. 權限三層架構（不變）

```
┌─────────────────────────────────────────────────────┐
│  Read（幾乎全開）                                      │
│  → 查專案、查任務、查設備、查帳務摘要、查打卡…          │
│  → 不需使用者確認                                      │
├─────────────────────────────────────────────────────┤
│  Write · Field Records（可擴張）                       │
│  → 新增任務、記工作記錄、記設備異動、記打卡…              │
│  → 兩階段確認（propose → confirm）                      │
├─────────────────────────────────────────────────────┤
│  Write · Financial Terminal（永久封鎖）                 │
│  → 開發票、沖帳、調整金額、轉帳…                        │
│  → 工具不存在於型別定義,LLM 連 propose 的機會都沒有     │
│  → ADR-0002：「AI 只選品項,絕不決定價格」               │
└─────────────────────────────────────────────────────┘
```

---

## 2. 資料盤點：表 × 現有 lib × 可做的工具

下表列出所有 DB 表,標注哪些已有 lib/API 可直接接,哪些要新寫。

### 2.1 Read 線（查詢工具）

| DB 表 | 現有 lib/API | 新工具名 | 優先級 | 備註 |
|--------|-------------|---------|--------|------|
| `sites` | Lab 1 `search_projects` | ✅ 已有 `search_projects` | — | pg_trgm, migration 016 |
| `sites` | Lab 1 `get_project_summary` | ✅ 已有 `get_project_summary` | — | |
| `tasks` | Lab 1 `list_tasks` | ✅ 已有 `list_tasks` | — | |
| `equipment` | `equipment-actions.ts` | `search_equipment` | P1 | 按名稱/案場查設備位置 |
| `equipment_movements` | （需新寫 query） | `get_equipment_history` | P2 | 設備異動歷程 |
| `clockins` | `hours.ts` | `get_today_clockins` | P1 | 今天誰打了卡、在哪個案場 |
| `day_site_allocations` | （同上）| `get_site_allocation` | P2 | 人力配置 |
| `worklogs` | （已在 get_project_summary 內） | `list_worklogs` | P2 | 獨立查特定案場的工作記錄 |
| `expenses` | `expense-capture.ts` | `list_recent_expenses` | P2 | 最近幾筆支出（不含金額明細） |
| `ledger_entries` | `ledger-summary.ts` | `get_ledger_summary` | P3 | 營收/支出摘要（只看彙總,不看單筆金額）|
| `receivables` | `receivables-query.ts` | `get_receivables_status` | P3 | 應收帳款狀態（只看筆數與總額級距）|
| `quotes` | `quote-calc.ts` | — | 🚫 | 報價屬財務,不開讀取工具 |
| `catalog_items` | — | `search_catalog` | P3 | 品項/料號查詢 |

**P3 的 ledger/receivables 讀取只回彙總數字（如「本月支出 12 筆」），不回單筆金額——避免語音場景把金額唸出來被旁人聽到。**

### 2.2 Write · Field Records 線（提案工具）

| 動作 | 現有 Lab 1 handler | 新工具名 | 優先級 | 備註 |
|------|-------------------|---------|--------|------|
| 新增任務 | `create_task` | ✅ 已有 `propose_create_task` | — | |
| 記工作記錄 | `log_note` | ✅ 已有 `propose_log_note` | — | |
| 記設備異動 | （需新寫） | `propose_log_equipment_move` | P1 | 「把 JBL 喇叭從倉庫搬到磐頂」 |
| 補打卡 | （需新寫） | `propose_clockin` | P2 | 「幫我補打今天早上九點到磐頂的卡」 |
| 記支出 | `expense-capture.ts` | `propose_log_expense` | P2 | 「買了一箱螺絲 350 元」——金額由使用者口述,AI 不決定 |

**所有 Write 工具名一律 `propose_*` 前綴,走既有兩階段確認。**

### 2.3 永久封鎖（不做工具）

以下操作不會出現在任何工具清單裡,LLM 不知道它們存在：

- 開發票 / 沖帳 / 調整金額 / 作廢帳目
- 修改報價 / 建立報價
- 刪除任何記錄
- 修改使用者權限 / 薪資設定
- 修改 `monthly_cost_rates`、`user_pay_profiles`

---

## 3. 情境式工具載入

### 3.1 為什麼不一次全開

C1 約束：Lab 2 實測工具從 8→11 時,模型準確度明顯下降。全部工具一次灌進去（預估 15-20 個）必定更差。

### 3.2 策略：按來源頁面決定工具子集

AI 助理是獨立分頁,使用者可從任何 ERP 頁面 ⌘K 跳過來。跳轉時 `sessionStorage` 記錄來源頁面路徑。

| 來源頁面 | 載入的 Read 工具 | 載入的 Write 工具 | 工具總數 |
|----------|-----------------|------------------|---------|
| `/boss/sites` 或 `/boss/worklogs` | search_projects, get_project_summary, list_tasks, list_worklogs | propose_create_task, propose_log_note | 8-9 |
| `/boss/equipment` | search_projects, search_equipment, get_equipment_history | propose_log_equipment_move | 7-8 |
| `/boss/clockins` | search_projects, get_today_clockins, get_site_allocation | propose_clockin | 7-8 |
| `/boss/expenses` | search_projects, list_recent_expenses | propose_log_expense | 7-8 |
| `/boss/ledger` | search_projects, get_ledger_summary, get_receivables_status | （無寫入） | 7 |
| 無來源（直接開 AI 頁） | search_projects, get_project_summary, list_tasks | propose_create_task, propose_log_note | 8-9 |

**每個情境都保留 `ask_clarification` + `respond` + `decline` 三個控制工具,加上情境工具,總數控制在 7-10 個。**

### 3.3 Realtime 模式的差異

Realtime 模式拿掉 `respond` 和 `decline`（已在 Lab 3c §2 定案），改為直接對話。情境工具子集不變。

### 3.4 切換情境

使用者在 AI 分頁內可以切換情境（語音說「我要看設備」或 UI 按鈕），切換時：

1. 清空當前 session 的 pending（有待確認的提案會被取消並告知使用者）
2. 替換工具清單
3. 更新 system prompt 裡的身分說明（「你現在是設備管理助理」→ 欄位改變）
4. 對話歷史保留（不清 session），但 LLM 工具清單在下一輪切換

---

## 4. 實作路徑

### Phase A — P1 讀取（預估 2-3 天）

新增 Lab 1 端點：
- `search_equipment`：按名稱/案場搜設備,回傳位置和狀態
- `get_today_clockins`：今天的打卡記錄

新增 Lab 2 工具 schema：
- 對應的 `ToolSchema` 加進 `voice-agent-tools.ts`
- `READ_TOOLS` set 加入新工具名

新增情境路由：
- `voice-agent-context.ts`（新檔）：根據 `returnPath` 回傳工具子集
- chat route 讀 session 的來源頁面,傳給情境路由

**驗收**：在 AI 分頁從 `/boss/equipment` 跳過來,問「JBL 喇叭在哪」,能搜到並回答。

### Phase B — P1 寫入（預估 2-3 天）

新增 Lab 1 端點：
- `propose_write` 擴充 action：`log_equipment_move`
- `commitWrite` 擴充：寫入 `equipment_movements` 表

新增 Lab 2 工具 schema：
- `propose_log_equipment_move`：project_id, equipment_id, from_location, to_location, note

Realtime 端同步：
- `voice-realtime.ts` 的 `REALTIME_TOOL_NAMES` 加入新 propose 工具
- `runRealtimeTool` 的 `PROPOSE_ACTION` map 加入對應

**驗收**：語音說「把 JBL 喇叭搬到磐頂教會」→ 確認卡顯示設備名、來源、目的地 → 按確認 → equipment_movements 寫入一筆。

### Phase C — P2 擴充（預估 3-4 天）

- `get_equipment_history`、`get_site_allocation`、`list_worklogs`、`list_recent_expenses`
- `propose_clockin`、`propose_log_expense`
- 對應的 Lab 1 端點和 commitWrite 擴充

### Phase D — P3 彙總讀取（預估 2 天）

- `get_ledger_summary`：呼叫 `summarizeEntries()`，回傳筆數和級距,不回傳個別金額
- `get_receivables_status`：呼叫 `summarizeReceivables()`，回傳待收筆數和總額級距
- `search_catalog`：品項搜尋

---

## 5. system prompt 情境化

每個情境的 system prompt 差異只有一段「你的身分」和「你有的工具」說明,其餘 16 條硬規則不變。

```
// 範例:設備情境
你是聲生音響公司的設備管理助理。
你可以做的事:
- 搜尋設備位置和狀態
- 查看設備異動歷程
- 提出設備搬遷記錄
你不能做的事:報價、帳務、刪除任何記錄。
```

prompt 總行數控制在 50 行以內（Lab 2 實測 39 行是甜蜜點,50 行是上限）。

---

## 6. 安全設計（繼承 + 擴充）

### 6.1 繼承自 Lab 2

- 兩階段確認（propose → server-side whitelist confirm）
- respond 閘門（打字模式）
- safeRecap（UUID 過濾）
- PENDING_PREFIX（「⏳ 還沒寫入」固定字串）
- normalizePayload（opencc 簡→繁 + 空值剝離）
- 確認口令白名單比對（CONFIRM_WORDS / CANCEL_WORDS）

### 6.2 新增

| 新增防護 | 說明 |
|---------|------|
| 金額欄位朗讀遮蔽 | Realtime 模式的 respond 結果如果包含金額（`/\$|NT\$|元|＄/`），system prompt 指示不朗讀,只在逐字稿標註「（金額已省略）」 |
| 設備 ID 不讓 LLM 猜 | 跟 project_id 同規則：必須先 search_equipment 拿到結果才能用,不可以自己塞 |
| 打卡時間由 runtime 解析 | 跟 due_date 同設計：LLM 給自然語言時間描述（如「今天早上九點」），runtime 轉成 ISO timestamp,不讓 LLM 算時間 |

---

## 7. 測試策略

### 7.1 契約測試（Lab 1 端點）

每個新端點加入 `__tests__/voice-tools-contract.test.ts`：
- 正常路徑：回傳正確 schema
- 缺欄位：400 + error_code
- 不存在的 ID：404 + 明確訊息
- 無權限：401

### 7.2 Agent 回歸測試

擴充 `gpt4o-regression.mjs`：
- 新增設備情境案例：「JBL 喇叭在哪」→ 呼叫 search_equipment
- 新增跨情境案例：設備情境下問帳務 → decline (out_of_scope)
- 驗證工具數量沒有超過 10 個

### 7.3 端到端語音測試

擴充 `e2e-voice.mjs`：
- 新增設備搬遷語音案例
- 驗證確認卡欄位正確

---

## 8. 不做的事（scope 外）

| 刻意不做 | 理由 |
|---------|------|
| 全文搜尋所有表 | C1：一個通用搜尋工具會讓 LLM 不知道什麼時候該用、什麼時候不該用 |
| 自動帶入上一次的案場 | 讓使用者明確說,不幫他猜（Lab 2 規則 16 的延伸） |
| 批次操作（一次搬多台設備） | 一筆一確認,先做最安全的版本 |
| 跨表 join 查詢 | 每個工具只查一張表,邊界清楚 |
| 工具動態發現 | 工具清單是靜態配置,不讓 LLM 問「我有什麼工具」 |

---

## 9. 開工清單（Phase A 待 Yen 確認後啟動）

- [ ] 確認 P1 工具清單（search_equipment + get_today_clockins + propose_log_equipment_move）
- [ ] 確認情境路由策略（§3.2 的頁面對照表）
- [ ] 確認金額遮蔽規則（§6.2）
- [ ] 開工
