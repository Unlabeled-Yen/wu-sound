# 第三步規格 v1 — 器材聲學規格建檔(2026-08-03)

## 為什麼

### 先講一個現在就在發生的靜默失效

SPL 計算器有「選喇叭自動帶入規格」的功能([`SplCalculatorForm.tsx:62`](../../web/app/tools/spl-calculator/SplCalculatorForm.tsx))。**它現在完全沒有作用,而且不會報錯。**

斷在四個地方,每一層都是斷的:

| 層 | 狀態 | 證據 |
|---|---|---|
| 資料庫 | 四個規格欄位**不存在** | 查詢 `max_spl_db` 回 `column catalog_items.max_spl_db does not exist` |
| Migration | `007_catalog_spl_spec.sql`、`008_catalog_amp_spec.sql` 寫好了但**從未套用**,且未進版控 | `git status` 顯示為 untracked |
| 型別 | `CatalogItem` 把四欄宣告為**選用**(`max_spl_db?`) | `lib/types.ts:178` |
| 讀取 | 頁面用 `select('*')`,所以**不會噴錯**,只是拿不到欄位 | `app/tools/spl-calculator/page.tsx` |

連鎖結果:`select('*')` 不報錯 → 回傳的物件沒有那些欄位 → 型別是選用所以 TypeScript 不擋 → `item.max_spl_db != null` 判斷為否 → 帶入邏輯整段跳過 → **畫面什麼都沒發生,使用者以為這款喇叭「還沒建規格」**。

這正是本專案憲章明令禁止的形態:壞了不吭聲。修這一步不只是為了第四步的前置,是修一個既有缺陷。

### 為什麼要這批資料

沒有這四個欄位,[第四步](step4-closed-loop-spec-v1.md)的物理驗證無從做起——AI 選了一組喇叭,系統沒有任何依據判斷它打不打得到那個場地。

## 資料模型

沿用兩支已寫好的 migration,不重寫:

| 欄位 | 型別 | 意義 | 來源 |
|---|---|---|---|
| `max_spl_db` | numeric null | 規格最大音壓(dB SPL) | 原廠規格書 |
| `spl_ref_distance_m` | numeric null | 上述數值的量測基準距離(公尺),多數標 1m | 原廠規格書 |
| `sensitivity_db_1w1m` | numeric null | 喇叭靈敏度(dB @1W/1m) | 原廠規格書 |
| `amp_power_w` | numeric null | 擴大機額定功率(W) | 原廠規格書 |

四欄皆可為 null,已帶 `> 0` 的 check constraint。**null 代表「尚未建檔」,不代表 0**,UI 必須把兩者區分開。

阻抗匹配不建模——輸入的瓦數視為實際負載下的有效功率,由填資料的人對規格負責(migration 008 檔頭已載明,此處重申)。

## 工作分解

### A. 資料庫

- A1 把 007、008 兩支 migration 套用到正式 Supabase
- A2 兩支 migration 納入版控(目前 untracked)
- A3 同步更新 `supabase/schema.sql`(canonical 全庫定義,見 commit `654be3a` 確立的角色分工)

### B. 讀寫路徑

- B1 `app/api/catalog/[id]/route.ts` 的 PATCH 目前只接受 brand / name / item_type / unit / category / note / active / cost_price_twd / sell_price_twd,**需擴充四個規格欄位**,並比照現有 `parsePrice` 做數值驗證(非數字或 ≤0 一律拒收,不靜默轉 null)
- B2 `app/api/catalog/route.ts` 的 POST(新增品項)同上
- B3 `CatalogRow.tsx` 加入四欄的顯示與 inline 編輯。考量橫向空間已滿,建議收在展開列或次要區塊,不與價格欄爭同一行
- B4 `app/boss/catalog/page.tsx` 的「⚠️ 待補售價」計數旁,增加「待補規格」計數,沿用同一個 loud 語彙

### C. 修掉靜默失效

- C1 `app/tools/spl-calculator/page.tsx` 的 `select('*')` 改為**明列欄位**。欄位不存在時要噴錯,不要靜默略過
- C2 `CatalogItem` 型別的四個選用欄改為必要欄(`max_spl_db: number | null`),讓漏取欄位在編譯期就被抓到
- C3 選了喇叭但該品項規格為 null 時,UI 明確顯示「此品項尚未建規格,請手動輸入或先去價目表補」,而不是靜靜留白

### D. 資料填充

114 個品項不需全填,只有喇叭與擴大機需要(SPL 計算器本來就只取 `item_type` 為喇叭/擴大機的品項)。

**填充規則(硬性):**

- 數值**只能來自原廠規格書**。
- **不得由 AI 產生、推估或代查**。這是會流進物理驗證與報價判斷的數字,錯了會沿著第四步一路放大。這條與 ADR-0002「AI 絕不出價」同源:**會被當成事實使用的數字,不從語言模型來**。
- 一次填不完是預期中的。沿用價目表已驗證的「邊用邊補」節奏:缺的就 loud 標出來,不擋其他功能。

## 驗收條件

| ID | 條件 | 方式 |
|---|---|---|
| S-01 | 正式資料庫四欄存在,constraint 生效(填 0 或負數被拒) | 手動 SQL |
| S-02 | 價目表頁可看到並編輯四個規格欄 | browser |
| S-03 | 填了規格的喇叭,在 SPL 計算器選取後**確實帶入**數值 | browser |
| S-04 | 沒填規格的喇叭,顯示明確提示,不是留白 | browser |
| S-05 | 故意把某欄從查詢中拿掉 → 編譯期或執行期報錯,**不得靜默通過** | auto + 手動 |
| S-06 | 價目表頁顯示「待補規格 N 項」 | browser |
| S-07 | PATCH 送非法值(字串、負數)被拒且回中文錯誤 | auto |
| S-08 | `npx tsc --noEmit` 全過 | auto |

S-05 是這一步的核心驗收——它直接針對本次發現的失效形態。

## 不做

- 不做規格自動抓取(爬原廠網站/PDF 解析)。錯誤成本高、來源不可控。
- 不建阻抗模型。
- 不強制填滿才能用計算器。手動輸入路徑永遠保留。
- 不在這一步做任何 AI 功能。

## 前置依賴

無硬性依賴,可與第一、二步平行進行。但**第四步硬性依賴本步驟**——規格沒建,閉環驗證只能回「無法驗證」。

## 風險

最大的風險不是工程,是**資料填充會停滯**。114 項裡喇叭與擴大機的規格要一筆筆查原廠文件,跟價目表一樣是人工苦工。建議:先填雇主最常用的那幾款(CODA 系列、YAMAHA 主力款),讓第四步能在小範圍先跑起來,不要等全填完。
