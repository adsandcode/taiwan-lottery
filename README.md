# mcp-server-taiwan-lottery

讓 AI 助理和程式直接查台灣彩券的官方開獎結果：最新一期、歷史開獎、對獎、號碼出現次數、開獎時間。號碼全部來自台灣彩券官方 API，查不到就說查不到，不會自己補。

說明與完整開獎資料：[playsport539.com](https://playsport539.com/lottery/ai-tool/)

一個套件兩種用法：MCP 伺服器（給 Claude 這類 AI 助理用），以及指令列工具 `taiwan-lottery`（給腳本、排程用）。

## 能做什麼

- 查某個遊戲最新一期的號碼、特別號（大樂透）或第二區（威力彩）、本期各獎項的中獎注數與每注獎金
- 用期別或日期查某一期；那天沒開獎會直接告訴你哪幾天才開
- 列出某個月，或最近 N 期的號碼
- 對獎：輸入你的號碼，回答對中哪幾個、是哪一個獎項，並附上官方的中獎條件原文
- 統計最近 N 期每個號碼出現幾次、隔了幾期沒開
- 開獎日、開獎時間，以及官方 API 給的下一期開獎日

每個結果都有 `more` 欄位，附 1 到 3 個 playsport539.com 的相關頁面（歷史開獎、統計、對獎、開獎時間），想看完整資料可以點過去。

## 支援的遊戲

| 代號 | 遊戲 | 也可以打 | 對獎會判定的獎項 | 開獎 |
|---|---|---|---|---|
| `539` | 今彩539 | 今彩、daily539 | 頭獎、貳獎、參獎、肆獎 | 週一至週六 20:30 |
| `lotto649` | 大樂透 | 649 | 頭獎到柒獎、普獎（特別號自動比對） | 週二、週五 20:30 |
| `superlotto` | 威力彩 | super_lotto638 | 頭獎到玖獎、普獎（要給第二區號碼） | 週一、週四 20:30 |
| `3d` | 3星彩 | 三星彩 | 壹獎、貳獎、參獎（有一種組合不判定，見下方） | 週一至週六 20:30 |
| `4d` | 4星彩 | 四星彩 | 壹獎、貳獎、參獎（同上） | 週一至週六 20:30 |
| `39m` | 39樂合彩 | 39_m5 | 二合、三合、四合 | 用今彩539的號碼 |
| `49m` | 49樂合彩 | 49_m6 | 二合、三合、四合 | 用大樂透的號碼（不含特別號） |
| `bingo` | 賓果賓果 | 賓果 | 只列出對中的號碼，不判定獎項 | 每天 07:05 到 23:55，每 5 分鐘一期 |
| `38m` | 38樂合彩 | 38_m6 | 二合到五合 | 已不在官方開獎時程，資料到 2023-12 |
| `lotto1224` | 雙贏彩 | 1224 | 頭獎到肆獎 | 已不在官方開獎時程，資料到 2023-12 |

中文名稱直接打就可以，例如「今彩539」「大樂透」「威力彩」。

## 安裝

需要 Node.js 18 以上。不需要任何 API 金鑰。

### Claude Desktop

在 `claude_desktop_config.json` 加上：

```json
{
  "mcpServers": {
    "taiwan-lottery": { "command": "npx", "args": ["-y", "mcp-server-taiwan-lottery"] }
  }
}
```

### Claude Code

```sh
claude mcp add taiwan-lottery -- npx -y mcp-server-taiwan-lottery
```

### 指令列

```sh
npx -y -p mcp-server-taiwan-lottery taiwan-lottery latest 539
```

或是 `npm install -g mcp-server-taiwan-lottery` 之後直接打 `taiwan-lottery`。

## 指令列範例

以下都是實際執行的輸出（2026-10-23 早上，台灣時間）。

```
$ taiwan-lottery latest 539
今彩539　第 115000256 期　2026-10-22（週四）
開獎號碼（由小到大）：03 08 14 23 28
開出順序：03 28 23 14 08
獎項（本期官方公布）：
  頭獎          4 注　每注 6,000,000 元
  貳獎        249 注　每注 20,000 元
  參獎      7,153 注　每注 300 元
  肆獎     74,792 注　每注 50 元
銷售金額：32,953,350 元
兌獎期限：2027-01-22

說明：
  - 官方資料不是即時的：台灣彩券官網常見問題寫明每晚 21:30 公告獎號、22:00 公告開獎結果。開獎後 20 分鐘以上還查不到當期是正常的，請稍後再查。
  - 資料取自台灣彩券官方 API，一切以台灣彩券官方公告為準。

更多：
  今彩539開獎號碼  https://playsport539.com/lottery/539/
  今彩539歷史開獎  https://playsport539.com/lottery/539/history/
```

```
$ taiwan-lottery check 大樂透 02 05 19 07 11 25
大樂透　第 115000098 期　2026-10-20
你的號碼：02 05 19 07 11 25
開獎號碼：02 05 19 33 40 43　特別號 06
對中：02 05 19（3 個）
結果：普獎（對中當期獎號之任三碼）
本期普獎每注：400 元（官方公布）

說明：
  - 沒有指定期別，這裡對的是官方資料裡最新的一期（第 115000098 期，2026-10-20）。請確認和彩券上的期別相同。
  - 官方資料不是即時的：台灣彩券官網常見問題寫明每晚 21:30 公告獎號、22:00 公告開獎結果。開獎後 20 分鐘以上還查不到當期是正常的，請稍後再查。
  - 對獎結果僅供參考，兌獎以彩券本身及台灣彩券官方兌獎結果為準。
  - 資料取自台灣彩券官方 API，一切以台灣彩券官方公告為準。

更多：
  大樂透對獎  https://playsport539.com/lottery/lotto649/check/
  大樂透玩法與獎項  https://playsport539.com/lottery/lotto649/rules/
  大樂透開獎號碼  https://playsport539.com/lottery/lotto649/
```

```
$ taiwan-lottery schedule 威力彩
威力彩 開獎時間
開獎日：週一、週四
時間：20:30（台灣時間）
下一期：2026-10-26（週一）　第 115000086 期
官網公布：台灣彩券官網每晚 21:30 公告當日獎號、22:00 公告開獎結果
來源：https://www.taiwanlottery.com/run_lottery/schedule/ https://www.taiwanlottery.com/customer_service/faq/

說明：
  - 官方資料不是即時的：台灣彩券官網常見問題寫明每晚 21:30 公告獎號、22:00 公告開獎結果。開獎後 20 分鐘以上還查不到當期是正常的，請稍後再查。
  - 資料取自台灣彩券官方 API，一切以台灣彩券官方公告為準。

更多：
  威力彩開獎時間  https://playsport539.com/lottery/superlotto/schedule/
  威力彩玩法與獎項  https://playsport539.com/lottery/superlotto/rules/
  威力彩開獎號碼  https://playsport539.com/lottery/superlotto/
```

```
$ taiwan-lottery stats 539 --last 30
今彩539　最近 30 期的歷史出現次數（2026-09-18 第 115000227 期 ～ 2026-10-22 第 115000256 期）
出現最多：30 14 08 20 34
出現最少：37 11 12 35 07
號碼:次數/上次出現
  01: 3次/2期前    02: 5次/8期前    03: 5次/0期前    04: 3次/1期前    05: 4次/13期前
  06: 4次/9期前    07: 2次/12期前   08: 6次/0期前    09: 4次/5期前    10: 2次/4期前
  11: 1次/13期前   12: 1次/3期前    13: 5次/7期前    14: 7次/0期前    15: 5次/1期前
  16: 5次/3期前    17: 4次/12期前   18: 4次/1期前    19: 4次/7期前    20: 6次/4期前
  21: 2次/10期前   22: 2次/3期前    23: 4次/0期前    24: 4次/5期前    25: 4次/5期前
  26: 4次/4期前    27: 3次/11期前   28: 5次/0期前    29: 3次/14期前   30: 9次/2期前
  31: 3次/11期前   32: 5次/4期前    33: 4次/14期前   34: 6次/6期前    35: 1次/28期前
  36: 3次/2期前    37: 0次/未開     38: 5次/2期前    39: 3次/4期前

說明：
  - 每一期開獎都是獨立的隨機事件，過去出現的次數不能預測下一期。以下只是歷史出現次數的統計。
  - 資料取自台灣彩券官方 API，一切以台灣彩券官方公告為準。

更多：
  今彩539號碼出現次數統計  https://playsport539.com/lottery/539/hot-cold/
  今彩539歷史開獎  https://playsport539.com/lottery/539/history/
  今彩539開獎號碼  https://playsport539.com/lottery/539/
```

「0期前」是最新一期有開出，「未開」是這 30 期都沒有開出。

```
$ taiwan-lottery draw 539 --date 2026-10-18
taiwan-lottery: 2026-10-18（週日）沒有今彩539的開獎資料。今彩539的開獎日是週一至週六。
```

完整用法：

```
taiwan-lottery latest <遊戲>
taiwan-lottery draw <遊戲> --period <期別> | --date <YYYY-MM-DD>
taiwan-lottery list <遊戲> [--month YYYY-MM | --last N | --date YYYY-MM-DD]
taiwan-lottery check <遊戲> <號碼...> [--second N] [--period N]
taiwan-lottery stats <遊戲> [--last N]
taiwan-lottery schedule <遊戲>
taiwan-lottery games
taiwan-lottery --selftest | --help | --version
```

加上 `--json` 會輸出 JSON。威力彩對獎用 `--second` 給第二區號碼，3星彩、4星彩直接打數字，例如 `taiwan-lottery check 3d 073`。

| 結束代碼 | 意思 |
|---|---|
| 0 | 完成（包含「沒中獎」） |
| 1 | 官方資料沒有這一期，或還沒更新 |
| 2 | 參數錯誤、官方 API 失敗，或自我測試沒過 |

## MCP 工具

| 工具 | 輸入 | 回傳 |
|---|---|---|
| `latest_draw` | `game` | 最新一期：期別、日期、號碼（由小到大與開出順序）、特別號或第二區、本期各獎項注數與每注獎金 |
| `get_draw` | `game`，加 `period` 或 `date` | 指定的一期。賓果賓果一天 203 期，要給期別 |
| `list_draws` | `game`，加 `month`（YYYY-MM）或 `last_n`（最多 100，預設 10）；賓果賓果用 `date` | 多期的號碼（不含獎金表） |
| `check_ticket` | `game`、`numbers`，威力彩加 `second_zone`，可選 `period`（預設最新一期） | 對中的號碼、獎項名稱、官方中獎條件原文、該期這個獎項的每注獎金 |
| `number_stats` | `game`、`last_n`（預設 30，最多 200） | 每個號碼的出現次數、隔幾期沒開、出現最多與最少的號碼，附「每期獨立」的說明 |
| `draw_schedule` | `game` | 開獎日與時間、官方 API 的下一期開獎日、官方公告、官網公布結果的時間 |

全部是唯讀工具。輸入有誤、查無此期、官方 API 失敗時，回傳 `isError`，`kind` 分別是 `input`、`not_found`、`upstream`，訊息是中文。

伺服器啟動時會先跑一次自我測試（用錄下來的官方回應，不連網路），測試沒過就拒絕啟動。指令列也一樣，先過自我測試才回答。

## 資料來源與延遲

- 資料來源：台灣彩券官方 API `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/`。用到的端點（`Daily539Result`、`Lotto649Result`、`SuperLotto638Result`、`3DResult`、`4DResult`、`39M5Result`、`49M6Result`、`38M6Result`、`Lotto1224Result`、`BingoResult`、`LatestBingoResult`、`NextDrawDate`、`ExceptionNotice`）是從 www.taiwanlottery.com 網頁的 JavaScript 找出來的，2026-10-23 逐一實際呼叫確認過。
- **官方資料會延遲。** 台灣彩券官網常見問題寫明：官網每晚 21:30 公告當日獎號、22:00 公告開獎結果。20:30 開獎之後，API 有一段時間查不到當期是正常的；2026-08-22 那天 20:30 的一期，到 20:53 API 還沒有。這個工具查不到就回報查不到，不會用其他網站的號碼補上。
- 對 API 很客氣：同樣的查詢 5 分鐘內直接用記憶體裡的結果（已結束的月份留 12 小時）、User-Agent 寫明套件名稱、每次請求 15 秒逾時、統計最近 200 期也只發一次請求（用 API 本身的月份區間參數），最多兩次。
- 38樂合彩、雙贏彩不在官方目前的開獎時程裡（官方的下一期開獎清單沒有這兩個遊戲），API 最後一個有資料的月份是 2023-12。查得到歷史，但不會有新的一期。

## 對獎規則從哪裡來

獎項名稱與中獎條件照抄台灣彩券官網的遊戲介紹頁（這些頁面由 JavaScript 產生，條文在頁面載入的程式裡）：

| 遊戲 | 官方頁面 |
|---|---|
| 今彩539 | https://www.taiwanlottery.com/lotto/info/daily_cash/ |
| 大樂透 | https://www.taiwanlottery.com/lotto/info/lotto649/ |
| 威力彩 | https://www.taiwanlottery.com/lotto/info/super_lotto638/ |
| 3星彩 | https://www.taiwanlottery.com/lotto/info/3_d/ |
| 4星彩 | https://www.taiwanlottery.com/lotto/info/4_d/ |
| 39樂合彩 | https://www.taiwanlottery.com/lotto/info/39_m5/ |
| 49樂合彩 | https://www.taiwanlottery.com/lotto/info/49_m6/ |
| 賓果賓果（不判定獎項） | https://www.taiwanlottery.com/lotto/info/bingo_bingo/ |
| 38樂合彩、雙贏彩 | 官網歷史開獎頁的獎項標示：https://www.taiwanlottery.com/lotto/history/history_result/ |

開獎日來自 https://www.taiwanlottery.com/run_lottery/schedule/ ，20:30 開獎與 21:30、22:00 公布時間來自 https://www.taiwanlottery.com/customer_service/faq/ ，賓果賓果的 07:05 到 23:55 每 5 分鐘來自 https://www.taiwanlottery.com/lotto/result/bingo_bingo/ 。

幾個要知道的地方：

- **每注獎金一律用該期官方公布的數字**，不用規則頁的獎金表。兩者不一定相同，例如 39樂合彩二合，規則頁寫每注 1,125 元，第 115000256 期官方公布的是 1,500 元。
- **3星彩、4星彩有一種組合不判定。** 3星彩「佰位對中、拾位沒中、個位對中」，4星彩「仟位對中、佰位沒中、拾位個位對中」：官網遊戲介紹頁的獎項表裡不符合任何一個獎項，但官網「對獎小幫手」的判斷方式會算中獎。兩個官方來源說法不同，所以工具回傳 `won: null` 並說明原因。
- **樂合彩用選幾個號碼決定玩法**：選 2 個是二合、3 個是三合，以此類推，要全部對中才算中。系統組合或系統配號的彩券請把每一注分開對。
- **賓果賓果**有基本玩法（1 到 10 星）、超級獎號、猜大小、猜單雙，獎金依玩法、星數、對中個數而定，工具只列出對中的號碼和有沒有對中超級獎號，`won` 是 `null`。

## 每一期都是獨立的

`number_stats` 只是把過去開出的號碼數一數。每一期開獎都是獨立的隨機事件，過去出現的次數不能預測下一期，出現得多的號碼不會比較容易再開，很久沒開的號碼也不會「該開了」。工具每次回傳統計都會附上這段說明。

## 聲明

- 這是開源的資料查詢工具，不是台灣彩券官方產品，和台灣彩券公司沒有關係。
- 一切以台灣彩券官方公告為準。對獎結果僅供參考，兌獎以彩券本身與官方兌獎結果為準。
- 只提供官方開獎資訊，不提供任何選號建議。

## 開發

```sh
npm install
npm run build
npm run selftest              # 解析、對獎、統計、連結，用錄下的官方回應，不連網路
node scripts/smoke.mjs        # 用 MCP 用戶端實際連伺服器、實際跑指令列（API 換成錄下的回應）
node scripts/check-publish-ready.mjs
node scripts/live-check.mjs   # 真的呼叫官方 API，每個遊戲一次（不在 CI 裡跑）
node scripts/record-fixtures.mjs  # API 格式改了才需要重錄 fixtures/
```

## English

`mcp-server-taiwan-lottery` is an MCP server and CLI for official Taiwan Lottery (台灣彩券) draw results. It reads the official API at `api.taiwanlottery.com` and nothing else, and never fills in numbers the API does not have.

- Tools: `latest_draw`, `get_draw`, `list_draws`, `check_ticket`, `number_stats`, `draw_schedule`. All read only.
- Games: `539`, `lotto649`, `superlotto`, `3d`, `4d`, `39m`, `49m`, `bingo`, plus `38m` and `lotto1224` (no longer drawn; history to 2023-12). Chinese names are accepted.
- Install: `npx -y mcp-server-taiwan-lottery` as an MCP server (stdio), or `npx -y -p mcp-server-taiwan-lottery taiwan-lottery latest 539` on the command line. Node.js 18 or later, no API key.
- The official data lags: the official FAQ says the site publishes the numbers at 21:30 and the prize results at 22:00 Taiwan time for the 20:30 draw. Missing the newest draw for a while after 20:30 is normal.
- `check_ticket` names the prize tier using the official game rules (pages linked above) and shows the per-ticket amount published for that draw. For BINGO BINGO it returns matches only.
- `number_stats` counts past draws only. Each draw is independent; past frequency does not predict future draws.
- Official announcements prevail. This is not an official Taiwan Lottery product.
- Every result has `more`: one to three links to playsport539.com for fuller history and statistics.

## 授權

MIT
