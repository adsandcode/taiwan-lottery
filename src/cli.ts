#!/usr/bin/env node
/**
 * taiwan-lottery command line.
 *
 *   taiwan-lottery latest <game>
 *   taiwan-lottery draw <game> --period <n> | --date <YYYY-MM-DD>
 *   taiwan-lottery list <game> [--month YYYY-MM | --last N | --date YYYY-MM-DD]
 *   taiwan-lottery check <game> <numbers...> [--second N] [--period N]
 *   taiwan-lottery stats <game> [--last N]
 *   taiwan-lottery schedule <game>
 *   taiwan-lottery games
 *
 * Exit codes: 0 done, 1 no such draw in the official data (yet),
 * 2 bad arguments, the official API failed, or the selftest failed.
 * The selftest runs before any answer is given.
 */

import { GAMES, GAME_IDS, type GameId } from "./games.js";
import { LotteryService } from "./service.js";
import { InputError, NotFoundError } from "./errors.js";
import { formatCheck, formatDraw, formatList, formatSchedule, formatStats } from "./format.js";
import { run as runSelftest } from "./selftest.js";
import { VERSION } from "./version.js";

const USAGE = `taiwan-lottery ${VERSION}: 台灣彩券官方開獎資料查詢（Taiwan Lottery official draw results）

用法：
  taiwan-lottery latest <遊戲>                         最新一期
  taiwan-lottery draw <遊戲> --period <期別>            指定期別
  taiwan-lottery draw <遊戲> --date <YYYY-MM-DD>        指定日期
  taiwan-lottery list <遊戲> [--month YYYY-MM | --last N | --date YYYY-MM-DD]
  taiwan-lottery check <遊戲> <號碼...> [--second N] [--period N]
  taiwan-lottery stats <遊戲> [--last N]               歷史出現次數（預設 30 期）
  taiwan-lottery schedule <遊戲>                        開獎時間
  taiwan-lottery games                                  列出遊戲代號
  taiwan-lottery --selftest | --help | --version
  加上 --json 輸出 JSON。

遊戲：${GAME_IDS.join(", ")}（也可以打中文名，例如 今彩539、大樂透、威力彩）

結束代碼：0 完成，1 官方資料沒有這一期（或還沒更新），2 參數錯誤、官方 API 失敗或自我測試失敗。`;

const VALUE_FLAGS = new Set(["--period", "--date", "--month", "--last", "--second"]);
const BOOL_FLAGS = new Set(["--json", "--help", "--version", "--selftest"]);

function parseArgs(argv: string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const [name, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    if (VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) throw new InputError(`${name} 後面要接一個值。`);
      flags.set(name, value);
    } else if (BOOL_FLAGS.has(name) && inline === undefined) {
      flags.set(name, true);
    } else {
      throw new InputError(`不認得的選項 ${a}。`);
    }
  }
  return { positional, flags };
}

const str = (v: string | true | undefined) => (typeof v === "string" ? v : undefined);
const num = (v: string | true | undefined) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v === undefined ? undefined : v);

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(`taiwan-lottery: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { positional, flags } = parsed;
  if (flags.has("--help")) {
    console.log(USAGE);
    return 0;
  }
  if (flags.has("--version")) {
    console.log(VERSION);
    return 0;
  }
  if (flags.has("--selftest")) {
    if (argv.length !== 1) {
      console.error("taiwan-lottery: --selftest 不能和其他參數一起用。");
      return 2;
    }
    console.log("taiwan-lottery selftest：用錄下來的官方回應測解析、對獎、統計與連結，不連網路。");
    const ok = await runSelftest();
    console.log(ok ? "selftest passed" : "selftest FAILED");
    return ok ? 0 : 2;
  }

  const [command, game, ...rest] = positional;
  if (!command) {
    console.error(USAGE);
    return 2;
  }
  if (command === "games") {
    for (const id of GAME_IDS) {
      const g = GAMES[id];
      console.log(`${id.padEnd(10)} ${g.name}${g.active ? "" : "（已不在官方開獎時程，歷史資料到 " + g.lastMonth + "）"}　別名：${g.aliases.join("、")}`);
    }
    return 0;
  }

  // Answers only after the selftest has shown the parser and the prize rules still work.
  const lines: string[] = [];
  if (!(await runSelftest((s) => lines.push(s)))) {
    console.error("taiwan-lottery: selftest failed, refusing to answer.");
    console.error(lines.join("\n"));
    return 2;
  }

  const service = new LotteryService();
  const json = flags.has("--json");
  try {
    if (!game) throw new InputError("請指定遊戲，例如 539、大樂透、威力彩。");
    if (rest.length && command !== "check") throw new InputError(`多出來的參數：${rest.join(" ")}`);
    let out: unknown;
    let textOut: string;
    switch (command) {
      case "latest": {
        const r = await service.latestDraw({ game });
        out = r;
        textOut = formatDraw({ ...r, game: r.game as GameId });
        break;
      }
      case "draw": {
        const r = await service.getDraw({ game, period: num(flags.get("--period")), date: str(flags.get("--date")) });
        out = r;
        textOut = formatDraw({ ...r, game: r.game as GameId });
        break;
      }
      case "list": {
        const r = await service.listDraws({
          game,
          month: str(flags.get("--month")),
          last_n: num(flags.get("--last")),
          date: str(flags.get("--date")),
        });
        out = r;
        textOut = formatList({ ...r, game: r.game as GameId });
        break;
      }
      case "check": {
        if (!rest.length) throw new InputError("請輸入號碼，例如：taiwan-lottery check 539 03 08 14 23 28");
        const numbers = rest.join(" ");
        const r = await service.checkTicket({
          game,
          numbers,
          second_zone: num(flags.get("--second")),
          period: num(flags.get("--period")),
        });
        out = r;
        textOut = formatCheck({ ...r, game: r.game as GameId });
        break;
      }
      case "stats": {
        const r = await service.numberStats({ game, last_n: num(flags.get("--last")) });
        out = r;
        textOut = formatStats({ ...r, game: r.game as GameId });
        break;
      }
      case "schedule": {
        const r = await service.drawSchedule({ game });
        out = r;
        textOut = formatSchedule({ ...r, game: r.game as GameId });
        break;
      }
      default:
        throw new InputError(`不認得的指令 ${command}。`);
    }
    console.log(json ? JSON.stringify(out, null, 2) : textOut);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ error: message, kind: err instanceof InputError ? "input" : err instanceof NotFoundError ? "not_found" : "upstream" }, null, 2));
    else console.error(`taiwan-lottery: ${message}`);
    if (err instanceof InputError) {
      if (!json) console.error("\n" + USAGE.split("\n").slice(2, 12).join("\n"));
      return 2;
    }
    return err instanceof NotFoundError ? 1 : 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error("taiwan-lottery: fatal", err);
    process.exitCode = 2;
  },
);
