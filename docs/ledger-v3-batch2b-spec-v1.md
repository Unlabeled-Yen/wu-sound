# 帳務 v3 批 2b 規格 v1 — 一致性修正與結構收斂(2026-08-14)

狀態:**待執行**。本文由完整程式碼審查產出,可獨立執行,不需要產出時的對話脈絡。

定位:批 2 把帳簿看板做出來了,但看板是「疊」在舊頁面上,而非取代它;同時審查發現
數個金額顯示不一致與一條**現正生效的靜默失效**。本批修正這些,並把頁面結構收斂到
[ledger-v3-spec-v1.md](./ledger-v3-spec-v1.md) 原本的設計。

前置狀態(已完成,不需重做):
- migration 014/015 已套用至正式 Supabase 並驗證通過(`journal`/`state`/`to_check`/
  `payment_method`/`site_distribution` 欄位、`receivable_payment_state` view 均已存在)
- 批 0(淨額扣手續費、AI 低信心 badge、`lib/tz.ts`)、批 2(看板、新表單、手機卡片)已上線

---

## 執行原則(給執行者的硬約束)

1. **不新增資料庫 migration**。本批純前端/API 層,schema 不動。
2. **不刪除任何老闆現正在用的功能**。唯一允許移除的是「確認無人呼叫的死碼」(F10),
   且移除前必須用 grep 再驗證一次。
3. **金額口徑一律標示**。任何顯示金額的地方,標籤必須說清楚它含什麼、不含什麼。
4. **查詢失敗一律 loud**。錯誤發生時不得同時顯示 `$0` 或空清單——那會讓「查不到」
   偽裝成「沒有資料」。既有正確範例見 `web/app/boss/ledger/JournalDashboard.tsx`
   的 `queryError` 早退處理,照抄該模式。
5. 每完成一個編號項目就跑一次 `npx tsc --noEmit`,全部做完再跑 `npm run build`。

---

## P0 · 現在就在算錯錢

### F1 · 作廢帳目沒有同步 `state`,導致未結金額算少(最嚴重)

**檔案**:`web/app/boss/ledger/actions.ts`(`voidEntry`)、`web/app/boss/ledger/VoidDialog.tsx`

**現況**:專案有**兩條作廢路徑**——
- `web/app/api/ledger/[id]/void/route.ts`:已正確同步 `status` 與 `state`
- `web/app/boss/ledger/actions.ts` 的 `voidEntry` server action:**只更新 `status`,沒更新 `state`**

而 `VoidDialog.tsx` 實際呼叫的是後者(`import { voidEntry } from './actions'`)。所以
UI 上按「作廢」時,`state` 仍停在 `'posted'`。

**造成的錯誤**:`receivable_payment_state` view 的已結金額是
`where receivable_id is not null and state <> 'voided'` 聚合出來的。一筆已被作廢的
收款帳目,因為 `state` 沒同步,**仍被算成已結**——應收未結金額因此少算,老闆會以為
錢收到了。`JournalDashboard` 的 `to_check`/`to_issue` 計數同樣受影響(都用 `.neq('state','voided')`)。

**改成**:`voidEntry` 的 update 改為
```ts
.update({ status: 'voided', state: 'voided', voided_reason: r })
```
並在該行上方加註解說明兩欄必須同步的理由(`state` 是 view 與不變量檢查依賴的權威欄位)。

**驗收**:作廢一筆掛在應收約定上的收款帳目 → 該約定的「未結」金額應立刻增加回該筆金額;
`supabase/checks/ledger-v3-invariants.sql` 的 I2b(state 與 status 一致)回 0 列。

**歷史資料修補**:014 套用後若已有人在 UI 按過作廢,DB 裡會存在 `status='voided'` 但
`state='posted'` 的列。修完程式後,請執行者**先用查詢確認筆數**:
```sql
select count(*) from ledger_entries where (status='voided') <> (state='voided');
```
若 > 0,再執行修補(這是資料更正,執行前告知使用者):
```sql
update ledger_entries set state='voided' where status='voided' and state<>'voided';
```

---

### F2 · 摘要卡不跟篩選走,標籤與內容不符

**檔案**:`web/app/boss/ledger/page.tsx`(合計查詢在 105–110 行附近)

**現況**:合計查詢只套 `month` 與 `status='active'`,**不套** `journal`/`direction`/
`kind`/`site_id`/`filter`(內外帳)。但同一畫面上方會顯示「篩選中:『老闆個人』帳簿」
的綠色橫幅,下方摘要卡卻是全部帳簿的總額。

**改成**:摘要卡與明細表**必須同源**。將合計查詢套上與明細表**完全相同**的篩選條件
(除了 `status`——摘要固定只算 `active`,此行為保留,但需在卡片加註)。

實作建議:把篩選條件抽成一個共用函式,明細查詢與合計查詢都呼叫它,避免日後又漂移。

**改後標籤**:有任何篩選作用時,卡片標題加上範圍字樣,例如「本月收入合計(篩選後)」。
無篩選時維持原標籤。

**驗收**:套用「老闆個人」帳簿篩選 → 摘要卡數字必須等於下方表格金額欄的加總。

---

### F3 · 總覽頁的「本月淨額」沒扣手續費,與帳務頁不一致

**檔案**:`web/app/boss/page.tsx`(`loadStats`)、`web/app/boss/BossMobileDashboard.tsx`

**現況**:`web/app/boss/page.tsx` 的 `net = income - expense`,**沒有扣 `fee_twd`**。
但批 0 已將 `/boss/ledger` 與 `/boss/report` 的淨額改為扣手續費。同一個「本月淨額」
在兩頁顯示不同數字,且總覽頁沒有任何口徑標示。桌機與手機共用同一份 `s.net`,修
`loadStats` 兩邊同時修好。

**改成**:
1. `loadStats` 的 ledger 查詢加選 `fee_twd`,計算 `feeTotal`,`net = income - expense - feeTotal`
2. 桌機 StatCard 標籤改為「本月淨額(已扣手續費)」
3. `BossMobileDashboard.tsx` 的 hero 卡標籤同步改為「本月淨額(已扣手續費)」

**驗收**:總覽頁與 `/boss/ledger` 在同一個月份顯示的淨額數字完全相同。

---

### F4 · 應收應付頁讀取失敗時仍顯示 $0

**檔案**:`web/app/boss/ledger/receivables/page.tsx`(29–30 行附近)

**現況**:`openReceivable`/`openPayable` 由 `rows` 聚合。查詢失敗時 `rows` 為空陣列,
兩張總額卡顯示 `$0`,同時下方顯示紅色錯誤——兩個訊息互相矛盾。

**改成**:`error` 存在時**不渲染**那兩張總額卡,只顯示錯誤區塊(照
`JournalDashboard.tsx` 的 `queryError` 早退模式)。

**驗收**:暫時把 view 名稱改錯製造錯誤 → 畫面只有紅色錯誤,沒有任何 `$0`。改回後恢復正常。

---

## P1 · 連動斷裂與定義不一致

### F5 · 總覽頁月份仍用舊時區算法

**檔案**:`web/app/boss/page.tsx`(7–10 行的 `currentMonth`)

**現況**:仍是 `new Date().getFullYear()`。批 0 已將 `ledger`/`close`/`report`/
`LedgerForm` 統一到 `web/lib/tz.ts`,獨漏此檔。月初交界時總覽與帳務頁會停在不同月份。

**改成**:改用 `taipeiCurrentMonthStr()`(`@/lib/tz`),移除本地 `currentMonth`。

**驗收**:`grep -rn "getUTCFullYear\|new Date().getFullYear" web/app web/lib` 在帳務相關
檔案中無殘留(`lib/tz.ts` 內部實作除外)。

---

### F6 · 零用金待處理:兩處數字定義不同

**檔案**:`web/app/boss/ledger/JournalDashboard.tsx`(零用金卡)

**現況**:
- 總覽頁「待審零用金」= `status='submitted'` 的筆數(例:1)
- 帳簿看板零用金卡 = `submitted + draft`(例:8)

兩個都不算錯,但老闆會看到同一件事有兩個數字。

**改成**:以總覽頁的定義為準(主數字 = 待老闆審核的 `submitted` 筆數)。
`draft`(員工尚未送出)降為次要說明行,不計入主數字。

改後零用金卡:
- 主數字:`{submitted} 筆`
- 次行:`待你審核` / `另 {draft} 筆員工尚未送出`(draft 為 0 時不顯示該行)
- 兩者皆為 0 時:主數字 `0 筆`、次行「沒有待處理項目」

**驗收**:總覽頁「待審零用金」數字與帳簿看板零用金卡主數字相同。

---

### F7 · 「N 張待開發票」點不進去(資料來源與連結目的地不符)

**檔案**:`web/app/boss/ledger/JournalDashboard.tsx`,新增 `web/app/boss/ledger/invoices/page.tsx`

**現況**:客戶/廠商卡上的「N 張待開發票」查的是 `ledger_entries.invoice_status='to_issue'`,
但卡片連結指向 `/boss/ledger/receivables`(查的是 `receivables` 表)。點進去看不到那 N 張發票。

**改成**:新增待開發票集中頁 `/boss/ledger/invoices`(規格原就列了此頁,尚未實作):
- 查詢:`ledger_entries` where `invoice_status='to_issue'` and `state<>'voided'`
- 欄位:日期、帳簿、對象、案場、金額、稅額、已過天數、動作(編輯)
- 排序:`occurred_on` 由舊到新(最久沒開的排最前)
- **逾期標示**:超過 14 天者整列以警示色標示(門檻 14 天,定義為常數並加註可調)
- 錯誤處理:查詢失敗 loud,不顯示空清單
- 手機:卡片流;桌機:表格(照 `LedgerRowMobile.tsx` 的既有模式)
- 頁面標題區加一行說明:「這裡列的是已入帳、但發票還沒開出去的帳目」

同時把看板卡上的「N 張待開發票」**本身做成連結**,指向
`/boss/ledger/invoices?journal=customer`(或 `vendor`),讓數字可下鑽。

**驗收**:看板顯示「2 張待開發票」→ 點該行 → 待開發票頁列出正好那 2 筆。

---

### F8 · 薪資帳簿卡標籤與目的地不符

**檔案**:`web/app/boss/ledger/JournalDashboard.tsx`

**現況**:卡上寫「本月結算入口」,但 `primaryHref` 指向 `/boss/ledger?journal=payroll`
(帳目列表)。真正的結算入口是 `/boss/close`。

**改成**:二選一,不可兩者都不做——
- 主連結改指 `/boss/close`,標籤維持「本月結算入口」;或
- 主連結維持帳目列表,標籤改為「薪資帳目明細」

**建議採前者**,並在卡上補一行次要連結「看薪資帳目」指向明細頁,兩個入口都保留。

**驗收**:卡片上每一個可點區域的文字,都與點下去實際到達的頁面相符。

---

### F9 · 薪資卡與老闆個人卡沒有數字

**檔案**:`web/app/boss/ledger/JournalDashboard.tsx`

**現況**:兩張卡的主數值寫死字串「查看」。看板的價值是「一眼看出有什麼事要做」,
這兩張卡等於佔位子。

**改成**:給出當月實際數字——
- 薪資卡:本月 `journal='payroll'` 且 `state='posted'` 的支出合計(標籤:「本月薪資支出」)
- 老闆個人卡:本月 `journal='personal'` 且 `state='posted'` 的收入/支出合計
  (標籤:「本月業外/個人」,收支分兩行顯示)

兩者皆需納入 F4 同款錯誤處理(查詢失敗不顯示數字)。

**驗收**:兩張卡顯示的數字,與到明細頁篩選同一帳簿後的合計相符。

---

## P2 · 重複工作流

### F10 · `actions.ts` 是整套 API 的平行複製品,其中三個是死碼

**檔案**:`web/app/boss/ledger/actions.ts`

**現況**(已用 grep 確認外部引用):

| export | 誰在用 | 狀態 |
|---|---|---|
| `voidEntry` | `VoidDialog.tsx` | **live**,且有 F1 的 bug |
| `voidEntryForm` | 無 | 死碼 |
| `createEntry` | 無 | 死碼,且**缺 `journal`**,若被接上會違反 NOT NULL |
| `updateEntry` | 無 | 死碼,同樣缺 `journal`/`payment_method`/`site_distribution` |
| `importBatch` | 無 | 死碼(`ImportBatchDialog` 走的是 `/api/ledger/import-batch`) |
| `readFormLedger` | 僅供上述死碼使用 | 死碼 |

實際生效的建立/修改/匯入路徑都是 `web/app/api/ledger/**` 的 route。`actions.ts` 是
另一套沒人維護、且已與 schema 脫節的平行實作。

**改成**:
1. 先修 F1(`voidEntry` 補 `state`)
2. **保留** `voidEntry`(它是 live 的)
3. **刪除** `voidEntryForm`、`createEntry`、`updateEntry`、`importBatch`、`readFormLedger`
   及其專用的 import 與 `BATCH_LOCKED_FIELDS` 常數
4. 刪除前**再跑一次 grep 確認無引用**:
   ```
   cd web && grep -rn "voidEntryForm\|createEntry\|updateEntry\|importBatch\|readFormLedger" app lib | grep -v "app/boss/ledger/actions.ts:"
   ```
   有任何一筆輸出就停手,回報使用者,不要硬刪。

**理由**:留著會讓下一個人改錯地方(這次就是這樣——修了 API route 的 void，UI 卻走另一條)。

**驗收**:`npx tsc --noEmit` 通過;作廢功能仍可正常運作。

---

### F11 · 應收應付總額,三處各算一次

**檔案**:`web/app/boss/ledger/JournalDashboard.tsx`、`web/app/boss/ledger/receivables/page.tsx`、
`web/app/boss/report/page.tsx`

**現況**:三處都讀 `receivable_payment_state`,但各自 `filter(...).reduce(...)` 算一次
在手應收/應付。「什麼算未結」的判斷散在三個檔案,日後改一處會漂移。

**改成**:在 `web/lib/receivables-query.ts` 新增一個共用函式,回傳
`{ receivableOpenTotal, payableOpenTotal, receivableOpenCount, payableOpenCount, overpaidCount, error }`,
三處改呼叫它。負值一律以 `Math.max(0, remaining)` 處理(維持現行行為),超收另計於
`overpaidCount`。

**驗收**:三頁顯示的在手應收/應付金額完全相同;`npx tsc --noEmit` 通過。

---

### F12 · 「從薪資結算匯入零用金」暫時保留(不在本批退役)

**檔案**:`web/app/boss/ledger/ImportBatchDialog.tsx`

**判定**:此路徑與未來的「收據→draft entry 管線」是同一件事的兩種做法,
[ledger-v3-spec-v1.md](./ledger-v3-spec-v1.md) 已判定應於批 3 退役。但取代它的管線
**尚未實作**(卡在 `state`/`status` 雙軌問題),且老闆**每月實際使用此功能結算**。

**本批動作**:**不移除**。僅在對話框內加一行說明文字,標示這是現行路徑、未來會被
逐筆收據流程取代,避免下一個接手的人誤以為它是遺留物而砍掉。

---

## P3 · 齊全性與結構

### F13 · 應收應付頁沒有手機卡片檢視

**檔案**:`web/app/boss/ledger/receivables/page.tsx`,新增 `ReceivableRowMobile.tsx`

**現況**:表格 `minWidth: 900`,手機需橫向捲動。`/boss/ledger` 與 `/boss/expenses`
都已有卡片檢視,此頁獨缺。

**改成**:照 `web/app/boss/ledger/LedgerRowMobile.tsx` 的模式新增卡片元件,
`lg:hidden` 顯示卡片、`hidden lg:block` 顯示表格。卡片需含:方向、對象、案場、
約定總額、已結、未結(超收時以警示色顯示「超收 $X」)、狀態、動作按鈕。

**驗收**:375px 寬度下操作完整流程,無橫向捲動。

---

### F14 · 新舊介面堆疊,拆成看板頁 + 明細頁

**檔案**:`web/app/boss/ledger/page.tsx` 拆為兩頁,新增 `web/app/boss/ledger/entries/page.tsx`

**現況**:`/boss/ledger` 目前是「帳簿看板」直接疊在「舊的完整帳目頁」上方,
月份導覽、內外帳篩選、方向/類別下拉、摘要卡、表格、底部按鈕全部原封不動留著。
新舊兩套介面上下堆疊。

**改成**:

**`/boss/ledger`(看板頁)** 保留:
- `JournalDashboard`(五張帳簿卡 + 待確認卡)
- 月份導覽(上月/下月/回本月)
- 本月摘要卡(收入/支出/淨額/外帳彙總/手續費)——此頁為**全月總覽,不受篩選影響**,
  標籤明確寫「本月全部帳簿」,語意單一不會誤導
- 底部按鈕:「新增一筆」「看全部帳目」「應收應付」「待開發票」「報表中心」
- **移除**:內外帳篩選列、方向/類別下拉、明細表格、手機卡片流、
  `ImportBatchDialog`、`ExportCsvDialog`(後兩者移至明細頁)

**`/boss/ledger/entries`(明細頁)** 承接:
- 現有全部篩選(month/filter/direction/kind/site_id/journal/to_check/status)
- 摘要卡(**套用篩選**,見 F2)
- 手機卡片流 + 桌機表格
- `ImportBatchDialog`、`ExportCsvDialog`、「新增一筆」

**連結改動(務必全部更新,漏一個就是斷點)**:

| 位置 | 現況 | 改為 |
|---|---|---|
| `JournalDashboard` 各帳簿卡主連結 | `/boss/ledger?journal=x` | `/boss/ledger/entries?journal=x` |
| `JournalDashboard` 待確認卡 | `/boss/ledger?to_check=1` | `/boss/ledger/entries?to_check=1` |
| `web/app/boss/report/page.tsx` 專案下鑽 | `/boss/ledger?month=X&site_id=Y` | `/boss/ledger/entries?month=X&site_id=Y` |
| `LedgerForm.tsx` 送出成功後導向 | `/boss/ledger?month=X` | `/boss/ledger/entries?month=X` |
| `LedgerForm.tsx` 取消按鈕 | `/boss/ledger` | 維持(回看板合理) |
| `receivables/page.tsx` 「← 回帳務」 | `/boss/ledger` | 維持 |

`web/lib/nav.ts`、`/boss` 總覽卡、`/boss/more` 指向 `/boss/ledger` 者**全部維持不變**
(看板本來就該是入口)。

**注意**:Next.js App Router 中靜態片段 `entries` 優先於動態片段 `[id]`,
`/boss/ledger/entries` 不會被 `/boss/ledger/[id]` 攔截(帳目 id 為 UUID,不會撞名)。

**驗收**:
- 看板頁不再出現任何明細表格或篩選下拉
- 從報表中心點「看帳目明細」能正確帶著 `site_id` 到達明細頁並套用篩選
- 新增一筆後正確回到明細頁且看得到剛才那筆

---

### F15 · 帳務業務規則的自動化測試錨點(vitest)

**背景**:現有測試(`web/lib/__tests__/`)涵蓋陣列設計器、工時、期間、導覽、語音——
**帳務規則一條都沒有**。本批修的正是「數字在多處各算一次而漂移」,若不把規則釘進
測試,下次任何人改動都可能無聲再漂。此項對應交接方法論的「測試即規格錨點」。

**前提架構**:目前各頁在 server component 內直接查 Supabase 後 inline reduce,
無法單元測試。因此 F2/F3/F11 抽共用函式時,**必須抽成純函式**(輸入列陣列、輸出
合計物件,不碰 DB),頁面只負責查資料再餵給純函式。一致性從「三頁各算一次、靠人工
對照」變成「三頁共用一個函式、由測試釘住」——**用建構保證一致,而非用比對發現不一致**。

**新增**:
- `web/lib/ledger-summary.ts`:`summarizeEntries(rows)` → `{ income, expense, feeTotal,
  net, extIncome, extTax }`。`/boss` 總覽、看板頁摘要、明細頁摘要三處共用。
- `web/lib/receivables-query.ts` 的 F11 共用聚合函式,同樣以純函式形式呈現
  (`summarizeReceivables(rows)`),DB 查詢與計算分離。

**測試檔**:
- `web/lib/__tests__/ledger-summary.test.ts`,至少釘住:
  1. `net = income − expense − feeTotal`(手續費必扣——批 0 的修正不許回退)
  2. 空陣列 → 全零,不是 NaN
  3. 外帳彙總只計 `is_external=true` 的列
  4. voided 列**不得**出現在輸入(以註解言明:呼叫端負責只餵 active;測試餵入
     voided 列時函式照算——藉此把「過濾責任在查詢端」寫成文件)
- `web/lib/__tests__/receivables-summary.test.ts`,至少釘住:
  1. `remaining = total − settled`;`overpaid` 判定在 settled > total 時為真
  2. 在手合計對 remaining 取 `Math.max(0, …)`,超收不倒扣總額
  3. 只有 `status='open'` 計入在手合計
- `web/lib/__tests__/ledger-journal-map.test.ts`:
  1. `KIND_TO_JOURNAL` 窮舉所有 `LedgerKind`(除 `credit_card`)——防止未來新增
     kind 忘了配帳簿,炸在測試而不是炸在 API 400
  2. `directionOfKind` 與 `INCOME_KINDS`/`EXPENSE_KINDS` 互斥且完備

**驗收**:`npm test` 綠燈;故意把 `summarizeEntries` 的 net 改回不扣手續費 → 測試必須紅。

---

## 明確不做

| 項目 | 理由 |
|---|---|
| 任何新的 DB migration | 本批純前端/API 層 |
| 退役 `ImportBatchDialog` | 見 F12,取代路徑未就緒,老闆每月在用 |
| 收據→draft entry 管線 | 仍卡在 `state`/`status` 雙軌問題,見 v3 spec |
| 刪除 `receivables` 表 / `site_id` 欄 | 屬批 3,需先過一個月結週期的平行對照 |
| `party` 正規化為 customers 表 | 規模化階段 |
| 對 `/boss/ledger` 舊網址做 redirect | 看板頁仍在原網址,不需要 |

---

## 驗證方式

### V1 · 型別、建置與單元測試
每個編號項目完成後 `npx tsc --noEmit`;全部完成後 `cd web && npm run build && npm test`,
三者皆須零錯誤。F15 的測試檔為必要交付物,不是選配。

### V2 · 資料不變量
執行 `supabase/checks/ledger-v3-invariants.sql`(對正式或本機 Supabase 皆可)。
**I2b(state 與 status 一致)必須回 0 列**——這是 F1 的直接驗收條件。

本機跑法(需 Docker):
```
cd /Users/yen/Desktop/Yen/Develop/wu-sound-fde && supabase start
docker exec -i supabase_db_wu-sound-fde psql -U postgres < supabase/checks/ledger-v3-invariants.sql
```

### V3 · 一致性對照(本批的核心驗收)
以下三組數字,每組內部必須完全相同。注意:F15 完成後,第一、三組的一致性應由
「三頁共用同一個純函式」在建構上保證,此處的人工對照是最後防線,不是唯一防線:

| 組 | 位置 A | 位置 B | 位置 C |
|---|---|---|---|
| 本月淨額 | `/boss` 總覽 | `/boss/ledger` 摘要卡 | — |
| 待審零用金 | `/boss` 總覽 | 帳簿看板零用金卡 | `/boss/expenses` 清單筆數 |
| 在手應收/應付 | 帳簿看板客戶+廠商卡 | `/boss/ledger/receivables` | `/boss/report` |

任一組對不上即為未通過。

### V4 · UI 走查(逐條人工確認)
```
A1  /boss/ledger 只有看板,沒有明細表格與篩選下拉
A2  點任一帳簿卡 → 到 /boss/ledger/entries 且該帳簿篩選已套用
A3  明細頁套用帳簿篩選後,摘要卡數字 = 表格金額欄加總
A4  看板「N 張待開發票」可點 → 到待開發票頁,筆數相符
A5  薪資卡點下去到達的頁面與卡片文字相符
A6  作廢一筆掛在應收約定上的收款 → 該約定未結金額立刻增加回該筆金額
A7  報表中心專案維度點「看帳目明細」→ 正確帶 site_id 到明細頁
A8  375px 寬度下走完:看板 → 明細 → 新增一筆 → 應收應付,全程無橫向捲動
A9  製造查詢錯誤(暫改 view 名) → 看板/應收應付頁只顯示紅色錯誤,無任何 $0
A10 新增一筆後回到明細頁,該筆立即可見
```

---

## 執行順序

1. **F1**(補 `state` 同步)+ 歷史資料筆數確認 — 最高優先,現在就在算錯錢
2. **F3、F5**(總覽頁淨額與時區)— 單檔案,低風險
3. **F4**(應收應付錯誤處理)
4. **F10**(刪死碼,含 grep 再確認)
5. **F15 前半 + F11**(建 `ledger-summary.ts`/`summarizeReceivables` 純函式與測試,
   先讓測試釘住規則,再把各頁接上共用函式)— 為 F2/F3/F6/F9 鋪路
6. **F6、F8、F9**(看板卡數字與連結)
7. **F7**(新增待開發票頁)
8. **F13**(應收應付手機卡片)
9. **F14**(拆頁 + 全部連結改動)+ **F2**(摘要卡跟篩選,隨拆頁一併完成)
10. **F12**(加說明文字)+ **F15 收尾**(journal-map 測試、全套跑綠)
11. 全套 V1–V4 驗證

F14 放最後,因為它會移動大量程式碼;先把邏輯錯誤修在原地,再搬家,比較容易確認搬家
過程沒弄丟東西。

---

## 給執行者的提醒

- 本專案憲章:**缺就 loud**、**DB 算總數**、**AI 永不直接入帳**、**可追溯**(動作寫 `audit_log`)
- 中文註解,說明「為什麼這樣寫」而非「這行在做什麼」
- 檔案保持 500 行以內;`/boss/ledger/page.tsx` 拆頁後應明顯變短
- 不要為了通過驗收而放寬驗收條件;數字對不上就是沒過,回報使用者
- 遇到與本規格描述不符的現況(例如某個檔案已被別的工作階段改過),**停下來回報**,
  不要自行猜測意圖
