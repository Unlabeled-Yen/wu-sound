# 語音/文字 AI 工具層權限守衛 spec v1

**開題**:2026-09-06(Yen)
**狀態**:待實作
**憲章依據**:設計憲章第 1 條「無靜默失效」

---

## 1. 問題

`web/lib/acl.ts` 是全站權限的單一事實來源:`Capability` 列舉 + `STAFF_DENIED`
+ `can(role, cap)`。人走 UI 時,每支 page 用 `requirePageCapability()`、每支 API
route 用 `can(session.role, cap)` 各自守門,`acl.test.ts` 還會走訪 `app/` 目錄
確保沒有路由漏登記。

**AI 走的那條路完全沒有經過這張表。**

`web/app/api/voice/tools/[tool]/route.ts` 的 `authenticateVoiceRequest()` 已經
正確拿到呼叫者身分(帶 cookie 時 actor 是真正登入的那個人,不是寫死的
`VOICE_ACTOR_USER_ID`),但從頭到尾沒有一行 `can(role, cap)`。工具能不能呼叫,
只取決於「這個工具有沒有被實作」。

### 現在為什麼還沒出事

現有 6 個工具(`search_projects` / `list_projects` / `get_project_summary` /
`list_tasks` / `propose_write` / `create_task`)全部落在 `sites` 這格,而 `sites`
不在 `STAFF_DENIED` 裡——員工本來就看得到。

**沒有已知越權缺口,是因為工具面還沒碰到財務/標案這類禁區,不是因為有一層機制在擋。**
(這句話 `voice-lab/README.md` 已經誠實記錄過,本 spec 是去把它了結。)

### 為什麼現在做而不是需要時再做

第一個踩過線的工具會是安靜的:員工對手機說「查本月帳目」,AI 照查照唸,
不報錯、不留異常。那正是憲章第一條要擋的靜默失效。而「加了新工具」跟
「補權限」如果同一次做,補的那步發生在最想趕快看到效果的時候,也就是最容易漏的時候。

現在補的成本是一層 helper + 一張表,而且**不改變任何現有行為**(現有工具全部照樣通過)。

### 不在範圍內的(已查證,不是洞)

- `/voice-lab-chat` 的 `page.tsx` 已經 `getSession()` 擋、沒登入 `redirect('/login')`
- `/api/voice-lab/realtime-session` 已經擋未登入(401)
- `/api/voice-lab/trace` 已經擋未登入(401)
- `/boss/voice-traces` 已經走 `requirePageCapability('more')`

這幾條路徑在 `acl.ts` 的 `PAGE_CAPABILITIES` / `API_CAPABILITIES` 裡被登記成
`'open'`(= 不分角色都能進),**與實際行為不符**。這是文件債:那張表號稱是
單一事實來源,卻對自己說謊。第 4 節修正。

---

## 2. 範圍

三件事,由重到輕:

1. **工具層能力守衛**(核心)——每個工具對到一個 `Capability`,執行前查表,預設拒絕
2. **acl.ts 表格誠實化**——把三條標錯 `'open'` 的 voice 路徑改成真實能力
3. **工具清單依角色過濾**——模型一開始就不會拿到它無權呼叫的工具

**不做**:新增任何財務/標案工具、動兩階段 token 機制、動提示詞、動 UI。

---

## 3. 工具層能力守衛(核心)

### 3.1 新檔:`web/lib/voice-tool-acl.ts`

```ts
import type { Capability } from './acl';

/**
 * 工具名 → 所需能力。這是 AI 工具面的權限單一事實來源,能力名沿用
 * lib/acl.ts 那份(不另開一套),AI 的讀寫權限跟人走 UI 時完全一致。
 */
export const TOOL_CAPABILITIES: Record<string, Capability> = {
  search_projects: 'sites',
  list_projects: 'sites',
  get_project_summary: 'sites',
  list_tasks: 'sites',
  create_task: 'sites',
  // propose_write 不在這裡——它的能力由 body.action 決定,見 PROPOSE_ACTION_CAPABILITIES
};

/** propose_write 的 action → 所需能力(propose 跟真正 commit 的那個工具必須同能力) */
export const PROPOSE_ACTION_CAPABILITIES: Record<string, Capability> = {
  create_task: 'sites',
};
```

### 3.2 `authenticateVoiceRequest()` 要回傳 role

`web/lib/voice.ts`:

- 兩處 `.select('id, active')` 改成 `.select('id, active, role')`
- `VoiceAuthOk` 介面加 `role: UserRole`
- 兩條路徑都回傳 `role`

Bearer(server-to-server)那條路 actor 是 `VOICE_ACTOR_USER_ID`(目前設成老闆),
所以它的 role 就是那個使用者的真實 role,不特別放行、也不特別限制。

**loud 條件**:`role` 讀出來是 null 或不是 `'boss'`/`'staff'` → 回 503
`SERVICE_UNAVAILABLE`「actor 角色資料異常」。不猜、不預設成 staff。

### 3.3 守衛函式

同樣放 `web/lib/voice-tool-acl.ts`:

```ts
/**
 * 回傳這次呼叫所需的能力;工具沒登記在表裡回 null。
 * propose_write 依 body.action 決定,action 不認識也回 null。
 */
export function capabilityForTool(tool: string, body: Record<string, unknown>): Capability | null
```

### 3.4 接進 dispatcher

`web/app/api/voice/tools/[tool]/route.ts` 的 `POST`,在 `parseBody` 之後、
所有 `if (tool === ...)` 分派之前:

```
const cap = capabilityForTool(tool, body);
if (cap === null) → voiceError('BAD_REQUEST', `工具 ${tool} 尚未登記權限`, 400)
if (!can(role, cap)) → voiceError('FORBIDDEN', '你沒有權限使用這個功能', 403)
```

`FORBIDDEN` 是新的 `VoiceErrorCode`,要加進 `web/lib/voice.ts` 的 union。

**順序很重要**:能力檢查要在分派之前,不能在各個工具函式裡各做各的——
那就退回成「每支路由自己記得寫」的老問題了。

### 3.5 預設拒絕(這條是整個 spec 的重點)

工具沒登記在 `TOOL_CAPABILITIES` → **擋下來**,不是放行。

未來新增一個 `get_monthly_expenses` 卻忘了登記,結果是這個工具**完全不能用**
(loud、400、訊息直說「尚未登記權限」),而不是「對所有人開放」。
這跟 `canAccessPagePath()` 對員工的「查不到一律 false」是同一個原則。

---

## 4. acl.ts 表格誠實化

`web/lib/acl.ts` 三處:

| 路徑 | 現在 | 改成 | 理由 |
|---|---|---|---|
| `/voice-lab-chat`(PAGE) | `open` | `sites` | 頁面已擋未登入;AI 只碰 sites 這格,員工老闆都該進得來 |
| `/api/voice`(API) | `open` | `sites` | 端點已擋未登入;真正的細粒度守衛在工具層 |
| `/api/voice-lab`(API) | `open` | `sites` | 同上(realtime-session / trace 都已自行擋未登入) |

`/voice-lab-realtime`(PAGE)若該路徑仍存在,一併確認:有 session 守衛就改 `sites`,
**若該頁不存在就把整列刪掉**(不要留死路徑在單一事實來源裡)。

改成 `sites` 對員工/老闆的可及性都是 true,**行為零變化**——這一節純粹是讓那張表
不再對自己說謊。表格上留一行註解說明「細粒度守衛在 lib/voice-tool-acl.ts」。

---

## 5. 工具清單依角色過濾

模型不該拿到它無權呼叫的工具:拿到了才被 403 擋,是把可預防的失敗推遲到執行期,
而且模型會在通話中對使用者講出一句莫名其妙的失敗說明。

`web/lib/voice-realtime-tools.ts`:

- `buildRealtimeTools(projects)` → `buildRealtimeTools(projects, role)`
- 依 `TOOL_CAPABILITIES` + `can(role, cap)` 過濾;`end_call` 沒有能力對應,永遠保留
- `web/app/api/voice-lab/realtime-session/route.ts` 已有 `session`,傳 `session.role` 進去

`web/lib/voice-agent-tools.ts`(Lab 2 文字版)做同樣的過濾,若它目前沒有取得 role
的管道,**這一小節可以留到下次**——但要在該檔案留一行 TODO 註解說明為什麼還沒做,
不要靜默略過。

**現況下這一節同樣行為零變化**(所有工具都是 `sites`,兩種角色都通過)。它是為了
下一批工具而先搭好的形狀。

---

## 6. 測試(`web/lib/__tests__/`)

`acl.test.ts` 已經有「走訪 app/ 目錄確保沒有路由漏登記」的先例。工具層照做:

新增 `voice-tool-acl.test.ts`:

1. **覆蓋率**:dispatcher 分派的每一個工具名,都能被 `capabilityForTool()`
   解析出非 null 的能力。工具名清單從 `voice-tool-acl.ts` 匯出一份 `KNOWN_TOOLS`,
   測試同時斷言它與 route 實際分派的清單一致(用字串比對 route.ts 原始碼裡的
   `tool === '...'`,跟 acl.test.ts 走檔案系統是同一種精神)。
2. **預設拒絕**:沒登記的工具名 → `capabilityForTool()` 回 null。
3. **propose_write**:`action: 'create_task'` → `'sites'`;沒給 action 或給
   不認識的 action → null。
4. **角色**:對一個假想的 `finance` 能力工具,`can('staff', 'finance')` 為 false、
   `can('boss', 'finance')` 為 true(這條是防止哪天有人把 `finance` 從
   `STAFF_DENIED` 拿掉而沒人發現)。
5. **工具過濾**:`buildRealtimeTools(projects, 'staff')` 與 `'boss'` 目前應等長
   (現有工具都是 sites);`end_call` 在兩種角色下都在。

現有測試不可退化:`voice-realtime-tools.test.ts` 因 `buildRealtimeTools` 簽章改變
需要同步更新。

---

## 7. 驗收

在 `web/` 下全綠:

```
npx tsc --noEmit
npm test
npm run build
```

行為驗收(手動,登入老闆帳號):語音通話講「幫我在某某案子記一筆」,
仍然照常寫入 —— 這一整份 spec 對現有功能應該是零行為變化。

---

## 8. 明確不做

- 不新增任何財務/標案/使用者管理的 AI 工具(那是下一批的事,前置條件正是本 spec)
- 不動兩階段 token / payload hash / 稽核
- 不動提示詞、不動 UI、不動 voice_traces
- 不做「AI 代替老闆執行員工無權的操作」這種提權設計——AI 的權限就是呼叫者的權限,沒有例外
