# 帳務系統權威規格書(Master Spec)

> 這是帳務系統業務規則的**唯一權威來源**。與這份文件衝突的程式碼、舊 spec 文件、
> 記憶片段,一律以這份為準。修改業務規則時,先改這份文件再改程式碼——順序不可顛倒。
>
> 文件擁有者:Yen(業務規則的最終裁決者,不是工程判斷)
> 最後更新:2026-08-14(涵蓋 migration 014/015 + batch2b 修正後的現況)
> 取代地位:本文件之前,帳務規則散落在 [ledger-v2-spec-v1.md](./ledger-v2-spec-v1.md)、
> [ledger-v3-spec-v1.md](./ledger-v3-spec-v1.md)、[ledger-v3-batch2b-spec-v1.md](./ledger-v3-batch2b-spec-v1.md)
> 三份文件加程式碼註解裡。那三份**不刪除**,留作歷史脈絡(裡面記錄了「為什麼」),
> 但當它們跟這份文件描述不一致時,以這份為準。

---

## 0. 系統背景

- **系統名稱**:聲生工作系統(wu-sound-fde)帳務模組
- **服務對象**:音響工程公司,1 老闆 + 3-5 員工
- **技術棧**:Next.js(App Router)+ Supabase(Postgres)+ Vercel 部署
- **目前狀態**:**已上線,有真實資料**。老闆每月實際用它結算員工代墊、記帳。
  這件事決定了本文件第 4 節「重建 vs 修補」的答案:**修補,不重建**。任何改動
  都要考慮既有資料的遷移路徑,不能假設可以從零開始。
- **已知的結構性債務**(詳見第 5 節):
  - 零用金月結流程是「整月彙總成一筆」,不是逐筆收據入帳,案場級別的細節在入帳
    那一刻消失
  - `receivables`(約定)與 `ledger_entries`(實際金流)分兩張表,兩者用
    `receivable_id` 手動掛勾,不是自動核對

---

## 1. 實體定義

### 1.1 `ledger_entries` — 帳目(核心表,單一真相)

一筆帳目代表一筆**已經發生的現金流動**(或曾經是,voided 除外)。這是全系統
唯一記錄「錢動了」的地方——`expenses`、`receivables` 都是輔助表,最終都要落到
這裡才算真的入帳。

| 欄位 | 業務意義 |
|---|---|
| `occurred_on` | 這筆錢動的日期(不是輸入日期) |
| `direction` | `income`(收入)/ `expense`(支出) |
| `kind` | 15 種細分類別之一(見 1.1.1),`credit_card` 已退役 |
| `journal` | 5 本帳簿之一(見 1.1.2),v3 新增,**與 kind 一對一對應,不可能不一致** |
| `amount_twd` | 金額,整數元,必須 > 0 |
| `fee_twd` | 轉帳手續費,獨立於 `amount_twd`,**是真的從戶頭出去的錢** |
| `payment_method` | 選填:轉帳/現金/信用卡/支票(v3 新增,取代舊的 `credit_card` kind) |
| `party` | 對象(客戶/廠商/員工),自由文字 |
| `site_id` / `site_distribution` | 掛哪個案場;`site_distribution` 是 `{site_id: 百分比}` 的 JSON,理論上支援多案分攤,**目前 UI 只會寫入單案 100%** |
| `is_external` / `invoice_status` / `invoice_no` / `invoice_date` / `tax_amount_twd` | 外帳/發票相關,只有 `is_external=true` 才可能有稅額 |
| `receivable_id` | 選填,指向 `receivables` 表,表示這筆帳是在清償某個應收/應付約定 |
| `status` | **舊欄位**:`active` / `voided`。仍在使用中,尚未退役 |
| `state` | **新欄位(v3)**:`draft` / `posted` / `voided`。**目前系統裡所有既有分錄都是 `posted`**,`draft` 狀態的分錄還沒有任何寫入路徑會產生(收據管線暫緩,見 5.1) |
| `to_check` | AI 抽取信心不足,或人工標記「當時不確定」,需要回頭確認 |
| `voided_reason` | 作廢原因,voided 時必填 |
| `source_batch_id` | 若這筆是月結匯入產生的彙總帳目,指向 `book_batches` |
| `recurring_template_id` | 定期帳範本用,**schema 存在但沒有任何寫入路徑**(UI 未實作,見 5.2) |

#### 1.1.1 `kind`(15 種,`credit_card` 退役中)

```
收入(INCOME_KINDS):project(案件收款) loan(借款/資本) other_income(其他收入)
支出(EXPENSE_KINDS):salary(薪資) bonus(獎金) reimbursement(代墊/零用金)
  goods(貨款/採購) vehicle(車輛) rent(租金) utility(水電) tax(稅金)
  investment(投資) health(健檢) other_expense(其他支出)
  ~~credit_card(信用卡)~~ ← 已退役,新分錄不再使用,舊資料仍可能存在
```

`direction` 由 `kind` 唯一決定(`INCOME_KINDS`/`EXPENSE_KINDS` 互斥且完備),
不是獨立欄位選項——選了類別,方向就定了。實作在 `lib/types.ts` 的
`directionOfKind()`,測試釘在 `lib/__tests__/ledger-journal-map.test.ts`。

#### 1.1.2 `journal`(5 本帳簿,v3 新增)

```
customer(客戶) — project, other_income               ← 全部收入
vendor(廠商)   — goods, vehicle, rent, utility, tax,
                  other_expense                        ← 全部支出
pettycash(零用金) — reimbursement                      ← 全部支出
payroll(薪資)  — salary, bonus                         ← 全部支出
personal(老闆個人) — loan, investment, health          ← 收支混合
```

`kind → journal` 的對應表是 `KIND_TO_JOURNAL`(`lib/types.ts`),**窮舉關係由
測試釘住**——新增 kind 忘了配帳簿,測試會炸,不會等到正式站 API 回 400 才發現。

### 1.2 `receivables` — 應收應付約定

代表「有人欠我錢」或「我欠人錢」的**承諾**,本身不是現金流動。

| 欄位 | 業務意義 |
|---|---|
| `direction` | `receivable`(應收)/ `payable`(應付) |
| `party` / `site_id` | 對象、掛哪個案場(選填) |
| `total_amount_twd` | 約定總額 |
| `status` | `open`(未結)/ `closed`(已結清)/ `voided`(已作廢) |

**未結金額不存在這張表裡,是派生出來的**——`receivable_payment_state`(見 1.3)
即時算出 `settled_twd`(已有多少筆 `ledger_entries.receivable_id` 指過來)、
`remaining_twd = total - settled`、`overpaid`(settled > total)。

**為什麼不把這張表併進 `ledger_entries`**:曾經考慮過用「一筆帶 `expected_twd`
的分錄」代表約定,但這樣約定金額會被現有的收支加總邏輯誤當成真實現金流入
(雙重計入)。兩者分開是刻意的設計決定,不是技術債。

### 1.3 `receivable_payment_state`(DB view,非資料表)

`receivables` 加上派生欄位的唯讀視圖,對 `ledger_entries` 做 `left join` 算出
`settled_twd`/`remaining_twd`/`overpaid`。**「未結金額怎麼算」全系統只有這一個
實作**——應用層(`web/lib/receivables-query.ts` 的 `summarizeReceivables()`)
不再自己 reduce。

### 1.4 `expenses` — 零用金代墊(收據流)

員工拍收據 → AI 辨識 → 老闆審核,**通過審核後不會立刻進 `ledger_entries`**,
要等月結鎖定 + 老闆手動按「匯入」才會變成**一筆彙總帳目**(見 3.3、5.1)。

| 欄位 | 業務意義 |
|---|---|
| `status` | `draft` → `submitted` → `confirmed`/`rejected` → `booked` |
| `ai_draft` | AI 抽取結果的 JSON,含 `confidence: 'low'/'high'` 等 |
| `booked_batch_id` | 月結鎖定後指向 `book_batches` |
| `site_id` | 這筆代墊掛哪個案場——**月結彙總時這個資訊會消失**,彙總帳目不記案場 |

### 1.5 `book_batches` — 薪資結算批次

每個月最多一個(`month` 欄位 unique)。存在即代表「這個月已鎖定」。
`totals` 是鎖定當下算出的 `{user_id: {name, total, count}}` 快照。

### 1.6 未實作的表(schema 存在,UI 無寫入路徑)

| 表 | 用途 | 狀態 |
|---|---|---|
| `recurring_templates` | 定期帳範本(房租等每月自動產生草稿) | schema 建了,UI 沒做,`ledger_entries.recurring_template_id` 恆為 null |
| `user_pay_profiles` | 每人月薪設定(生效日期制) | schema 建了,等老闆提供薪資結構才會用到 |
| `monthly_cost_rates` | 月結凍結快照(工時↔薪資鎖定) | schema 建了,同上 |
| `day_site_allocations` | 每日案場歸屬 | **已實作且有 UI**(`/boss/clockins`),但**報表/看板完全沒有讀取這張表**——人力成本沒有進任何損益計算 |

---

## 2. 狀態機

### 2.1 `ledger_entries.state`(v3 權威狀態欄位)

```
draft ──(目前無路徑產生)──> posted ──(作廢)──> voided
```

- 目前系統裡**所有既有分錄都是 `posted`**(手動輸入直接落地,不經過 draft)
- `voided` 是終態,沒有「取消作廢」的動作
- **`status` 欄位(舊)必須與 `state` 同步**,這是 2026-08-14 修過的一個 bug
  (`voidEntry` 曾經只更新 `status`,詳見第 6 節業務規則 R1)

### 2.2 `receivables.status`

```
open ──(結清)──> closed
open ──(作廢)──> voided
closed ──(重新開啟)──> open
```

未結金額(`remaining_twd`)由累積的 `ledger_entries.receivable_id` 掛帳決定,
不是手動設的。老闆按「結清」是**人工判斷「差不多了」**,不是系統自動判定
`remaining_twd = 0` 才允許結清——允許在有殘值時手動結清(容忍小額尾差)。

### 2.3 `expenses.status`

```
draft ──(員工送出)──> submitted ──(老闆確認)──> confirmed ──(月結鎖定)──> booked
                    └──(老闆退回)──> rejected
```

`rejected` 是終態,員工要重新拍照走新的一筆(沒有「重新提交同一筆」的路徑)。
`booked` 後不可逆——鎖定的月份不可再改金額,只能補備註(`BATCH_LOCKED_FIELDS`)。

### 2.4 `invoice_status`(掛在 `ledger_entries` 上,非獨立實體)

```
none ──(標記待開)──> to_issue ──(填發票號+日期)──> issued
```

只有 `is_external=true` 的帳目才可能有 `to_issue`/`issued`。

---

## 3. 業務規則清單(可驗證)

每條規則標明**驗證方式**——能寫成自動化測試的已經寫了,不能的標「人工」。

### 3.1 金額計算

- **R-AMT1**:淨額 = 收入合計 − 支出合計 − 手續費合計。手續費**必扣**,不可回退成
  只扣收支不扣手續費。驗證:`lib/__tests__/ledger-summary.test.ts`
- **R-AMT2**:金額一律整數元,不用浮點數;稅額只在 `is_external=true` 時可非零
  (資料庫 constraint `tax_only_when_external` 強制)
- **R-AMT3**:未結金額對負值(超收/超付)取 0,不倒扣「在手應收/應付」總額;
  超收超付另計 `overpaidCount`,UI 必須顯示、不可吞掉。驗證:
  `lib/__tests__/receivables-summary.test.ts`
- **R-AMT4**:只有 `status='open'` 的約定計入在手應收/應付合計

### 3.2 帳簿與類別

- **R-KIND1**:`direction` 由 `kind` 唯一決定,`INCOME_KINDS ∩ EXPENSE_KINDS = ∅`
  且兩者聯集 = 全部現行 kind。驗證:`lib/__tests__/ledger-journal-map.test.ts`
- **R-KIND2**:每個現行 `kind` 必須能查到對應的 `journal`,查不到就是資料異常,
  API 層 loud 擋下(`KIND_TO_JOURNAL[kind]` 為 undefined 時回 400,不猜測)。
  驗證:同上測試檔
- **R-KIND3**:`credit_card` 不再是可選類別,只作為 `payment_method` 存在。
  舊資料若仍是 `kind='credit_card'`,由 migration 014 一次性拆成
  `kind='other_expense'` + `payment_method='credit_card'` + `to_check=true`

### 3.3 月結與零用金

- **R-CLOSE1**:當月只要有任何 `expenses.status in ('draft','submitted')`,
  不可鎖定該月。驗證:人工(`/api/boss/close` 的 pendingCount 檢查)
- **R-CLOSE2**:鎖定後的月份,對應 `expenses`/`ledger_entries` 只能補備註,
  不可改金額/日期/方向/類別/對象/內外帳
- **R-CLOSE3**:「從薪資結算匯入零用金」是**人工按鈕觸發**,不會自動執行——
  鎖定月份與匯入進帳是兩個分開的動作,中間允許老闆檢查
- **R-CLOSE4**:同一個 `book_batches` 對同一個人只會產生一筆彙總 `ledger_entries`
  (`ledger_batch_party_uidx` unique index 擋重複匯入)

### 3.4 作廢與可追溯

- **R-VOID1**:作廢時 `status` 與 `state` 必須同步設為 `voided`,只改一個是 bug
  (2026-08-14 修過,詳見第 6 節)。驗證:人工 + `supabase/checks/ledger-v3-invariants.sql` 的 I2b
- **R-VOID2**:作廢必須填原因(至少 2 字),寫入 `audit_log`
- **R-VOID3**:所有建立/修改/作廢動作都要寫 `audit_log`,含 before/after diff

### 3.5 顯示與可信度(缺就 loud)

- **R-UI1**:查詢失敗時不可顯示 `$0` 或空清單——那會讓「查不到」偽裝成
  「沒有資料」,兩者是完全不同的事實。驗證:人工(逐頁走查)
- **R-UI2**:任何顯示金額的地方,標籤必須說清楚口徑(是否扣手續費、是否含人力
  成本、是否套用篩選)
- **R-UI3**:同一個業務事實(例:待審零用金筆數)在不同頁面必須顯示同一個數字,
  用共用函式(`lib/ledger-summary.ts`、`lib/receivables-query.ts`)保證一致,
  不是靠人工比對

---

## 4. 重建 vs 修補評估

| 評估項 | 結論 |
|---|---|
| 系統狀態 | 已上線、有真實資料、老闆每月依賴它結算薪資 |
| 資料遷移風險 | 非零——任何 schema 改動都要先在本機/staging 用代表性資料驗證過才套正式站 |
| 結論 | **修補,不重建**。所有改動走「新增欄位/表 → 遷移既有資料 → 切換讀取 → 確認一段時間後才清理舊路徑」的漸進路線,不允許「重寫後整批替換」 |

這個結論已經體現在 v3 的分批設計裡(批 0 止血 → 批 1 資料地基 → 批 2 UI →
批 3 才清理),不是新決定,是把既有做法寫成明文。

---

## 5. 已知的結構性缺口(不是 bug,是明確記錄的未完成)

### 5.1 收據→分錄管線(暫緩)

**現況**:零用金審核通過後不會立刻產生 `ledger_entries`,要等月結鎖定 + 人工按
「匯入」,而且匯入時**依人彙總成一筆**,案場、單筆金額、收據影像的關聯全部消失。

**暫緩原因**:要做「審核通過即產生 `state='draft'` 分錄」,必須先讓所有讀取
`ledger_entries` 的查詢統一排除 `state='draft'`(否則草稿分錄會被舊查詢當成
`status='active'` 提早計入合計,月結時又被彙總邏輯算第二次)。這是橫跨多個
檔案的一致性要求,且必須在能連上真實資料庫驗證的環境下做,目前尚未執行。

**現行替代路徑**(`ImportBatchDialog`)**保留,不視為技術債待清除**——它是
老闆目前唯一的月結入帳方式,取代路徑就緒且經過一個月結週期的平行對照驗證後
才會退役這條舊路。

### 5.2 定期帳範本未實作

`recurring_templates` 表存在,`ledger_entries.recurring_template_id` 外鍵存在,
但沒有任何 UI 或 API 會寫入這兩者。房租等定期支出目前每月手動輸入。

### 5.3 人力成本沒有進任何損益計算

`day_site_allocations`(每日案場歸屬,已有 UI)存在,但報表中心、帳簿看板、
案場損益(若存在的話)都**沒有讀取這張表**。等於現在系統裡「這個案子賺多少」
只算材料/貨款等直接成本,不含人力——這是 [ledger-v2-spec-v1.md](./ledger-v2-spec-v1.md)
規劃的「第二批」,卡在等老闆提供每人月薪結構。

### 5.4 `site_distribution` 目前只會是單案 100%

欄位設計支援一筆帳目分攤給多個案場(JSON 存百分比),但目前所有寫入路徑
(表單、API)都只會寫入單一案場 100%。多案分攤是預留欄位,不是能用的功能。

---

## 6. 變更歷史(重大規則修正記錄)

| 日期 | 修正 | 原因 |
|---|---|---|
| 2026-08-14 | 淨額計算改為扣除手續費 | 手續費是真實現金流出,不扣會讓淨額虛高 |
| 2026-08-14 | migration 014:新增 `state`/`to_check`/`journal`/`payment_method`/`site_distribution`,`credit_card` 拆分 | 見 [ledger-v3-spec-v1.md](./ledger-v3-spec-v1.md) |
| 2026-08-14 | 修正 `voidEntry`(`web/app/boss/ledger/actions.ts`)漏同步 `state` 的 bug | 作廢的收款分錄若 `state` 未同步,`receivable_payment_state` 會誤把它算進已結清金額,應收未結金額偏低 |
| 2026-08-14 | 刪除 `actions.ts` 裡四個無人呼叫的 export(`createEntry`/`updateEntry`/`importBatch`/`voidEntryForm`) | 與 schema 脫節的死碼(缺 `journal` 欄位),留著是下次改錯地方的風險來源 |
| 2026-08-14 | `/boss/ledger` 拆分為看板頁(`/boss/ledger`)與明細頁(`/boss/ledger/entries`) | 原本兩者疊在同一頁,篩選套用後摘要卡數字與表格不一致 |

---

## 7. 給下一個接手 session 的話

1. **先讀這份文件,不要重新從程式碼逆向工程業務規則**——除非發現這份文件跟
   程式碼實際行為不一致,那種情況下**回報使用者,不要自行判斷哪個對**。
2. **修規則先改這份文件**。改完程式碼發現規則需要調整,回來更新第 3 節,
   不要讓文件跟現實再度漂移。
3. **第 5 節的缺口是已知的,不是待發現的驚喜**。不要重新「發現」收據管線沒做
   然後又花一輪去分析為什麼——原因已經寫在 5.1。
4. **任何 DB migration 一律先在本機 Docker + supabase CLI 或 staging 用代表性
   資料驗證過**,不直接套正式站。這是本專案的硬性規矩,不是建議。
