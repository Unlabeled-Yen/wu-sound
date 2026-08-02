# AI 供應商依環境變數自動切換,順序是資料治理決定,不是技術選型

`lib/ai-extract.ts` 與 `lib/ai-quote.ts` 都是「有 `ANTHROPIC_API_KEY` 就走 Anthropic,否則退回 Kimi(Moonshot)」。這個優先順序不是效能或成本考量,是刻意的資料治理安排。

**背景**:收據辨識會把員工拍的收據照片送到 AI 供應商的伺服器。Kimi(Moonshot)是中國公司,測試階段用 Yen 自己的資料沒問題,但正式上線後這些收據可能含老闆(台灣公司)的真實財務資訊,是否接受這些影像流向中國供應商,是老闆本人的資料治理決定,不是工程團隊能代為拍板的。詳見 [[wu-sound-fde-kimi-governance]] 記憶。

**設計結果**:只要正式環境的 `ANTHROPIC_API_KEY` 有填,系統會自動全部改走 Anthropic,不用改一行程式碼——這個「填 key 就切換」的機制本身,就是特意設計成給老闆一個不需要懂技術的治理開關。

**尚未解決**:截至目前,正式上線前是否要讓老闆看過並同意 Kimi 路徑,或者直接預設要求填 Anthropic key 才能上線,還沒有最終決定,見 `docs/open-questions.md`。
