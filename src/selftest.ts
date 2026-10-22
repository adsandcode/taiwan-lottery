/**
 * Selftest: positive and negative controls for everything that gives an answer.
 *
 * Runs without the network, on real responses recorded from the official API
 * (fixtures/). Every prize tier is shown to be reached by a ticket that should
 * reach it and missed by a near miss; the parser is shown to refuse responses
 * that do not look like the official ones; every companion link is shown to
 * be on the allowlist. The CLI and the MCP server both run this before
 * answering anything, and refuse to answer if it fails.
 */

import { GAMES, GAME_IDS, resolveGame, type GameId } from "./games.js";
import {
  parseBingoLatest,
  parseBingoList,
  parseNextDrawDates,
  parseResultList,
  parseExceptionNotices,
  type Draw,
} from "./draws.js";
import { checkTicket, readTicket, type CheckResult } from "./rules.js";
import { frequencyStats, INDEPENDENCE_NOTE, INDEPENDENCE_NOTE_EN } from "./stats.js";
import { AI_TOOL_PAGE, ALLOWED_PATHS, COMPANION_SITE, INTENTS, isAllowedLink, moreLinks } from "./links.js";
import { addDays, addMonths, bingoDateFromPeriod, parseDate, parseMonth, taipei } from "./time.js";
import { LotteryClient, USER_AGENT, type FetchLike, type FetchResponseLike } from "./client.js";
import { LotteryService, NOTICE } from "./service.js";
import { InputError, NotFoundError, UpstreamError } from "./errors.js";
import { FIXTURE_FILES, fixtureResponse } from "./fixtures.js";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const J = (v: unknown) => JSON.stringify(v);

/** A stand-in for the official API that answers from the recorded fixtures. */
export function mockApi(fail?: "http500" | "rtcode" | "throw" | "hang" | "badjson") {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const ok = (body: unknown): FetchResponseLike => ({ ok: true, status: 200, json: async () => body });
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (fail === "throw") throw new Error("ECONNRESET");
    if (fail === "hang")
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    if (fail === "http500") return { ok: false, status: 500, json: async () => ({}) };
    if (fail === "badjson") return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } };
    if (fail === "rtcode") return ok({ rtCode: 99, rtMsg: "測試用錯誤訊息", content: null });
    const u = new URL(url);
    const endpoint = u.pathname.split("/").pop() ?? "";
    if (endpoint === "ExceptionNotice") return ok({ rtCode: 0, rtMsg: null, content: { exceptions: [] } });
    const file = FIXTURE_FILES[endpoint];
    if (!file) return { ok: false, status: 404, json: async () => ({}) };
    const body = fixtureResponse(file) as Json;
    const period = u.searchParams.get("period");
    const pageSize = Number(u.searchParams.get("pageSize") ?? "0");
    for (const key of Object.keys(body.content ?? {})) {
      if (!Array.isArray(body.content[key])) continue;
      let list = body.content[key] as Json[];
      if (period) list = list.filter((d) => String(d.period) === period);
      if (pageSize) list = list.slice(0, pageSize);
      body.content[key] = list;
      if (period) body.content.totalSize = list.length;
    }
    return ok(body);
  };
  return { fetch, calls };
}

/** Fixed clock: 2026-10-23 12:00 Taiwan time. */
export const FIXED_NOW = new Date("2026-10-23T04:00:00Z");

function fixtureDraws(game: GameId): Draw[] {
  const file = FIXTURE_FILES[GAMES[game].endpoint];
  return parseResultList(game, fixtureResponse(file)).draws;
}


export async function run(log: (s: string) => void = console.log): Promise<boolean> {
  let passed = 0;
  let failed = 0;
  const record = (ok: boolean, line: string) => {
    ok ? passed++ : failed++;
    log(`    [${ok ? "ok" : "FAIL"}] ${line}`);
  };
  const eq = (label: string, got: unknown, want: unknown) => {
    const ok = J(got) === J(want);
    record(ok, ok ? `${label}: ${J(got)}` : `${label}: got ${J(got)}, want ${J(want)}`);
  };
  const throws = async (label: string, fn: () => unknown, kind: new (message?: string) => Error, contains?: string) => {
    try {
      await fn();
      record(false, `${label}: did not throw`);
    } catch (err) {
      const ok = err instanceof kind && (!contains || (err as Error).message.includes(contains));
      record(ok, `${label}: ${(err as Error).name} ${ok ? "" : (err as Error).message}`.trim());
    }
  };

  // ---------------------------------------------------------------------
  log("  games and aliases");
  const aliasCases: [string, GameId | null][] = [
    ["539", "539"], ["今彩539", "539"], ["今彩", "539"], ["lotto649", "lotto649"], ["大樂透", "lotto649"],
    ["ＬＯＴＴＯ６４９", "lotto649"], ["威力彩", "superlotto"], ["Super Lotto", "superlotto"], ["super_lotto638", "superlotto"],
    ["3星彩", "3d"], ["三星彩", "3d"], ["4D", "4d"], ["四星彩", "4d"], ["39樂合彩", "39m"], ["49樂合彩", "49m"],
    ["38樂合彩", "38m"], ["雙贏彩", "lotto1224"], ["賓果賓果", "bingo"], ["BINGO BINGO", "bingo"], [" 539 ", "539"],
    ["今彩540", null], ["", null], ["樂透", null], ["lotto", null], ["彩券", null], ["1234", null], ["38", null],
  ];
  for (const [input, want] of aliasCases) eq(`resolve ${J(input)}`, resolveGame(input)?.id ?? null, want);
  record(GAME_IDS.every((id) => GAMES[id].id === id), "every game id maps to its own definition");

  // ---------------------------------------------------------------------
  log("  parsing recorded official responses");
  const d539 = fixtureDraws("539");
  eq("539 newest period/date", [d539[0].period, d539[0].date], [115000256, "2026-10-22"]);
  eq("539 numbers ascending", d539[0].numbers, [3, 8, 14, 23, 28]);
  eq("539 draw order", d539[0].draw_order, [3, 28, 23, 14, 8]);
  eq("539 prizes", d539[0].prizes?.map((p) => [p.tier, p.winners, p.prize_per_winner]), [
    ["頭獎", 4, 6000000], ["貳獎", 249, 20000], ["參獎", 7153, 300], ["肆獎", 74792, 50],
  ]);
  eq("539 redeem deadline", d539[0].redeem_deadline, "2027-01-22");
  eq("539 sorted newest first", d539.map((d) => d.period), [115000256, 115000255, 115000254, 115000253, 115000252]);

  const d649 = fixtureDraws("lotto649");
  eq("大樂透 main numbers (special excluded)", d649[0].numbers, [2, 5, 19, 33, 40, 43]);
  eq("大樂透 special number", d649[0].special_number, 6);
  eq("大樂透 draw order (special excluded)", d649[0].draw_order, [2, 43, 19, 33, 5, 40]);
  eq("大樂透 eight tiers in official order", d649[0].prizes?.map((p) => p.tier), ["頭獎", "貳獎", "參獎", "肆獎", "伍獎", "陸獎", "柒獎", "普獎"]);
  eq("大樂透 貳獎 published", d649[0].prizes?.[1], { tier: "貳獎", winners: 3, prize_per_winner: 1646654 });

  const dSuper = fixtureDraws("superlotto");
  eq("威力彩 first zone", dSuper[0].numbers, [1, 9, 10, 21, 22, 31]);
  eq("威力彩 second zone", dSuper[0].second_zone, 6);
  eq("威力彩 second zone may repeat a first-zone number (115000083)", [dSuper[2].numbers?.includes(6), dSuper[2].second_zone], [true, 6]);
  eq("威力彩 ten tiers", dSuper[0].prizes?.map((p) => p.tier), ["頭獎", "貳獎", "參獎", "肆獎", "伍獎", "陸獎", "柒獎", "捌獎", "玖獎", "普獎"]);

  const d3 = fixtureDraws("3d");
  eq("3星彩 digits in position order", d3[0].digits, [0, 7, 3]);
  eq("3星彩 壹獎 published", d3[0].prizes?.[0], { tier: "壹獎", winners: 45, prize_per_winner: 5000 });
  const d4 = fixtureDraws("4d");
  eq("4星彩 digits", d4[0].digits, [9, 1, 2, 6]);
  const d39 = fixtureDraws("39m");
  eq("39樂合彩 uses 今彩539 numbers of the same period", [d39[0].period, d39[0].numbers], [d539[0].period, d539[0].numbers]);
  eq("39樂合彩 tiers", d39[0].prizes?.map((p) => p.tier), ["二合", "三合", "四合"]);
  const d49 = fixtureDraws("49m");
  eq("49樂合彩 uses 大樂透 numbers without the special number", d49[0].numbers, d649[0].numbers);
  const d38 = fixtureDraws("38m");
  eq("38樂合彩 last recorded draw", [d38[0].period, d38[0].date, d38[0].numbers], [112000104, "2023-12-28", [7, 8, 18, 20, 23, 31]]);
  const d1224 = fixtureDraws("lotto1224");
  eq("雙贏彩 twelve numbers", [d1224[0].period, d1224[0].numbers?.length], [112000312, 12]);

  const bingoDay = parseBingoList(fixtureResponse("bingo.json"), "2026-10-22");
  eq("賓果 day list", [bingoDay.total, bingoDay.draws.map((d) => d.period)], [203, [115059885, 115059884, 115059883]]);
  eq("賓果 super number is the 20th drawn", [bingoDay.draws[0].super_number, bingoDay.draws[0].draw_order?.[19]], [23, 23]);
  eq("賓果 full-width hyphen means no 猜大小 result", [bingoDay.draws[0].big_small, bingoDay.draws[0].odd_even], [null, null]);
  const bingoLatest = parseBingoLatest(fixtureResponse("bingo-latest.json"));
  eq("賓果 latest", [bingoLatest.period, bingoLatest.date, bingoLatest.draw_time], [115059885, "2026-10-22", "23:55"]);
  const next = parseNextDrawDates(fixtureResponse("next-draw-date.json"));
  eq("next draw 今彩539", next.find((n) => n.gameCode === 5120), { gameCode: 5120, date: "2026-10-23" });
  eq("next draw 賓果 has a time", next.find((n) => n.gameCode === 1102), { gameCode: 1102, date: "2026-10-23", time: "07:05" });
  eq("next draw 大樂透 has a period", next.find((n) => n.gameCode === 5118)?.period, 115000099);
  eq("exception notices pass through", parseExceptionNotices({ rtCode: 0, content: { exceptions: [{ errorMessage: " 停止開獎 " }, {}] } }), ["停止開獎"]);

  // ---------------------------------------------------------------------
  log("  parser refuses responses that do not look official");
  const raw539 = () => fixtureResponse("539.json") as Json;
  const bad = (label: string, edit: (b: Json) => void, game: GameId = "539", file = "539.json") =>
    throws(label, () => {
      const b = fixtureResponse(file) as Json;
      edit(b);
      return parseResultList(game, b);
    }, UpstreamError);
  await throws("rtCode not 0", () => parseResultList("539", { ...raw539(), rtCode: 1, rtMsg: "x" }), UpstreamError, "x");
  await throws("no content", () => parseResultList("539", { rtCode: 0 }), UpstreamError);
  await bad("list is not an array", (b) => (b.content.daily539Res = "oops"));
  await bad("four numbers in 今彩539", (b) => b.content.daily539Res[0].drawNumberSize.pop());
  await bad("number 40 in 今彩539", (b) => (b.content.daily539Res[0].drawNumberSize[0] = 40));
  await bad("duplicate number", (b) => (b.content.daily539Res[0].drawNumberSize[1] = 3));
  await bad("draw order holds other numbers", (b) => (b.content.daily539Res[0].drawNumberAppear[0] = 39));
  await bad("missing date", (b) => delete b.content.daily539Res[0].lotteryDate);
  await bad("special number differs between the two arrays", (b) => (b.content.lotto649Res[0].drawNumberAppear[6] = 7), "lotto649", "lotto649.json");
  await bad("second zone 9", (b) => {
    b.content.superLotto638Res[0].drawNumberSize[6] = 9;
    b.content.superLotto638Res[0].drawNumberAppear[6] = 9;
  }, "superlotto", "superlotto.json");
  await bad("digit 12 in 3星彩", (b) => (b.content.lotto3DRes[0].drawNumberAppear[0] = 12), "3d", "3d.json");
  await throws("賓果 super number not the 20th", () => {
    const b = fixtureResponse("bingo.json") as Json;
    b.content.bingoQueryResult[0].bullEyeTop = "02";
    return parseBingoList(b, "2026-10-22");
  }, UpstreamError);
  eq("empty month is an empty list, not an error", parseResultList("539", { rtCode: 0, content: { totalSize: 0, daily539Res: [] } }).draws, []);

  // ---------------------------------------------------------------------
  log("  ticket checking against the official prize rules");
  const tier = (game: GameId, numbers: unknown, draw: Draw, second?: number): CheckResult =>
    checkTicket(game, readTicket(game, numbers, second), draw);
  const expectTier = (label: string, r: CheckResult, want: string | null, won: boolean | null = want !== null) =>
    eq(label, [r.tier, r.won], [want, won]);

  const t539 = d539[0]; // 03 08 14 23 28
  expectTier("539 頭獎 five of five", tier("539", [3, 8, 14, 23, 28], t539), "頭獎");
  expectTier("539 貳獎 four", tier("539", [3, 8, 14, 23, 1], t539), "貳獎");
  expectTier("539 參獎 three", tier("539", [3, 8, 14, 1, 2], t539), "參獎");
  expectTier("539 肆獎 two", tier("539", [3, 8, 1, 2, 4], t539), "肆獎");
  expectTier("539 one match wins nothing", tier("539", [3, 1, 2, 4, 5], t539), null);
  expectTier("539 no match wins nothing", tier("539", [1, 2, 4, 5, 6], t539), null);
  eq("539 rule wording", tier("539", [3, 8, 14, 1, 2], t539).rule, "對中當期獎號之其中任三碼");

  const t649 = d649[0]; // 02 05 19 33 40 43 + 06
  expectTier("大樂透 頭獎 six", tier("lotto649", [2, 5, 19, 33, 40, 43], t649), "頭獎");
  expectTier("大樂透 貳獎 five + special", tier("lotto649", [2, 5, 19, 33, 40, 6], t649), "貳獎");
  expectTier("大樂透 參獎 five", tier("lotto649", [2, 5, 19, 33, 40, 1], t649), "參獎");
  expectTier("大樂透 肆獎 four + special", tier("lotto649", [2, 5, 19, 33, 6, 1], t649), "肆獎");
  expectTier("大樂透 伍獎 four", tier("lotto649", [2, 5, 19, 33, 1, 3], t649), "伍獎");
  expectTier("大樂透 陸獎 three + special", tier("lotto649", [2, 5, 19, 6, 1, 3], t649), "陸獎");
  expectTier("大樂透 柒獎 two + special", tier("lotto649", [2, 5, 6, 1, 3, 4], t649), "柒獎");
  expectTier("大樂透 普獎 three", tier("lotto649", [2, 5, 19, 1, 3, 4], t649), "普獎");
  expectTier("大樂透 two without special wins nothing", tier("lotto649", [2, 5, 1, 3, 4, 7], t649), null);
  expectTier("大樂透 one + special wins nothing", tier("lotto649", [2, 6, 1, 3, 4, 7], t649), null);
  eq("大樂透 special matched flag", tier("lotto649", [2, 5, 6, 1, 3, 4], t649).special_matched, true);

  const tSup = dSuper[0]; // 01 09 10 21 22 31 + zone 2: 06
  const sup = (nums: number[], z: number) => tier("superlotto", nums, tSup, z);
  expectTier("威力彩 頭獎 6 + zone 2", sup([1, 9, 10, 21, 22, 31], 6), "頭獎");
  expectTier("威力彩 貳獎 6", sup([1, 9, 10, 21, 22, 31], 5), "貳獎");
  expectTier("威力彩 參獎 5 + zone 2", sup([1, 9, 10, 21, 22, 2], 6), "參獎");
  expectTier("威力彩 肆獎 5", sup([1, 9, 10, 21, 22, 2], 5), "肆獎");
  expectTier("威力彩 伍獎 4 + zone 2", sup([1, 9, 10, 21, 2, 3], 6), "伍獎");
  expectTier("威力彩 陸獎 4", sup([1, 9, 10, 21, 2, 3], 5), "陸獎");
  expectTier("威力彩 柒獎 3 + zone 2", sup([1, 9, 10, 2, 3, 4], 6), "柒獎");
  expectTier("威力彩 捌獎 2 + zone 2", sup([1, 9, 2, 3, 4, 5], 6), "捌獎");
  expectTier("威力彩 玖獎 3", sup([1, 9, 10, 2, 3, 4], 5), "玖獎");
  expectTier("威力彩 普獎 1 + zone 2", sup([1, 2, 3, 4, 5, 7], 6), "普獎");
  expectTier("威力彩 2 without zone 2 wins nothing", sup([1, 9, 2, 3, 4, 5], 5), null);
  expectTier("威力彩 zone 2 alone wins nothing", sup([2, 3, 4, 5, 7, 8], 6), null);
  expectTier("威力彩 1 without zone 2 wins nothing", sup([1, 2, 3, 4, 5, 7], 5), null);

  const t3 = d3[0]; // 0 7 3
  expectTier("3星彩 壹獎 all three", tier("3d", "073", t3), "壹獎");
  expectTier("3星彩 貳獎 tens and units, hundreds wrong", tier("3d", "173", t3), "貳獎");
  expectTier("3星彩 參獎 units only, hundreds and tens wrong", tier("3d", "183", t3), "參獎");
  expectTier("3星彩 hundreds and units, tens wrong: sources disagree, no tier", tier("3d", "083", t3), null, null);
  expectTier("3星彩 units wrong wins nothing", tier("3d", "074", t3), null);
  expectTier("3星彩 nothing right wins nothing", tier("3d", [9, 9, 9], t3), null);
  const t4 = d4[0]; // 9 1 2 6
  expectTier("4星彩 壹獎", tier("4d", "9126", t4), "壹獎");
  expectTier("4星彩 貳獎 last three", tier("4d", "0126", t4), "貳獎");
  expectTier("4星彩 參獎 last two", tier("4d", "0026", t4), "參獎");
  expectTier("4星彩 thousands and last two, hundreds wrong: no tier", tier("4d", "9026", t4), null, null);
  expectTier("4星彩 units wrong wins nothing", tier("4d", "9125", t4), null);
  expectTier("4星彩 tens wrong wins nothing", tier("4d", "9136", t4), null);

  expectTier("39樂合彩 二合", tier("39m", [3, 8], d39[0]), "二合");
  expectTier("39樂合彩 三合", tier("39m", [3, 8, 14], d39[0]), "三合");
  expectTier("39樂合彩 四合", tier("39m", [3, 8, 14, 23], d39[0]), "四合");
  expectTier("39樂合彩 三合 with one miss wins nothing", tier("39m", [3, 8, 1], d39[0]), null);
  eq("39樂合彩 play named by count", tier("39m", [3, 8, 1], d39[0]).play, "三合");
  expectTier("49樂合彩 二合", tier("49m", [2, 43], d49[0]), "二合");
  expectTier("49樂合彩 the 大樂透 special number does not count", tier("49m", [2, 6], d49[0]), null);
  expectTier("38樂合彩 五合", tier("38m", [7, 8, 18, 20, 23], d38[0]), "五合");
  expectTier("38樂合彩 二合 miss", tier("38m", [7, 9], d38[0]), null);

  const t1224 = d1224[0].numbers!;
  const others1224 = Array.from({ length: 24 }, (_, i) => i + 1).filter((n) => !t1224.includes(n));
  expectTier("雙贏彩 頭獎 twelve", tier("lotto1224", t1224, d1224[0]), "頭獎");
  expectTier("雙贏彩 頭獎 zero", tier("lotto1224", others1224, d1224[0]), "頭獎");
  expectTier("雙贏彩 貳獎 eleven", tier("lotto1224", [...t1224.slice(0, 11), others1224[0]], d1224[0]), "貳獎");
  expectTier("雙贏彩 貳獎 one", tier("lotto1224", [t1224[0], ...others1224.slice(0, 11)], d1224[0]), "貳獎");
  expectTier("雙贏彩 肆獎 three", tier("lotto1224", [...t1224.slice(0, 3), ...others1224.slice(0, 9)], d1224[0]), "肆獎");
  expectTier("雙贏彩 six wins nothing", tier("lotto1224", [...t1224.slice(0, 6), ...others1224.slice(0, 6)], d1224[0]), null);

  const bingoCheck = tier("bingo", [23, 2, 49, 1], bingoLatest);
  eq("賓果 matches only, no tier", [bingoCheck.matched, bingoCheck.super_number_matched, bingoCheck.won, bingoCheck.rules_implemented], [[2, 23, 49], true, null, false]);

  log("  ticket input is validated before anything else");
  await throws("539 with four numbers", () => readTicket("539", [1, 2, 3, 4]), InputError, "5 個");
  await throws("539 with 40", () => readTicket("539", [1, 2, 3, 4, 40]), InputError, "40");
  await throws("539 with a duplicate", () => readTicket("539", [1, 2, 3, 4, 4]), InputError, "重複");
  await throws("大樂透 with seven numbers", () => readTicket("lotto649", [1, 2, 3, 4, 5, 6, 7]), InputError);
  await throws("威力彩 without second zone", () => readTicket("superlotto", [1, 2, 3, 4, 5, 6]), InputError, "第二區");
  await throws("威力彩 second zone 9", () => readTicket("superlotto", [1, 2, 3, 4, 5, 6], 9), InputError);
  await throws("second zone on 今彩539", () => readTicket("539", [1, 2, 3, 4, 5], 3), InputError);
  await throws("3星彩 with two digits", () => readTicket("3d", "07"), InputError);
  await throws("3星彩 with a letter", () => readTicket("3d", "0a3"), InputError);
  await throws("39樂合彩 with one number", () => readTicket("39m", [3]), InputError);
  await throws("39樂合彩 with five numbers", () => readTicket("39m", [1, 2, 3, 4, 5]), InputError);
  await throws("賓果 with eleven numbers", () => readTicket("bingo", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), InputError);
  await throws("not a number", () => readTicket("539", [1, 2, 3, 4, 2.5]), InputError);
  eq("string with spaces and zeros", readTicket("539", "03 08 14 23 28").numbers, [3, 8, 14, 23, 28]);
  eq("string with commas and full-width digits", readTicket("539", "３,８,14,23,28").numbers, [3, 8, 14, 23, 28]);
  eq("3星彩 digits keep a leading zero", readTicket("3d", "0 7 3").numbers, [0, 7, 3]);
  eq("3星彩 digits may repeat", readTicket("3d", "777").numbers, [7, 7, 7]);

  // ---------------------------------------------------------------------
  log("  frequency statistics");
  const synth = (period: number, numbers: number[]): Draw => ({ game: "539", period, date: "2026-01-01", numbers });
  const s = frequencyStats("539", [synth(3, [1, 2, 7, 8, 9]), synth(5, [1, 2, 3, 4, 5]), synth(4, [1, 2, 3, 4, 6])]);
  const count = (n: number) => s.frequency.find((c) => c.number === n);
  eq("draws analysed and window", [s.draws_analyzed, s.window?.to.period, s.window?.from.period], [3, 5, 3]);
  eq("one entry per number 1-39", [s.frequency.length, s.frequency[0].number, s.frequency[38].number], [39, 1, 39]);
  eq("counts", [count(1)?.count, count(3)?.count, count(5)?.count, count(10)?.count], [3, 2, 1, 0]);
  eq("draws since last seen (0 = newest draw)", [count(5)?.draws_since_last_seen, count(6)?.draws_since_last_seen, count(7)?.draws_since_last_seen, count(10)?.draws_since_last_seen], [0, 1, 2, null]);
  eq("most frequent: count, then smaller number", s.most_frequent, [1, 2, 3, 4, 5]);
  eq("least frequent: zeros first, smaller number first", s.least_frequent, [10, 11, 12, 13, 14]);
  record(s.disclaimer === INDEPENDENCE_NOTE && INDEPENDENCE_NOTE.includes("獨立") && INDEPENDENCE_NOTE_EN.includes("independent"), "every stats result carries the independence note");
  const real = frequencyStats("539", d539);
  eq("real 539 window: most frequent", real.most_frequent, [4, 8, 15, 28, 36]);
  eq("real 539 window: since last seen", [8, 4, 36, 10, 2].map((n) => real.frequency.find((c) => c.number === n)?.draws_since_last_seen), [0, 1, 2, 4, null]);
  const s3 = frequencyStats("3d", [
    { game: "3d", period: 2, date: "2026-01-02", digits: [7, 7, 1] },
    { game: "3d", period: 1, date: "2026-01-01", digits: [0, 7, 3] },
  ]);
  eq("3星彩 digit counted at every position", s3.frequency.find((c) => c.number === 7)?.count, 3);
  eq("3星彩 per position (拾 has 7 twice)", s3.by_position?.[1].counts.find((c) => c.number === 7)?.count, 2);
  const sSup = frequencyStats("superlotto", dSuper);
  eq("威力彩 second zone counted separately", [sSup.second_zone_frequency?.length, sSup.second_zone_frequency?.find((c) => c.number === 6)?.count], [8, 2]);
  const s649 = frequencyStats("lotto649", d649);
  eq("大樂透 special number not in main frequency", [s649.frequency.find((c) => c.number === 6)?.count, s649.special_number_frequency?.find((c) => c.number === 6)?.count], [2, 1]);

  // ---------------------------------------------------------------------
  log("  companion links");
  eq("tool page", AI_TOOL_PAGE, `${COMPANION_SITE}/lottery/ai-tool/`);
  record(new Set(ALLOWED_PATHS).size === ALLOWED_PATHS.length, "allowlist has no duplicates");
  const used = new Set<string>();
  let allLinksOk = true;
  for (const id of GAME_IDS)
    for (const intent of INTENTS) {
      const links = moreLinks(id, intent);
      const ok =
        links.length >= 1 && links.length <= 3 &&
        links.every((l) => isAllowedLink(l.url) && l.title.length > 0) &&
        new Set(links.map((l) => l.url)).size === links.length;
      if (!ok) {
        allLinksOk = false;
        record(false, `${id} ${intent}: ${J(links)}`);
      }
      links.forEach((l) => used.add(l.url.slice(COMPANION_SITE.length)));
    }
  record(allLinksOk, `every game x tool gives 1-3 allowlisted links (${GAME_IDS.length * INTENTS.length} combinations)`);
  eq("every allowlisted path is reachable from some tool", ALLOWED_PATHS.filter((p) => !used.has(p)), []);
  eq("大樂透 check links to its check page first", moreLinks("lotto649", "check")[0].url.slice(COMPANION_SITE.length), "/lottery/lotto649/check/");
  eq("今彩539 check falls back to rules (no check page)", moreLinks("539", "check")[0].url.slice(COMPANION_SITE.length), "/lottery/539/rules/");
  eq("今彩539 stats link to hot-cold", moreLinks("539", "stats")[0].url.slice(COMPANION_SITE.length), "/lottery/539/hot-cold/");
  eq("3星彩 has only its game page", moreLinks("3d", "stats").map((l) => l.url.slice(COMPANION_SITE.length)), ["/lottery/3d/"]);
  for (const [label, url] of [
    ["other host", "https://example.com/lottery/539/"],
    ["http instead of https", COMPANION_SITE.replace("https:", "http:") + "/lottery/539/"],
    ["path not on the list", `${COMPANION_SITE}/lottery/539/wheel/`],
    ["path traversal", `${COMPANION_SITE}/lottery/539/../`],
    ["host suffix trick", `${COMPANION_SITE}.evil.test/lottery/539/`],
    ["missing trailing slash", `${COMPANION_SITE}/lottery/539`],
  ] as const)
    record(!isAllowedLink(url), `refuse ${label}`);

  // ---------------------------------------------------------------------
  log("  dates in Taiwan time");
  eq("16:30 UTC is the next day in Taiwan", taipei(new Date("2026-10-22T16:30:00Z")).date, "2026-10-23");
  eq("15:59 UTC is still the same day", taipei(new Date("2026-10-22T15:59:00Z")).date, "2026-10-22");
  eq("month arithmetic across a year", [addMonths("2026-01", -1), addMonths("2025-12", 1), addMonths("2026-10", -12)], ["2025-12", "2026-01", "2025-10"]);
  eq("day arithmetic across a month", [addDays("2026-03-01", -1), addDays("2024-02-28", 1)], ["2026-02-28", "2024-02-29"]);
  await throws("month 13", () => parseMonth("2026-13"), InputError);
  await throws("February 30", () => parseDate("2026-02-30"), InputError);
  await throws("date without dashes", () => parseDate("20261022"), InputError);
  eq("賓果 period to date", [115059885, 115000001, 115000203, 115000204].map(bingoDateFromPeriod), ["2026-10-22", "2026-01-01", "2026-01-01", "2026-01-02"]);
  eq("賓果 period out of range", [bingoDateFromPeriod(12345), bingoDateFromPeriod(115000000)], [null, null]);

  // ---------------------------------------------------------------------
  log("  tools against a mocked official API (no network)");
  const fresh = (fail?: Parameters<typeof mockApi>[0], now = () => FIXED_NOW, timeoutMs?: number) => {
    const api = mockApi(fail);
    const client = new LotteryClient({ fetch: api.fetch, now, timeoutMs });
    return { api, client, service: new LotteryService(client) };
  };
  const linksOk = (r: { more: { url: string }[] }) => r.more.length >= 1 && r.more.length <= 3 && r.more.every((l) => isAllowedLink(l.url));

  {
    const { api, service } = fresh();
    const latest = await service.latestDraw({ game: "今彩539" });
    eq("latest 今彩539", [latest.game, latest.draw.period, latest.weekday], ["539", 115000256, "週四"]);
    eq("one request, current and previous month, page size 1", api.calls.map((c) => c.url.split("/Lottery/")[1]), [
      "Daily539Result?period=&month=2026-09&endMonth=2026-10&pageNum=1&pageSize=1",
    ]);
    record(api.calls[0].headers["User-Agent"] === USER_AGENT && USER_AGENT.startsWith("mcp-server-taiwan-lottery/"), "User-Agent names the package");
    record(latest.notes.includes(NOTICE) && latest.notes.some((n) => n.includes("21:30")), "result says official announcements prevail and explains the lag");
    record(linksOk(latest), "latest result has allowlisted more links");
    await service.latestDraw({ game: "539" });
    eq("second identical call is served from cache", api.calls.length, 1);
  }
  {
    const { api, service } = fresh();
    await Promise.all([service.latestDraw({ game: "539" }), service.latestDraw({ game: "539" })]);
    eq("identical requests in flight share one fetch", api.calls.length, 1);
  }
  {
    let now = FIXED_NOW.getTime();
    const { api, service } = fresh(undefined, () => new Date(now));
    await service.latestDraw({ game: "539" });
    await service.listDraws({ game: "539", month: "2026-08" });
    now += 6 * 60_000;
    await service.latestDraw({ game: "539" });
    await service.listDraws({ game: "539", month: "2026-08" });
    eq("after 6 minutes: current month refetched, finished month still cached", api.calls.length, 3);
  }
  {
    const { api, service } = fresh();
    const byPeriod = await service.getDraw({ game: "539", period: "115000255" });
    eq("get_draw by period", [byPeriod.draw.period, byPeriod.draw.date], [115000255, "2026-10-21"]);
    record(api.calls[0].url.includes("period=115000255"), "period is passed to the API");
    const byDate = await service.getDraw({ game: "今彩539", date: "2026-10-20" });
    eq("get_draw by date", byDate.draw.period, 115000254);
    await throws("no draw on a Sunday", () => service.getDraw({ game: "539", date: "2026-10-18" }), NotFoundError, "週一至週六");
    await throws("future date", () => service.getDraw({ game: "539", date: "2026-10-30" }), InputError);
    await throws("unknown period", () => service.getDraw({ game: "539", period: 115999999 }), NotFoundError);
    await throws("neither period nor date", () => service.getDraw({ game: "539" }), InputError);
    await throws("賓果 by date alone", () => service.getDraw({ game: "bingo", date: "2026-10-22" }), InputError, "203");
    const bingoByPeriod = await service.getDraw({ game: "賓果賓果", period: 115059884 });
    eq("賓果 by period finds the right day", [bingoByPeriod.draw.period, bingoByPeriod.draw.date, bingoByPeriod.draw.super_number], [115059884, "2026-10-22", 15]);
  }
  {
    const { service } = fresh();
    const month = await service.listDraws({ game: "539", month: "2026-10" });
    eq("list by month", [month.count, month.draws[0].period, "prizes" in month.draws[0]], [5, 115000256, false]);
    eq("list last 3", (await service.listDraws({ game: "539", last_n: 3 })).draws.map((d) => d.period), [115000256, 115000255, 115000254]);
    eq("list default is last 10", (await service.listDraws({ game: "539" })).query, { last_n: 10 });
    await throws("month and last_n together", () => service.listDraws({ game: "539", month: "2026-10", last_n: 3 }), InputError);
    await throws("last_n over 100", () => service.listDraws({ game: "539", last_n: 101 }), InputError);
    await throws("month for 賓果", () => service.listDraws({ game: "bingo", month: "2026-10" }), InputError);
    await throws("date for 今彩539", () => service.listDraws({ game: "539", date: "2026-10-22" }), InputError);
    await throws("future month", () => service.listDraws({ game: "539", month: "2026-11" }), InputError);
    eq("賓果 by date", (await service.listDraws({ game: "bingo", date: "2026-10-22" })).count, 3);
  }
  {
    const { api, service } = fresh();
    await throws("bad ticket fails before any request", () => service.checkTicket({ game: "539", numbers: [1, 2, 3] }), InputError);
    await throws("unknown game fails before any request", () => service.latestDraw({ game: "樂透" }), InputError, "539");
    eq("no request was made for invalid input", api.calls.length, 0);
    const c649 = await service.checkTicket({ game: "大樂透", numbers: "02 05 19 33 40 06" });
    eq("check 大樂透 latest", [c649.period, c649.tier, c649.special_matched, c649.published_prize_per_winner], [115000098, "貳獎", true, 1646654]);
    record(c649.notes.some((n) => n.includes("115000098")) && c649.notes.includes(NOTICE), "check says which draw it used");
    record(linksOk(c649) && c649.more[0].url.endsWith("/lottery/lotto649/check/"), "check links to the companion check page");
    const cSup = await service.checkTicket({ game: "superlotto", numbers: [1, 9, 10, 21, 22, 31], second_zone: 6 });
    eq("check 威力彩 頭獎 with nobody else winning shows no amount", [cSup.tier, cSup.published_prize_per_winner], ["頭獎", undefined]);
    const cPast = await service.checkTicket({ game: "539", numbers: [4, 8, 15, 18, 28], period: 115000255 });
    eq("check a given period", [cPast.period, cPast.tier, cPast.published_prize_per_winner], [115000255, "頭獎", 8000000]);
    const cBingo = await service.checkTicket({ game: "bingo", numbers: [23, 2, 49] });
    eq("check 賓果 latest: matches only", [cBingo.period, cBingo.matched_count, cBingo.won], [115059885, 3, null]);
  }
  {
    const { api, service } = fresh();
    const st = await service.numberStats({ game: "539", last_n: 5 });
    eq("stats over 5 draws", [st.draws_analyzed, st.most_frequent], [5, [4, 8, 15, 28, 36]]);
    eq("stats asks for enough months in one request", api.calls.map((c) => c.url.split("/Lottery/")[1]), [
      "Daily539Result?period=&month=2026-09&endMonth=2026-10&pageNum=1&pageSize=5",
    ]);
    record(st.notes[0] === INDEPENDENCE_NOTE, "stats result starts with the independence note");
    const st200 = await service.numberStats({ game: "539", last_n: 200 });
    eq("200 draws: one range request, a second only when the first came back short", api.calls.length, 3);
    record(api.calls[1].url.includes("month=2025-12&endMonth=2026-10") && api.calls[1].url.includes("pageSize=200"), "200 draws of 今彩539 ask for 11 months at once");
    record(st200.notes.some((n) => n.includes("只找到 5 期")), "says when fewer draws were found than asked");
    await throws("stats last_n over 200", () => service.numberStats({ game: "539", last_n: 201 }), InputError);
  }
  {
    const { service } = fresh();
    const sch = await service.drawSchedule({ game: "539" });
    eq("schedule 今彩539", [sch.draw_days, sch.draw_time, sch.next_draw], ["週一至週六", "20:30（台灣時間）", { date: "2026-10-23", weekday: "週五" }]);
    const schBingo = await service.drawSchedule({ game: "bingo" });
    eq("schedule 賓果", [schBingo.draw_time, schBingo.next_draw?.time], ["07:05~23:55，每 5 分鐘一期", "07:05"]);
    const sch38 = await service.drawSchedule({ game: "38m" });
    eq("schedule of a game not in the official schedule", [sch38.active, sch38.draw_days, sch38.next_draw], [false, null, null]);
    record(linksOk(sch), "schedule has allowlisted more links");
  }
  {
    const { api, service } = fresh();
    const l38 = await service.latestDraw({ game: "38樂合彩" });
    eq("38樂合彩 latest comes from its last month", [l38.draw.period, api.calls[0].url.includes("month=2023-11&endMonth=2023-12")], [112000104, true]);
    record(l38.notes[0].includes("不在台灣彩券目前的開獎時程"), "and says it is not in the current schedule");
    const lb = await service.latestDraw({ game: "bingo" });
    eq("賓果 latest", [lb.draw.period, lb.draw.draw_time], [115059885, "23:55"]);
  }
  {
    const { service } = fresh("http500");
    await throws("HTTP 500 is reported, not hidden", () => service.latestDraw({ game: "539" }), UpstreamError, "HTTP 500");
    const sch = await service.drawSchedule({ game: "539" });
    eq("schedule still answers from the official schedule when the API is down", [sch.draw_days, sch.next_draw], ["週一至週六", null]);
    record(sch.notes.some((n) => n.includes("暫時查不到")), "and says the next draw date is unavailable");
  }
  await throws("API error message is passed on", () => fresh("rtcode").service.latestDraw({ game: "539" }), UpstreamError, "測試用錯誤訊息");
  await throws("network failure", () => fresh("throw").service.latestDraw({ game: "539" }), UpstreamError, "連不上");
  await throws("not JSON", () => fresh("badjson").service.latestDraw({ game: "539" }), UpstreamError, "不是 JSON");
  await throws("timeout", () => fresh("hang", () => FIXED_NOW, 30).service.latestDraw({ game: "539" }), UpstreamError, "秒");

  log(`  ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (process.argv[1] && /selftest\.js$/.test(process.argv[1])) {
  run().then((ok) => process.exit(ok ? 0 : 2));
}
