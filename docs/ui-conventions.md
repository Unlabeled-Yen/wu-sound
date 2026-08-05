# 老闆端 UI 互動慣例(v1)

寫給未來的自己/協作者:老闆端 (`/boss`) 所有頁面照這份規則來,不然整站看起來會像 11 個做的網站。

---

## 1. 版面骨架

- 三層浮起面板(見 `web/app/boss/_shell/BossShell.tsx`)
  - 面板 1(icon rail, 深黑)= 分類切換
  - 面板 2(次級,深色玻璃)= 當前分類的頁面清單
  - 面板 3(主內容,亮玻璃)= 頁面實體內容
- 主內容內部**不要**再放一層 max-w 限制,由 shell 統一控寬。頁面直接用 `space-y-6` 排 section。
- 頁面 h1 統一 `text-2xl font-semibold text-neutral-900`,上方一行小灰字副標(`text-sm text-neutral-500`)。

---

## 2. 互動模式(依「動作類型」選,而非依「頁面」隨興)

| 動作類型 | 用什麼 | 例子 |
|---------|--------|------|
| 主檔行內編輯(欄位少、一目瞭然) | **inline edit** | 品項庫改價、案場改名、使用者改姓名 |
| 建立/編輯複雜實體(多欄位、多 section) | **獨立頁** `/[id]` 或 `/new` | 內帳、報價、設備 |
| 一次性動作(危險、需輸入、需確認) | **modal** | 作廢、退回、匯入、匯出、移動 |
| 導覽/篩選 | **URL query state** | ledger 的月份/類別 filter |

**新規則**:同一個實體 CRUD 只能選一種模式,不要 mix。品項庫用 inline edit 就別在 modal 裡再開一個 form,反之亦然。

---

## 3. 危險動作(destructive)一律走 modal + 2 步

- 「作廢」「刪除」「停用」「鎖定」「退回」等會影響資料狀態的動作,**不能一鍵直送**。
- Modal 內至少 2 步:
  1. **原因輸入**(至少 2 字,server 端也要擋)
  2. **二次確認**(顯示要作廢的實體摘要 + 原因回顧 + 「確定作廢」紅色主按鈕)
- 範本:`web/app/boss/ledger/VoidDialog.tsx`

Server action 必須自己也擋一次(client 檢查不算數):
```ts
const r = (reason ?? '').trim();
if (r.length < 2) return { ok: false, error: '請填寫作廢原因(至少 2 字)' };
```

---

## 4. 送出回饋:全站用 toast,不再靠 `alert()` 或整頁 refresh

- Provider 在 `BossShell` 已掛好。任何 client component 用:
  ```tsx
  import { useToast } from '@/app/boss/_shell/Toast';
  const { success, error: toastError } = useToast();
  success('已儲存');
  toastError('儲存失敗:xxx');
  ```
- Server action 成功後仍要 `router.refresh()` 拿最新資料,但**同時**呼叫 `success()` 給 feedback。
- 錯誤:server action 回 `{ ok: false, error }` 時,client 用 `toastError(res.error)`,同時在 modal 內顯示紅字(留給使用者可以看清楚,toast 4 秒後會消失)。
- **不要用 `throw new Error`**——會炸掉整頁。改為 `return { ok: false, error }`。

---

## 5. Empty state / Error state

- Empty:灰字提示 + **可執行的 CTA 按鈕**(不要只寫「還沒有資料」就完了)
  ```tsx
  <div className="text-center py-10">
    <div className="text-neutral-500 mb-3">還沒有報價單</div>
    <Link href="/boss/quotes/new" className="rounded-xl px-4 py-2 bg-neutral-900 text-white">
      新增報價
    </Link>
  </div>
  ```
- Error:紅框 `bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800`,顯示 message,**不要 throw**。

---

## 6. 色彩 tone(給狀態卡/pill/文字用)

| Tone | 用途 | class |
|------|------|-------|
| `positive` | 淨額正、可結算、成交 | `text-emerald-700` |
| `negative` | 淨額負、失敗、拒絕 | `text-rose-700` |
| `attention` | 待審、維修中、缺價 | `text-amber-700` |
| `neutral` | 一般數字、次要資訊 | `text-neutral-900` |

Pill:同色系 `bg-*-100 text-*-800` 淺底深字。

---

## 7. 數字排版

- 金額、數量統一加 `tabular-nums`(等寬數字對齊)。
- 千分位用 `n.toLocaleString('zh-TW')`。
- 金額前綴 `$`,不打 `NT$`。

---

## 8. 深連結(deep link)

- 只要一個頁面「知道另一頁的狀態」,就要用深連結而不是叫使用者自己去找。
- 例子:月結頁 blocked 時,列出「X 員工 3 筆未處理」——這個「3 筆」要能直接連到 `/boss/expenses?assignee=X&status=pending`。
- 例子:設備列表按狀態篩選 → `/boss/equipment?status=in_repair`。

---

## 9. 「不會出現在畫面上」的內部術語

老闆端**任何**畫面(label、pill、tooltip、錯誤訊息)不能出現 code-only 的名稱,例如 `in_repair`(要寫「維修中」)、`c1/c2`(要寫實際欄位名)、DB table 名。

參考 `[[feedback-narcos-oven-no-internal-terms]]` 的紀律,這條在 wu 也適用。

---

## 10. 列表 / 表格的容器規則(全站硬性)

- 表格**不能**直接放在主內容區(裸露在浮起面板邊緣)。一定要包在一層 `.nm-raised` section 卡片裡,section 自己有 `px-5 py-4` 標題 + `px-4 pb-4` 內容 padding。
- 長列表(> ~10 列)一定要有 **max-height + 內滾**,並用 sticky header:
  ```tsx
  <div className="rounded-xl nm-inset max-h-[420px] overflow-y-auto">
    <table>
      <thead className="sticky top-0 z-10" style={{ background: 'var(--nm-bg)' }}>
        ...
      </thead>
      ...
    </table>
  </div>
  ```
- 一頁多個相關列表(例如品項庫按分類分)→ **每個分類一個 section 卡**,各自內滾。**不要**做整頁一大表 + 一顆滾軸——boss 找不到位置。
- 表頭字用 `--nm-text-muted`,font-weight normal(不加粗)。表格 row 用 `--nm-text-primary`。
- 參考範本:[web/app/boss/catalog/page.tsx](web/app/boss/catalog/page.tsx) 的 `<CategoryBlock>`。

## 11. 這份文件的角色

- 新加一個頁面/元件之前先看這份。
- 破例可以,但要在 PR/commit 訊息說明為什麼。
- 這不是 UI 設計 spec(那要另寫),這是**互動一致性契約**。
