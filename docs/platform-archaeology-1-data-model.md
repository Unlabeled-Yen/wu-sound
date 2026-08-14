# wu-sound-fde 全平台考古 — 1/3:實際資料模型報告

> 唯讀考古產出,不含任何裁決或修改建議。照交接文件模板第 2.1 節格式。
> 涵蓋:帳務(本輪對話已深度考古)+ 六個平行 agent 考古的模組。
> 產出日期:2026-08-14

---

## ⚠️ 先講一件動搖整份考古基礎的事

**`supabase/schema.sql` 本身是過期的,而且它自己的開頭註解在說謊。**

`schema.sql` 第 1 行寫「反映 phase 1-4 應用後的完整狀態」,但兩個獨立進行的 agent
(報價系統、語音/使用者管理)分別各自發現它其實停在 migration 004~005 附近,
之後的東西大部分沒收進去。缺的清單:

| 缺什麼 | 應該在的地方 | 來源 migration |
|---|---|---|
| `bundle_templates`、`bundle_lines` 兩張完整的表 | 標配套組(完整可用功能) | 006 |
| `catalog_items` 8 個規格欄位(SPL/靈敏度/阻抗/擴散角) | 品項庫 | 007, 008, 011, 012 |
| `quotes.tax_rate`、`quote_lines.section` | 報價單 | 005 |
| `line_user_id`、`line_bind_codes` 表 | LINE 綁定 | 010 |
| `tasks`、`write_proposals` 兩張表 | voice-lab Lab 1 | 009 |
| trigram 搜尋索引 | 案場搜尋 | 016 |

**這代表**:任何人(包括這次負責帳務模組的我自己)如果只看 `schema.sql` 做資料模型
判斷,會漏掉套組、LINE 綁定、voice-lab 三個完整功能的存在。本文件下面的內容,
凡是牽涉到這些模組的部分,一律以 `migrations/*.sql` 疊加後的真實結構為準,
不是 `schema.sql`。

帳務模組的表(`ledger_entries`/`receivables`/`expenses` 等)這次是逐一對照
migrations 核實過的,不受這個問題影響——但這只是運氣好(剛好那個模組被我
直接讀過 migrations),不是 schema.sql 本身可信。

---

## 1. 帳務模組(已於本輪深度考古,詳見 [ledger-master-spec.md](./ledger-master-spec.md))

摘要(完整版見連結文件):`ledger_entries`(核心,單一真相)、`receivables`(約定,
非現金流動)、`receivable_payment_state`(派生 view)、`expenses`(零用金收據流)、
`book_batches`(月結批次)。另有三張建了但零串接的表:`recurring_templates`、
`user_pay_profiles`、`monthly_cost_rates`。

## 2. 報價系統

### `quotes`(報價單主檔)
| 欄位 | 業務意義 |
|---|---|
| `client_name`(必填) | 客戶名稱 |
| `project_name` | 案件名稱,選填 |
| `status`(`draft/sent/won/lost`) | 生命週期,見矛盾清單 B1(無跳轉限制) |
| `need_text` / `ai_rationale` | AI 建議配置的輸入需求描述 / AI 回傳理由 |
| `note` | **DB/API 支援,UI 完全沒有輸入框** |
| `site_id`(migration 013) | 為「報價 vs 實際毛利對照」預留,**完全沒有程式碼讀寫** |
| `tax_rate`(numeric, 預設 0.05) | 該單套用稅率,可調 |

### `quote_lines`(報價單明細)
`catalog_item_id`(選填軟關聯)、`name`/`spec`/`unit`/`unit_price_twd`(**快照**,
不是即時 join)、`is_ai_suggested`、`section`(器材/安裝)、`sort_order`。
`unit_price_twd` 可為 null = 待補價,是「缺價 loud」設計的核心。

### `catalog_items`(品項庫)
`brand`/`name`/`item_type`/`unit`、`cost_price_twd`(內部進價,絕不外流)、
`sell_price_twd`(可 null=待補)、`category`、`note`(**DB/API 支援,UI 無輸入框**)、
`active`。加上 8 個聲學規格欄位(SPL/靈敏度/阻抗/擴散角等,供聲學計算工具用,
**catalog UI 完全沒有寫入介面**,只能直接動 DB)。

### `bundle_templates` / `bundle_lines`(標配套組,**完全不在 schema.sql**)
套組是獨立實體,`bundle_lines` **不存價格**(材料化到報價單時才即時抓
`catalog_items.sell_price_twd`)。套組與報價單的關係是「一次性複製」
(materialize),之後互不影響。

## 3. 設備庫存

### `equipment`
`name`/`brand`/`model_number`/`serial_number`(**無 unique**)、`category`
(13 類 enum)、`quantity`(**同一筆記錄內部數量,不支援部分調度**)、`status`
(`in_storage/on_site/in_repair/retired`)、`current_site_id`。唯一 DB constraint
是「on_site 才可有 site_id」,**完全沒有限制哪個狀態能轉去哪個狀態**。

### `equipment_movements`
純追加稽核紀錄表,`from/to_status`、`from/to_site_id`、`moved_by`。只在
移動/淘汰時寫入,新增設備、單純編輯基本資料不會寫。

## 4. 專案管理與現場

### `sites` / `site_categories`
`sites.category_id`/`customer_name`(v2 欄位)**已被報表中心讀取**(依類別/
客戶分組),但 `/api/sites` 的 GET **不回傳這兩欄**,員工端下拉選單看不到。

### `worklogs`(工作記錄)
`user_id`/`site_id`/`logged_on`/`note`/`photos`(前後照片 JSON)/`no_photo_reason`。
**沒有時間欄位、沒有工時欄位**——本質是「施工前後照片+一句話」的現場日誌,
跟工時計算無關。無編輯/刪除入口。

### `clockins`(打卡)
`user_id`/`ts`/`type`(in/out)/`is_backfill`/`backfill_reason`。**沒有
`site_id`**——資料模型上完全不知道打卡時人在哪個案場。無編輯/刪除入口。

### `day_site_allocations`(每日案場歸屬)
`user_id`/`worked_on`/`site_id`/`hours`(**schema 存在,全庫沒有任何寫入路徑
會填這欄**)。可一天多筆代表分攤多案場,但多案場間工時如何分配沒有機制。

## 5. 使用者、權限、LINE、voice-lab

### `users`
`name`(unique,查找鍵,非 ID)、`role`(僅 `boss`/`staff` 兩種)、`pin_hash`
(bcrypt)、`active`、`line_user_id`(**同樣不在 schema.sql**,來自 migration 010)。

### Session 機制
自簽 HMAC-SHA256 cookie,14 天 TTL,**payload 直接內嵌 role,完全 stateless、
不查 DB**——這代表 session 建立後 14 天內,即使老闆事後停用/改權限,舊 session
仍可能繼續有效直到過期或登出。

### LINE 相關表
`line_bind_codes`(6 位數綁定碼,10 分鐘 TTL)——**這張表跟 `line_user_id` 一樣
不在 schema.sql**。

### voice-lab 相關表(migration 009,**同樣不在 schema.sql**)
`tasks`、`write_proposals`——語音 agent 確認後才會寫入的結構化資料,是獨立於
`expenses`/`worklogs`/`clockins` 的第三條資料線,目前未與既有帳務/工時系統整合。

## 6. 聲學計算工具

**無自己的資料表,純前端計算,輸出不落地。** 唯一資料庫接觸點是讀取
`catalog_items` 的聲學規格欄位(單向:品項庫 → 計算器輸入,無回寫路徑)。

## 7. 標案監測

**這個模組在 wu-sound-fde 這個 repo 裡沒有自己的資料庫表——不是遺漏,是架構
設計:資料即時從外部服務「tender-radar」(獨立系統,不在此 repo)抓取**,
透過 `TENDER_RADAR_API_URL`/`TENDER_RADAR_API_TOKEN` 兩個環境變數呼叫,
`cache: 'no-store'`,無任何本地落地或快取。
