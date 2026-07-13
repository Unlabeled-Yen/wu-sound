# Phase 4 規格 v1 — 內帳(2026-07-13)

## 為什麼

雇主原話 Q13:

> 「通常是 2-3 天記一次,但有時候忙到爛掉就是一週以上,通常一週以上帳都會亂掉超難救。」

記帳樣本(2026.7)證據:
- 「舒韶代墊 4983」與明細加總「總共 4938」對不上(見 boss-onepager)
- 「不知道為什麼有多的 21,014」孤行
- 兩處 `#REF!`(總收入、目前餘額)
- 收入/支出/發票狀態/稅額散在同一張表的自由文字欄位

雇主原話 Q12:「內帳就是我們所有的收入跟支出,外帳就是有開發票出去以及可以打統編報帳到營業稅的項目。」

## 範圍

**做**
- 一筆錢 = 一行,結構化欄位(收入/支出、金額、對象、日期、內外帳、發票狀態、稅額、備註)
- 老闆:新增、編輯、作廢(軟刪);月視圖含每日運行餘額與內外帳小計
- **從月結匯入零用金**:雇主按鈕觸發,把已鎖的 book_batches 每人合計自動化為一筆代墊支出(對應他現行 Excel「舒韶代墊 4983」的一行),連結 `book_batches.id` 避免重複匯入
- 5% 營業稅額自動建議(可覆蓋),`round(amount / 21)`
- 外帳 CSV 匯出(給會計師,每兩個月一份)

**不做(v1 之外)**
- 銀行/帳戶多本追蹤(他 Excel 有「帳戶 · 上月結餘」但先簡化為單一總表)
- 分期付款自動排程(如「貨車牌照稅(已分期)」)
- 定期性帳目自動記(月租、辦公室租金)
- 對客戶端 CRM 或案件狀態串接(那是 Phase 3 報價的責任)

## 資料模型

### `ledger_entries`
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| occurred_on | date not null | 帳目發生日 |
| direction | ledger_direction enum | income / expense |
| kind | ledger_kind enum | 見下 |
| amount_twd | integer not null | 金額(元,含稅) |
| party | text | 客戶/廠商/員工名;可空(如「辦公室租金」) |
| memo | text | 備註,如「6/22 加油 1318」 |
| is_external | boolean not null default false | 是否列外帳 |
| invoice_status | invoice_status enum | none / to_issue / issued |
| invoice_no | text nullable | 發票號 |
| invoice_date | date nullable | 開票日 |
| tax_amount_twd | integer not null default 0 | 5% 營業稅額;`is_external=false` 強制 0 |
| status | ledger_status enum | active / voided |
| voided_reason | text nullable | |
| source_batch_id | uuid nullable fk → book_batches | 若由月結匯入自動建立則指到 batch |
| created_by | uuid not null fk → users | |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

**Check constraints**:
- `amount_twd > 0`(direction 表示方向,金額一律正)
- `is_external = false ⇒ tax_amount_twd = 0`
- `invoice_status = 'issued' ⇒ is_external = true`
- 每個 `source_batch_id` 每個 party 只能出現一次(防止重複匯入):部分唯一索引 `(source_batch_id, party) where source_batch_id is not null`

### enums

```
ledger_direction: 'income' | 'expense'
ledger_kind:
  income:  'project'(案件收款)| 'loan'(借款/資本)| 'other_income'
  expense: 'salary'(薪資)| 'bonus'(獎金)| 'reimbursement'(代墊/零用金)|
           'goods'(貨款/設備採購)| 'vehicle'(車輛)| 'rent'(租金)|
           'utility'(水電)| 'credit_card'(信用卡)| 'tax'(稅金)|
           'investment'(投資)| 'health'(健檢)| 'other_expense'
invoice_status: 'none' | 'to_issue' | 'issued'
ledger_status: 'active' | 'voided'
```

### RLS
沿用專案模式,anon 全拒,server 走 service_role。所有寫入必寫 `audit_log`。

## API

| Route | 誰 | 動作 |
|---|---|---|
| `GET /api/ledger?month=YYYY-MM&direction=&kind=&is_external=&status=` | boss | 列表 |
| `POST /api/ledger` | boss | 新增 |
| `PATCH /api/ledger/[id]` | boss | 編輯 |
| `POST /api/ledger/[id]/void` | boss | 作廢(狀態 → voided + 記錄 reason) |
| `POST /api/ledger/import-batch` | boss | body `{batch_id}` → 為每個員工建一筆 `direction=expense, kind=reimbursement, party=員工姓名, memo="X月零用金月結"` 支出,`source_batch_id=batch_id` |
| `GET /api/ledger/external.csv?from=&to=` | boss | 外帳 CSV(僅 `is_external=true and status=active`) |

**驗證(server 強制)**
- amount_twd 正整數;is_external=false ⇒ tax=0(自動歸零);issued ⇒ is_external 強制 true 並要求 invoice_date
- import-batch:batch 必須 `status=booked`(即已鎖);每個 party 若已存在同 batch 的紀錄(部分唯一索引),回 409 + 明確 error;結果回 `{created:number, skipped:number}`

## UI

### `/boss/ledger`(主頁,月視圖)
- 頂部:月份選擇(default 當月)+ 三個 filter chip:全部 / 內帳 / 外帳
- 摘要卡:當月收入合計、支出合計、淨額、外帳收入合計、外帳稅額合計
- 表格:日期 / 方向(收↑ 支↓ 圖標)/ 類別 / 對象 / 金額(千分位)/ 內外帳 pill / 發票 pill / 備註 / 動作(編輯 / 作廢)
- 底部:三個按鈕:「新增一筆」、「從月結匯入零用金」、「匯出外帳 CSV」
- 顯示規則:voided rows 灰色刪除線;source_batch_id 有值時顯示「零用金月結」badge 不可編輯金額(但可補備註)

### `/boss/ledger/new` (Modal 或獨立頁)
- 表單欄位:日期(default 今天)、direction radio、kind select(依 direction 變動選項)、amount、party、memo、is_external toggle、invoice_status radio(none 預設)、invoice_no、invoice_date、tax(勾選 is_external 時自動填 `round(amount/21)`,可覆蓋)
- Loud validation:所有 check constraint 都在 client 先阻斷、server 二道保險

### 「從月結匯入零用金」
- 開 dialog:選 book_batch(下拉,列出所有 `status=booked` 且尚未被此帳本匯入完的 batch)
- 送出後回報「已新增 N 筆」或「N 筆重複略過」;若匯入成功導回 `/boss/ledger?month=<該 batch 月份>`

## 憲章對齊

- **無靜默失效**:一切驗證失敗都 loud 顯錯;`#REF!` 這種計算漏洞由 DB check + 應用層雙保險
- **DB 算總數**:摘要卡的合計走 SQL SUM,不由前端 JS 加;稅額由後端計算
- **Deterministic 主軌**:整個內帳流程零 AI,是 Yen 的憲章
- **可追溯**:所有變更寫 audit_log;source_batch_id 讓月結匯入可對回原始收據

## 未決事項(不擋開工,v1.5 再決)

- 內帳的「上月結餘」是否要儲存為特殊 entry(kind=other_income/other_expense)還是計算派生?v1 先計算派生
- 是否要多帳戶(現金 / 銀行 / 信用卡 之類)?他 Excel 表頭有「帳戶」但實際只用一本。v1 單本
- 是否要「預計對帳金額」欄位(貨到但發票未來)?先塞到 memo,v1.5 觀察需求再獨立欄
