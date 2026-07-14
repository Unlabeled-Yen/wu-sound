# Phase 3 規格 v1 — 報價 + AI 選設備入口(2026-07-14)

## 為什麼

雇主原話 Q3:
> 「懶得報價覺得很麻煩哈哈哈哈哈哈哈哈哈。快則一天,慢則兩週。卡時間的是規劃設計、選用設備、如何解決客戶需求。」

痛點**不在填 Excel**,在**選設備**。所以 AI 的職責是「幫你想要用哪些設備、各幾個」,不是自動填報價單。

## 核心設計(對齊憲章)

- **AI 只選品項與數量,永遠不出價。** 價格 100% 來自品項庫(deterministic)。
- **缺價 loud**:AI 建議的品項若品項庫沒設售價,報價單那行明確標「待設定售價」,總額算不完、不可送出。這把資料債(114 項只有 6 項有價)變成**邊用邊補**,而不是動工前的苦工。
- **AI 出草稿,人逐行確認**:每一行都能改品項、改數量、改價、刪除、手動加行。
- **金額與總額由 DB 算**,不由前端或 AI 加。
- 報價流程零「AI 出數字」的信任風險。

## 資料模型

### `catalog_items`(品項庫,種子來自價目進價表.xlsx 114 項)
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| brand | text | 品牌(CODA/YAMAHA…),可空 |
| name | text not null | 型號/品名(HOPS8i…) |
| item_type | text | 類型(喇叭/超低音/擴大機/線材…,他的 xlsx 原欄) |
| unit | text default '式' | 顆/台/座/支/式 |
| cost_price_twd | integer nullable | 進價(多為 null,老闆補) |
| sell_price_twd | integer nullable | 售價(多為 null,老闆補) |
| category | text | 分類(音響系統/電源系統/線材…,保留他 xlsx 原字) |
| note | text | 附註 |
| active | boolean default true | |

### `quotes`(報價單)
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| client_name | text not null | 客戶(對齊他「一客戶一活頁簿」心智模型) |
| project_name | text | 案件名(一案一工作表) |
| status | quote_status enum | draft / sent / won / lost |
| need_text | text | 老闆輸入的原始需求口述(AI 的輸入) |
| ai_rationale | text | AI 建議的理由(供老闆參考,非帳務) |
| note | text | |
| created_by | uuid fk users | |
| created_at, updated_at | timestamptz | |

### `quote_lines`(報價明細)
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| quote_id | uuid fk quotes on delete cascade | |
| catalog_item_id | uuid nullable fk catalog_items | 連到品項庫(可空=手動加的自由行) |
| name | text not null | 快照品名(即使品項庫改名,報價單不變) |
| spec | text | 規格 |
| qty | integer not null default 1 check qty>0 | |
| unit | text | |
| unit_price_twd | integer nullable | 單價;null=待設定售價(loud) |
| is_ai_suggested | boolean default false | 這行是不是 AI 建議的(UI 標示) |
| sort_order | integer default 0 | |

**enum**:`quote_status: 'draft' | 'sent' | 'won' | 'lost'`

小計 = qty × unit_price_twd(DB 或前端顯示時算,單一來源);報價總額 = 各行小計加總。**任何一行 unit_price 為 null → 總額顯示「尚有 N 項待設定售價」,不出總數。**

## API

| Route | 誰 | 動作 |
|---|---|---|
| `GET /api/catalog?q=&category=&type=` | boss | 品項庫查詢 |
| `PATCH /api/catalog/[id]` | boss | 改價(cost/sell)、改欄位 |
| `POST /api/catalog` | boss | 新增品項 |
| `GET /api/quotes` | boss | 報價單列表 |
| `POST /api/quotes` | boss | 建報價單(client/project) |
| `GET /api/quotes/[id]` | boss | 單張(含 lines) |
| `PATCH /api/quotes/[id]` | boss | 改 client/project/status/note |
| `POST /api/quotes/[id]/suggest` | boss | body `{need_text}` → AI 建議 lines(草稿,寫入 quote_lines + ai_rationale) |
| `POST /api/quotes/[id]/lines` | boss | 手動加/改/刪行 |
| `GET /api/quotes/[id]/export.csv` | boss | 匯出(對齊 SSA報價單母版:序列/名稱/規格/數量/單位/單價/小計) |

## AI 建議引擎(`lib/ai-quote.ts`)

- 輸入:`need_text`(老闆口述/打字)+ 品項庫清單(name/brand/type/category,**不含價格,避免 AI 碰錢**)
- 用 Kimi 文字模型(`kimi-k2.6`,不需 vision),或 env `AI_QUOTE_MODEL` 覆蓋
- 輸出嚴格 JSON:`{ lines: [{catalog_name, qty, spec?, reason}], rationale }`
- 後端把 `catalog_name` 對回品項庫拿 id + 帶入 sell_price(有就填、沒有就 null loud);對不到的品項 → 建一個自由行(catalog_item_id=null)並標 AI 建議
- 失敗一律回錯誤訊息,不靜默;AI 完全不決定價格

## UI(老闆桌面)

- `/boss/catalog` — 品項庫表:品牌/品名/類型/單位/進價/售價(inline 可編)/分類。缺售價的 row 用琥珀標示。頂部搜尋 + 分類 filter + 新增品項。
- `/boss/quotes` — 報價單列表(客戶/案件/狀態/總額或「N 項待補價」/日期)。
- `/boss/quotes/new` — 建單:填客戶+案件 → 進編輯頁。
- `/boss/quotes/[id]` — 編輯:
  - 上方:客戶/案件/狀態
  - **AI 入口**:大 textarea「用一句話描述這個案子的需求」+「請 AI 建議設備」按鈕 →(可選)語音輸入用瀏覽器 Web Speech API,不加伺服器成本
  - 明細表:每行品名/規格/數量/單位/單價/小計 + 刪除;AI 建議行有標記;可「從品項庫加一項」或「手動加自由行」
  - 缺價的行紅/琥珀標「待設定售價」,可就地連到品項庫補價
  - 總額區:全部有價才顯示總數,否則顯示「尚有 N 項待設定售價」
  - 匯出 CSV / 列印

## 不做(v1 之外)

- 語音轉文字的伺服器端(v1 用瀏覽器 Web Speech API 或直接打字;要更準再接 Whisper)
- 市場動態價自動更新(他 Q4 說靠代理商通知;v1 手動改品項庫)
- 報價版本歷史 diff(先靠 status + 另存新單)
- 自動折扣規則(他習慣在報價單下方手加折扣欄;v1 用一個自由行當折扣)

## 種子

`supabase/seeds/003_catalog.sql`(114 項,已生成)。
