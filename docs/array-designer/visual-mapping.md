# 視覺化 ↔ 系統計算 對應表

> 這份文件把畫布上每一個視覺元素,對回它背後的物理公式、程式碼位置、驗證方式。
> 目的:之後改任何一條線之前,先查這裡,不要再靠肉眼猜形狀。
>
> 座標系:陣列沿 X 軸展開(y=0 為陣列線),觀眾席方向為 +Y(往下)。
> 符號沿用 McCarthy 教科書慣例:`S`=間距、`β`=張角、`φ`=覆蓋角、`D`=距離、`N`=數量。

---

## 驗證方法論(為什麼這次的結構是對的)

前幾輪的畫法(Min/Max 一條線、Unity 三角形)是**照著截圖用肉眼猜的**,猜錯了兩次。

這輪改用**真執行**:把原軟體 `draw_diagram` 方法綁到一個假的 `canvas` 物件上,讓它真的跑,記錄每一次 `create_line`/`create_text`/`create_polygon` 呼叫的**真實座標與顏色鍵**。這樣拿到的是原軟體自己算出來的答案,不是重建。

腳本位置:`develop/uncoupled-array-mcp/dev/execute_draw_diagram.py`
測試參數:`N=5, D=3, φ=120°`(對照使用者截圖),結果逐項吻合:`Min:1.5m / Max:3.0m / Unity:3.0m / Limit:6.0m / Aud:3.0m`。

---

## 對應表

| 視覺元素 | 顏色 | 幾何定義 | 公式 | 計算層代碼 | 繪圖層代碼 | 驗證狀態 |
|---|---|---|---|---|---|---|
| **喇叭符號** | 白/ink | 梯形圖示,隨 `β` 旋轉 | 純圖示,無公式 | — | `ArrayCoverageDiagram.tsx` positions.map | 目視對照 |
| **覆蓋錐** | 灰(coverage) | 每支喇叭 ±φ/2 方向射出的邊界線 | `angle = ±φ/2 + tiltDeg` | `lib/array-designer.ts` (無獨立函式,幾何在繪圖層算) | 同上 | 目視對照 |
| **喇叭中心虛線** | 淡灰 | 喇叭正下方到 Limit 深度的垂直虛線 | — | — | 同上 | 目視對照 |
| **D 間距標註** | 淡灰 | 陣列中央相鄰兩支喇叭的間距 | `S`(輸入或算出) | `spacingM` | 同上 | golden 驗證 |
| **Aud/觀眾席線** | 紫(audience) | 橫貫全畫布,觀眾席深度 | `audienceDistM`(輸入) | 直接輸入值 | 同上 | golden 驗證 |
| **Min 橫線(背景參考)** | 橙(minMax) | 橫貫全畫布,`dMin` 深度 | `val_min = (S/2)·cot((φ-β)/2)` | `calcProjectedRange()` | 同上 | **golden 驗證(3000+ 組含 β≠0)** |
| **Max 橫線(背景參考)** | **灰(limit,不是橙!)** | 橫貫全畫布,`dMax` 深度 | `val_max = d_max · h(φ,β)`(查表插值) | `calcProjectedRange()` | 同上 | **ground truth 座標實測(2026-07-28 修正:原誤植橙色)** |
| **覆蓋錐邊線終點深度** | 灰(coverage) | 每支喇叭的錐邊線只畫到 `dMax`,不是 `limitDepthM` | 同 `val_max` | 同上 | 同上 | **ground truth 座標實測(2026-07-28 修正:原誤用 limitDepthM×1.15)** |
| **Min 垂直箭頭** | 橙(minMax) | 雙箭頭,從陣列線(y=0)到 `dMin` | 同上 | 同上 | 同上 | **ground truth 座標實測** |
| **Max 垂直箭頭** | 橙(minMax) | 單箭頭,**接續 Min 箭頭終點**畫到 `dMax`(不是從 0 重畫) | 同上 | 同上 | 同上 | **ground truth 座標實測** |
| **Min 圓點標記** | 橙 | 每支喇叭正下方,`dMin` 深度上的小圓點 | — | — | 同上 | 目視對照 |
| **Unity 射線(黃段)** | 黃(unity) | 陣列幾何中心(0,0)發出,角度 `±φ/2`,畫到 `dMin` 深度 | 角度=`φ/2`(**不是** arctan(sin(φ/2))——上一輪猜錯的角度) | — | 同上 | **ground truth 座標實測** |
| **Limit 射線(灰段)** | 灰(limit) | **接續 Unity 射線終點**,同角度繼續畫到 `dMax` 深度 | 同一條直線,顏色分段於 `dMin` 轉折 | — | 同上 | **ground truth 座標實測** |
| **Unity 文字標籤** | 黃 | 放在射線轉折點附近 | 顯示值 = `unityDistM`(**原始物理值**,非射線視覺終點深度) | `unity_dist_6db_m` = `get_d_unity(S,β,φ)` | 同上 | golden 驗證 |
| **Limit 文字標籤** | 灰 | 放在射線末端附近 | 顯示值 = `limitDepthM`(**原始物理值**,非射線視覺終點深度) | `limit_depth_m` = `get_d_max(S,β,φ)` | 同上 | golden 驗證,對截圖 6.0m 精確吻合 |
| **X/Y 軸線** | 亮灰(axis) | 十字準線,貫穿世界原點 | — | — | 同上 | 目視對照 |
| **Y 軸刻度數字** | 淡灰 | 隨 zoom/pan 即時更新的可視範圍刻度 | `getVisibleWorldBounds()` | — | 同上 | 目視對照 |
| **網格** | 深灰 | SVG `<pattern>` 無限平鋪 | 對齊世界座標,不受 zoom/pan 限制 | — | 同上 | 功能測試(縮放/平移驗證過) |

---

## 三個關鍵易混淆點(之前踩過的坑)

### 1. Unity/Limit 文字數值 ≠ 射線視覺終點深度

`Unity: 3.0m` 顯示的是 `unityDistM`(原始 `d_unity`),但黃色射線段只畫到 `dMin`(1.5m)為止。
`Limit: 6.0m` 顯示的是 `limitDepthM`(原始 `d_max`),但灰色射線段只畫到 `dMax`(3.0m 投影值)為止,**不會真的畫到 6.0m 那麼深**。

這是原軟體自己的標註方式——標籤是「這條射線代表的物理量」,不是「這條射線畫到哪裡」。乾淨室重製時完整保留了這個(不直覺但正確的)行為。

### 2. Min/Max 是接力,不是各自獨立

Max 箭頭的**起點是 Min 箭頭的終點**,不是從 y=0 重新畫。畫錯的話兩段會重疊或斷開。

### 3. Unity 角度是 φ/2,但目標深度不是 unityDistM

第一次重建時把角度跟目標深度搞混:用了正確角度(φ/2)配錯誤深度(unityDistM),或用錯誤角度(arctan(sin(φ/2)))配正確深度。正解是:**角度 = φ/2,射線终點深度 = dMin 接 dMax**,跟 unityDistM/limitDepthM 這兩個文字標籤數值完全脫鉤。

---

## 2026-07-29 補充:用非退化參數重跑後的三個結構性修正

第一輪 ground truth 用的是 φ=120°/S=5.196 的案例,剛好 val_max、d_unity、觀眾席
都退化成同一個數字(3.0),分不清楚每個視覺元素到底錨定在哪一個量上。這輪換成
φ=90°/S=7.1(四個深度量彼此都不同:val_min=3.55、d_unity=5.02、val_max=7.10、
d_max_raw=10.04),重跑同一支 harness 後,推翻/修正了三件事:

1. **Min 深度點的位置**:不是「每支喇叭正下方」,是**每個相鄰喇叭的中點**
   (含陣列最左、最右外側各補一個,共 N+1 個點),顏色是 `unity`(黃)不是
   `result`(橙)。物理意義:這些點是相鄰喇叭 -3dB 邊緣真正交會的位置。
2. **Max 橫線跟 Min 橫線不同色**:Min 用 `result`(橙),Max 用 `limit`(灰)。
3. **Unity/Limit 射線的起點,不是恆定的陣列幾何中心 (0,0)**:N 為偶數時陣列
   中心根本沒有喇叭。真值顯示實際發射線的是「最靠近中心的 1 支(N 奇)或 2 支
   (N 偶)喇叭」,各自往左右兩側射一條到相鄰喇叭方向。第一輪剛好用奇數 N=5
   測試,(0,0) 湊巧等於中央喇叭位置,掩蓋了這個問題。

同一輪也用「逐一關閉五個圖層開關 + diff canvas 呼叫」的方法,把 Grid/Lines/
Coords/Angles/Coverage 五個開關實際控制的元素完整對出來(見下表),推翻了 Wu
原本按直覺分組的版本(例如 Coverage 開關原本只控制淡色填充,實際上它是覆蓋錐
+ Min 點 + Unity/Limit 射線的總開關)。

| 開關 | 實際控制的元素 |
|---|---|
| Grid | 網格 pattern + X/Y 十字軸線 + 刻度數字(同一開關,不是分開的) |
| Lines | 觀眾席線、Min/Max 水平參考線、Min/Max 垂直箭頭+標籤 |
| Coords | 每支喇叭下方的 (x,y) 座標文字 |
| Angles | 每支喇叭上方的角度文字 |
| Coverage | 覆蓋錐(邊線+中心虛線)、Min 深度點、Unity/Limit 射線+標籤 |

驗證方法:`develop/uncoupled-array-mcp/dev/execute_draw_diagram2.py`(N=4,
S=7.1,φ=90 案例,逐一切換五個布林開關並 diff canvas 呼叫)。

## 2026-07-29 β≠0 弧線視覺化修正

前面所有視覺元素的座標運算都假設 β=0(喇叭排成直線),β≠0 時整個繪圖層結構
性錯誤:喇叭應在弧線上、Min/Max 應是弧線、中心虛線應跟著喇叭軸向。修正內容:

1. **`speakerPositions()`**:β≠0 時用弧線幾何擺位,R = S/(2·sin(β/2)),
   位置 (R·sin(kβ), R·(1−cos(kβ)))。S=5/β=18.8° 驗算 → (±4.9, 0.8)/(±9.3, 3.2)
   精確吻合原軟體截圖座標標籤。
2. **Min/Max 參考線**:β≠0 時改用 SVG 弧線(圓弧半徑 R−dMin / R−dMax,圓心
   在世界座標 (0, R)),β=0 時退回水平直線。
3. **Min 深度點**:β≠0 時擺在 Min 弧線上的中點角度位置,不再擺在直線中點。
4. **喇叭中心虛線**:β≠0 時沿喇叭軸向 (sin(tilt), cos(tilt)) 延伸,不再垂直。
5. **Unity/Limit 射線**:射線角度考慮中心喇叭的 tilt,用 (dMin−cs.y)/cos(rayAngle)
   計算深度截距,β=0 時退化為原公式。
6. **座標標籤**:改為跟著各自喇叭位置排列(per-speaker),不再全域固定高度——
   β=0 時效果不變(所有喇叭同高);β≠0 時標籤跟著弧線走。
7. **worldW/worldH**:用實際 speaker positions 的 extent 計算,不再用 (N−1)·S。

驗證:tsc 0 錯誤、vitest 3955/3955、瀏覽器目視 Splay 分頁(β=18.8°)弧線形
狀與原軟體截圖結構一致。計算層未動——5081 golden + 3950 TS golden 全部不受影響。

**這一輪的驗證方法後來被推翻**:上面第 1 點的座標「精確吻合」只比對了數字的
絕對值跟小數點後一位,沒注意到 y 的正負號——實際上只是巧合看起來對,肉眼掃過
去沒發現。第 2 點的 Min/Max 弧線公式(半徑 R∓dMin/dMax、圓心 (0,R))完全是
憑幾何直覺推的,從未真執行原軟體驗證過。使用者質疑「視覺化呈現需要精準表現出
數值的計算」後,下一輪(見下方 2026-07-29 二次修正)改用「真執行原軟體
bytecode 逐句反編譯」的方法重新推導,才發現這兩點都是錯的。

## 2026-07-29 二次修正:β≠0 幾何結構性錯誤(真執行 bytecode 逆向驗證)

上一輪的「弧線視覺化修正」肉眼看起來像弧線,但座標系統是錯的,推翻重做:

1. **`speakerPositions()` 的 y 正負號錯了**:β≠0 時喇叭應該往**後**彎(遠離
   觀眾席,y 是負值),不是往前彎(y 正值)。真執行原軟體 `draw_diagram`
   (bytecode oracle,綁假 canvas 記錄真實座標,見
   `develop/uncoupled-array-mcp/dev/execute_draw_diagram_beta.py`)取得的
   ground truth:S=5/β=18.83° 時外側喇叭座標標籤是 `(±9.3, -3.2)`、
   `(±4.9, -0.8)`,不是先前以為的 `(±9.3, 3.2)`。幾何上對應圓心在
   `(0, -R)` 的圓弧(焦點在陣列**後方**),不是 `(0, R)`。公式改為
   `y = -R·(1-cos(kβ))`。這個符號錯誤會讓整個陣列、覆蓋錐、中心虛線全部
   往錯的方向彎,是這輪最主要的結構性 bug。
2. **「Min/Max 背景參考線」根本不是用 val_min/val_max 畫的弧線**:逐句反編譯
   `draw_diagram` 內部函式 `make_arc_points` 才發現,畫布上那條虛線背景參考
   (黃色/灰色)實際上是「最外側喇叭的覆蓋錐邊線,在 `unityDistM`(黃色)或
   `limitDepthM`(灰色)深度處的端點軌跡」——**跟 val_min/val_max(顯示在
   `Min: X.Xm`/`Max: X.Xm` 文字標籤旁那組垂直雙箭頭)是兩個不同的量**,只有
   β=0 時因為代數恆等式 `D_unity·cos(φ/2) = val_min` 而數值上重合,β≠0 時
   會分岔。真正的公式(見 `lib/array-designer.ts::depthMarker`,已用 N=5/
   S=5/φ=110/β=18.83° 案例對 ground truth 座標驗證到 <0.01m):
   - β=0:退化成一條**有限寬度**的水平線(不是貫穿全畫布!),
     `depth = dist·cos(φ/2弧度)`,寬度端點 `= ±[(N-1)S/2 + dist·sin(φ/2弧度)]`。
   - β≠0:圓弧,圓心 `(0, -R)`(跟喇叭弧同一焦點),半徑 = 「最外側喇叭位置
     沿覆蓋錐邊線走 dist 深度」的端點到圓心的距離(不是簡單的 `R±dist`)。
3. **`Min: X.Xm`/`Max: X.Xm` 垂直雙箭頭本身沒問題**:文字標籤跟箭頭終點座標
   確認就是用 val_min/val_max(`calcProjectedRange`)算的,這部分維持原樣。
4. **Min 深度上的圓點標記、Unity/Limit 射線**:這兩個元素的精確公式**尚未
   逐句反編譯驗證完**——只是把圓心從 `(0,R)` 改成 `(0,-R)` 讓它們不再跟喇叭
   反方向彎,不是 ground truth 驗證過的最終公式。已知跟 ground truth 有
   數十公分等級的偏差。**列為已知待補項**(→ 已於同日第三輪補完,見下節)。

驗證:tsc 0 錯誤、vitest 3966/3966(新增 `depthMarker` 測試對 ground truth
座標精確到小數點後 6 位)、瀏覽器目視 Splay 分頁確認喇叭正確往後彎、Min/Max
虛線正確呈弧形。計算層(golden 驗證的 5081+3950 組)完全未動。

## 2026-07-29 三輪:已知缺口全數補完(逐句反編譯,零猜測)

把上節第 3、4 點的待補項逐句反編譯到底,結果不只補完缺口,還推翻了第 3 點
「垂直箭頭本身沒問題」的判斷,並意外找到 val_max 的精確閉合式:

1. **Unity 圓點(黃)——精確公式**(`lib/array-designer.ts::unityDots`):
   每支喇叭沿自己覆蓋錐左右邊線走 `unityDistM`(原始 D_unity,**不是**投影
   val_min)的兩個點:`speaker + Du·(sin(tilt±φ/2), cos(tilt±φ/2))`。相鄰
   喇叭的相向邊線在 unity 深度精確交會(這就是 unity 的定義),所以 2N 個點
   重疊繪製後視覺上是 N+1 個。先前「相鄰喇叭中點」的描述只在 β=0 時湊巧等價。
2. **Unity/Limit 射線——精確定義**(`lib/array-designer.ts::unityRays`):
   發射端 = N 奇 → 中央 1 支((N-1)//2);N 偶 → 中央 2 支(N/2-1, N/2)。
   每支沿 tilt±φ/2 發 2 條。黃段 = **沿射線距離** 0→D_unity,灰段 =
   D_unity→d_max(原始值)。先前用「深度截距 (dMin−y)/cos(角度)」是錯的
   ——用的量錯(val_min vs D_unity)、投影方式也錯(垂直深度 vs 沿射線距離)。
3. **Min/Max 垂直箭頭的轉折深度 ≠ 標籤數值**(β≠0 時):
   - `Min:` 標籤值 = val_min(gap_depth_val = Du·cos((φ−β)/2),精確等於
     val_min 閉合式),但箭頭轉折點深度 = **gap arc 弧頂** =
     `−R + √(R²+Du²+2·R·Du·cos(φ/2))`(`minArrowDepthM`)。β=0 時兩者重合,
     β≠0 時分岔(範例案例:標籤 2.4m、箭頭轉折 2.24m)。原軟體本來就這樣
     ——又一個「標籤示物理量、圖形示幾何位置」的脫鉤設計。
   - `Max:` 標籤與箭頭終點共用 `limit_depth_val`,而它就是 val_max(見下)。
4. **val_max 精確閉合式(重大副產物)**:draw_diagram 的 `limit_depth_val`
   構造 = `−R + √(R² + d_max² + 2·R·d_max·cos(φ/2))`(R = S/(2·sin(β/2)),
   β=0 極限 = d_max·cos(φ/2))。對舊 oracle 探測表全網格比對最大相對差
   8.9e-6,殘差全部來自舊表只存 6 位小數——**即此式為精確解**。原本
   KNOWN_GAPS 記載的「val_max 無閉合式、查表插值 0.11% 誤差」正式作廢,
   `calcProjectedRange` 已改用閉合式,70 行插值表刪除。3950 組 oracle
   golden 直接驗證閉合式與原軟體一致(全綠)。

驗證:tsc 0 錯誤、vitest 3976/3976(新增 unityDots/unityRays/minArrowDepthM/
val_max 閉合式測試,全部錨定真執行 draw_diagram 的 ground truth 座標)、
瀏覽器 Splay(β=18.8°)與 Auto Mode(β=0)雙分頁確認。至此**畫布上所有視覺
元素的幾何公式全部有 bytecode 級驗證,無任何憑直覺推論的殘留**。

**這次的教訓**:肉眼比對截圖「看起來像」不是驗證,連續兩輪(這次跟更早的
Unity/Limit 三角形誤判)都示範了同一個坑。之後改任何視覺元素之前,先查這份
文件有沒有 ground truth 腳本可以真執行比對,沒有就先寫一個,不要用眼睛掃過去
覺得「差不多對」就結案。

## Auto Mode 手動覆寫(P1-1)—— 誠實標注:未經 ground truth 驗證

Wu 新增了 Rec. Quantity / Rec. Spacing 的手動覆寫(對照原軟體 spinner + Auto
按鈕)。**這個功能的重算邏輯是推論出來的,不是像上面的視覺元素那樣有 ground
truth 驗證過**——原軟體是本機 GUI,沒有暴露這個互動路徑的 API 或 bytecode 可
以黑盒探測。目前實作邏輯(`array-designer.ts::autoModeWithOverride`):

- 覆寫 Spacing、Quantity 維持 Auto → 用新 S 重新 solve N(等同「Quantity 分頁」
  固定 S 求 N 的邏輯)
- 覆寫 Quantity、Spacing 維持 Auto → S 不變,只有覆蓋寬度用新 N 重算
- 兩者都覆寫 → 都不重算,只有覆蓋寬度與 Range 隨之重算

若之後能取得原軟體實測(例如錄影逐步操作 spinner 的畫面),應優先以那個為準。

## 程式碼位置速查

| 檔案 | 內容 |
|---|---|
| `web/lib/array-designer.ts` | 物理計算層:`autoMode`/`tabQuantity`/`tabUnity`/`tabSpacing`/`tabSplay`,含 `limitDepthM`/`dMaxM` |
| `web/app/tools/array-designer/ArrayCoverageDiagram.tsx` | 繪圖層:上表所有視覺元素的座標運算與 SVG 渲染 |
| `develop/uncoupled-array-mcp/dev/execute_draw_diagram.py` | 逆向工具:真執行原軟體 `draw_diagram` 取得 ground truth |
| `develop/uncoupled-array-mcp/KNOWN_GAPS.md` | 物理計算層的驗證覆蓋率記錄(5081+3950 組 golden) |
