# 桌面版鎖定與員工權限規格 v1(2026-08-17)

員工端手機版暫緩開發,先把所有員工鎖在桌面版;同時把員工的可視範圍從「只有三個手機分頁」
改成「除了帳務、標案、使用者管理以外都看得到、也改得動」。

這份記錄**決定了什麼、為什麼**,以及實作時哪裡會踩到坑。實作對照
`web/lib/acl.ts`(新增,單一事實來源)與 `web/lib/__tests__/acl.test.ts`。

---

## 0. 病灶(排查結果)

`web/app/staff/layout.tsx` 從頭到尾**沒有任何響應式斷點**:固定底部五格分頁、sticky 手機標題列,
全檔案沒有一個 `lg:` / `md:`,也沒有裝置偵測。所以員工不論用什麼裝置登入,畫出來的永遠是手機版。

這不是「偵測錯裝置」的 bug,是**員工桌面版從來沒被實作過**。對照組是老闆端
`web/app/boss/_shell/BossShell.tsx`,用 Tailwind `lg:` 斷點切兩套版面(側欄 / 底部分頁)。

---

## 1. 三條規則(定案)

| 對象 | 版面 | 可視範圍 |
|---|---|---|
| 老闆 | **跟隨裝置**:手機登入看手機版,電腦登入看桌面版 | 全部 |
| 員工 | **一律桌面版**,手機登入也是桌面版 | 除了「帳務」「標案」「使用者管理」以外全部 |

補充裁決(2026-08-17 Yen):

- **使用者管理一併擋掉**。理由:該頁可改別人的 PIN 與角色,員工進得去等於能把自己升成老闆——
  跟帳務、標案是同一級的東西,只是不在同一個側欄群組。
- **員工「看得到就改得動」**。開放的頁面連同寫入權一起給,不做唯讀模式。
  兩個例外建議見 §5.3,需要你一句話定案。
- **不設 QA 帳號、不動資料庫**。老闆本身就是跟隨裝置,要驗手機版用老闆帳號在手機上登入即可。

---

## 2. 範圍

**做**:版面決定機制、員工桌面工作台、權限單一事實來源、API/server action 權限調整、驗收測試。

**不做**:員工手機版的重新設計(這正是「暫緩」的那一塊)、老闆端任何版面調整、
資料庫 schema 變更、路由 URL 重新命名(見 §8 技術債)。

---

## 3. 版面決定機制

### 3.1 老闆:不動

`BossShell` 現有的 `lg:` 斷點行為就是「跟隨裝置」,已經正確。**這輪一行都不改。**

### 3.2 員工:鎖桌面

員工要在手機上看到桌面版,必須讓瀏覽器**以桌面寬度渲染**。做法:

主線 —— 覆寫 viewport meta:

```
員工 session → workspace layout 輸出 <meta name="viewport" content="width=1280, initial-scale=..., user-scalable=yes">
```

一個槓桿翻動全部 `lg:` 斷點:viewport 寬度變成 1280 後,Tailwind 的 `lg:` 全部命中,
`LoginForm` 的 `matchMedia('(min-width: 768px)')` 也一致回報桌面。不必逐一改斷點類別。

**兩件事必須一起做,漏掉會變成沒人回報的爛體驗:**

1. `web/app/layout.tsx` 目前是 `maximumScale: 1`。鎖桌面後手機上字會很小,
   使用者必須能雙指放大——員工端的 viewport **不得**帶 `maximumScale: 1`。
2. 桌面 shell 在窄螢幕會出現橫向捲動。這是預期行為(就是「在手機上用電腦版」),
   但要確認 `lg:h-screen lg:overflow-hidden` 不會把內容裁掉而不是捲動。

**實作前先做這個 spike(30 分鐘,結果會改寫做法):**
確認 Next.js 16 的 `generateViewport()` 能不能讀 session cookie。

- 可以 → 用 segment 層級的 `generateViewport()` 依角色輸出 viewport,乾淨。
- 不行 → 退路 F:server 在 shell 根節點渲染 `data-force-desktop`,
  搭一段 inline script 在載入時改寫 meta viewport。會有一瞬閃動,但不依賴 metadata API。

**不做的事:User-Agent 偵測。** 版面由「角色」決定,不由「裝置字串」決定——
沒有猜錯的空間,也就沒有猜錯了卻不吭聲的可能。

### 3.3 恢復員工手機版的路

`web/lib/view-mode.ts` 匯出一個常數:

```ts
/** 員工手機版暫緩開發中。做完後改成 true,員工即回到跟隨裝置。 */
export const STAFF_MOBILE_ENABLED = false;
```

員工的鎖桌面判斷一律走這個常數,不散落在各處。既有的 `app/staff/*` 手機版程式碼
**保留不刪**(專案慣例:從導覽拿掉、路由留著)。開發完成時改一個布林值就還原。

---

## 4. 員工桌面版看得到什麼

### 4.1 側欄(員工版)

`lib/nav.ts` 的 `NAV_SECTIONS` 依角色過濾後畫出來。員工看到的:

| 區塊 | 給員工 | 說明 |
|---|---|---|
| 總覽 `/boss` | ✅ | 桌面版目前是「即將推出」占位。**約束見 §4.3** |
| 專案管理 `/boss/sites` | ✅ | |
| 報價系統 `/boss/quotes` `/boss/bundles` `/boss/catalog` | ✅ | |
| 聲學計算 `/tools/*` | ✅ | |
| 設備庫存 `/boss/equipment` | ✅ | |
| 現場 `/boss/worklogs` `/boss/clockins` | ✅ | |
| 我的作業 `/staff/capture` `/staff/memo` `/staff/clockin` | ✅ | 新增區塊,把員工原本三個手機分頁掛進桌面側欄 |
| **財務** `/boss/expenses` `/boss/ledger` `/boss/close` | ❌ | 含零用金審核、應收、薪資結算、月結 |
| **標案** `/boss/tenders/**` | ❌ | |
| **設定 / 使用者管理** `/boss/users` | ❌ | 員工只保留 `/staff/settings`(改自己的 PIN) |

側欄過濾**不是唯一防線**,只是不畫出來。真正的擋在 §5。

### 4.2 落地頁

- 老闆:`/boss`(不變)。
- 員工:`/staff/capture`(零用金拍照)。**不要**讓員工落在 `/boss` 總覽——
  桌面總覽現在是占位頁,員工登入第一眼會是一片空白。
- `web/app/login/LoginForm.tsx` 的 `router.replace(...)` 依此調整。

### 4.3 總覽的約束

桌面總覽目前是占位頁,所以現在沒有洩漏風險。但手機版總覽
(`BossMobileDashboard`)會顯示當月收入/支出/淨額。**寫進程式碼註解並用測試釘住**:
總覽日後真的重做時,財務數字必須依角色隱藏,不能因為「員工看得到總覽」就順手把數字露出去。

---

## 5. 權限:單一事實來源

### 5.1 `lib/acl.ts` 契約

比照 `lib/nav.ts` 的做法——一份結構、一支測試釘住,不讓權限判斷散落各處。

```ts
export type Capability =
  | 'overview' | 'sites' | 'quotes' | 'equipment' | 'ops' | 'acoustic' | 'self'
  | 'finance' | 'tenders' | 'user-admin';

/** 員工不得存取的能力。改這裡就等於改權限。 */
const STAFF_DENIED: Capability[] = ['finance', 'tenders', 'user-admin'];

export function can(role: UserRole, cap: Capability): boolean;

/** 路徑 → 能力。查不到回 null。 */
export function capabilityForPath(pathname: string): Capability | null;

/** 老闆一律 true;員工查表,查不到一律 false。 */
export function canAccessPath(role: UserRole, pathname: string): boolean;
```

**預設拒絕**:`capabilityForPath` 查不到的路徑,對員工一律擋。新頁面忘了登記
不會默默放行,而是員工進不去。同時在 server 端印一行警告點名該路徑,
讓「忘了登記」變成看得到的事,而不是等哪天出事才發現。

### 5.2 守衛放在哪裡

**不放在 layout。** Next.js 的 server layout 拿不到 pathname,
`app/boss/layout.tsx` 現在那句 `if (session.role !== 'boss') redirect('/staff')`
之所以能用,是因為它一刀切整個 `/boss/*`;改成分頁面判斷後它就不夠用了。

**不新增 middleware。** session 驗簽用 `node:crypto` 的 HMAC,Edge runtime 沒有,
為了這件事去動 runtime 設定不划算。

**做法**:沿用專案既有風格——每支受限的 page / API route / server action 自己檢查,
呼叫 `requireCapability('finance')` 之類的共用函式。再加一支**掃描測試**當防漂移裝置:

```
web/lib/__tests__/acl.test.ts
  1. 掃 app/**/page.tsx,每一支都要能在 acl 表裡查到能力,否則紅
  2. 掃 app/api/**/route.ts,同上
  3. 釘住三塊禁區的完整路徑清單(員工存取 → false)
  4. 釘住老闆對每一條路徑都是 true
```

### 5.3 API / server action 逐支對照

現況:約 30 支 route 寫死 `if (session.role !== 'boss') → 403`。要改成能力檢查。

**放行給員工(`role !== 'boss'` → `requireCapability(...)`):**

| 檔案 | 能力 |
|---|---|
| `api/bundles/route.ts`、`api/bundles/[id]/route.ts`、`api/bundles/[id]/lines/route.ts` | quotes |
| `api/catalog/route.ts`、`api/catalog/[id]/route.ts` | quotes |
| `api/quotes/route.ts`、`api/quotes/[id]/route.ts`、`[id]/lines`、`[id]/suggest`、`[id]/export.csv` | quotes |
| `api/equipment/route.ts`、`api/equipment/[id]/route.ts`、`api/equipment/[id]/move/route.ts` | equipment |
| `app/boss/equipment/[id]/actions.ts`(更新、報廢) | equipment |
| `app/boss/sites/actions.ts`(建立/更名/停用場地、分類) | sites |
| `api/boss/clockins/export.csv/route.ts` | ops |

**維持老闆專屬(一行都不動):**

| 檔案 | 能力 |
|---|---|
| `api/ledger/*`(4 支)、`api/receivables/*`(3 支) | finance |
| `api/payroll/bonus`、`pay-profile`、`settle` | finance |
| `api/boss/close/[month]/export.csv`、`api/boss/pending-count` | finance |
| `app/boss/ledger/actions.ts`、`app/boss/expenses/[id]/actions.ts` | finance |
| `app/boss/users/actions.ts`(建立使用者、改名、停用、重設 PIN) | user-admin |
| `app/boss/tenders/**` 三支 page 的角色檢查 | tenders |

**本來就只檢查登入、且是使用者本人範圍的,不動:**
`api/expenses/capture`、`api/expenses/no-receipt`、`api/expenses/[id]/submit`、
`api/expenses/[id]/void`(route 內以 `user_id` 限本人)、`api/line/bind-code`、
`app/staff/settings/actions.ts`、`api/sites`、`api/tasks*`、`api/site-knowledge`。

### 5.4 現場資料例外(定案:2026-08-17 Yen 採納建議)

「看得到就改得動」原則在打卡與工作記錄上**不適用**——這兩塊工時直接換算成薪資結算與
專案支出,員工能改他人紀錄等於能自己加薪,而且改完帳面上完全合法、不會報錯。

**定案**:現場資料(打卡、工作記錄、工地分攤)員工只能看全部、**只能改自己的**;
改他人紀錄維持老闆專屬。這兩支 route 內部本來就已經有「他人紀錄」的判斷,原樣保留即可:

| 檔案 | 員工權限 |
|---|---|
| `api/clockins/[id]` PATCH / DELETE(改、刪打卡紀錄) | 僅限本人紀錄(`user_id === session.id`);他人 → 403,維持 `role !== 'boss'` 檢查不動 |
| `api/worklogs` GET/POST | GET 不變(本來就是全體可看);POST 僅限本人 |
| `api/day-site-allocations` 「修改他人紀錄」那條判斷 | 維持 `role !== 'boss'` 檢查不動,即他人紀錄僅老闆可改 |

不需要新能力類型——這是 `ops` 能力底下「本人 vs 他人」的細粒度判斷,在 route 內部用
`session.id` 比對既有的 `user_id`/`created_by` 欄位即可,`acl.ts` 不用為此新增結構。

---

## 6. 資料庫

**不動。** 沒有新欄位、沒有 migration。權限由 `role` 推導,版面由 `role` + 常數決定。

---

## 7. 驗收條件

實作完成後,以下每一條都要真的跑過,不接受「應該可以」:

**版面**

1. 老闆帳號在電腦瀏覽器登入 → 桌面版(側欄)。
2. 老闆帳號在手機登入 → 手機版(底部分頁)。
3. 員工帳號在電腦登入 → 桌面版。
4. 員工帳號在**手機**登入 → 桌面版,且可雙指放大。
5. 手機上的員工桌面版,內容是橫向捲動而不是被裁掉。

**權限(員工帳號)**

6. 側欄看不到財務、標案、使用者管理。
7. 網址列直接打 `/boss/ledger`、`/boss/tenders/monitor`、`/boss/users` → 全部進不去。
8. `curl` 直接打 `/api/ledger`、`/api/payroll/settle`、`/api/boss/pending-count` → 403。
9. 進得去報價系統並成功改一筆報價、進得去設備庫存並成功改一台設備。
10. `/staff/capture` 拍收據、`/staff/clockin` 打卡仍正常。

**權限(老闆帳號)**

11. 上述所有頁面與 API 全部照舊可用,零迴歸。

**自動測試**

```bash
cd web && npm test && npm run build
```

`acl.test.ts` 的掃描測試必須綠;新增任何 page/route 而未登記能力時,它必須紅。

---

## 8. 已知取捨與技術債

- **URL 前綴不改。** 員工會走在 `/boss/quotes` 這種路徑上,語意上不對。
  重新命名成 `/workspace/*` 是大改,這輪不做,記在這裡。
- **員工桌面版沿用老闆的版面。** 不另外設計員工專屬桌面 UI,直接複用 `BossShell` 並過濾側欄。
  員工手機版與員工專屬桌面體驗都留到「開發到一個程度」之後。
- **總覽對員工是占位頁。** 已知體驗不佳,所以落地頁改指 `/staff/capture`(§4.2)。
- **舊 session 的角色。** session cookie 14 天內不重查角色,但每次 `getSession()` 會查
  `active` 欄位。角色變更(員工升老闆)要等 cookie 過期或重新登入才生效——**現況既有行為,這輪不處理**。

---

## 9. 實作順序

1. spike:`generateViewport()` 能否讀 session(§3.2),決定主線或退路 F。
2. `lib/view-mode.ts` + `lib/acl.ts` + `lib/__tests__/acl.test.ts`(先寫測試,此時全紅)。
3. `lib/nav.ts` 加角色過濾 + 「我的作業」區塊;補 nav 測試。
4. `app/boss/layout.tsx` 一刀切改成能力檢查;各受限 page 掛 `requireCapability`。
5. API / server action 逐支照 §5.3 改。
6. 員工鎖桌面(viewport 覆寫 + `STAFF_MOBILE_ENABLED`)。
7. 登入落地頁改指向。
8. 跑完 §7 全部 11 條 + 自動測試。
