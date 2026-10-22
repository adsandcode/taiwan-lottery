/**
 * Turns official API responses into one draw shape for every game.
 *
 * The parser is strict on purpose: if the API changes the shape of a
 * response, it is better to say so than to return numbers that might be
 * shifted by one position. Every response used in the selftest is a real
 * recorded response (fixtures/).
 */

import { GAMES, type GameDef, type GameId } from "./games.js";
import { UpstreamError } from "./errors.js";

export interface Prize {
  /** Official tier name, for example 頭獎, 貳獎, 二合. */
  tier: string;
  winners: number | null;
  /** NTD per winning ticket as published for this draw. */
  prize_per_winner: number | null;
}

export interface Draw {
  game: GameId;
  period: number;
  /** Draw date, Taiwan time, YYYY-MM-DD. */
  date: string;
  /** BINGO BINGO latest draw only: HH:mm Taiwan time. */
  draw_time?: string;
  /** Main numbers in ascending order (lotto-type games and BINGO BINGO). Excludes the special or second-zone number. */
  numbers?: number[];
  /** The same numbers in the order they were drawn. */
  draw_order?: number[];
  /** 大樂透 special number (特別號). */
  special_number?: number;
  /** 威力彩 second-zone number (第二區). */
  second_zone?: number;
  /** 3星彩 / 4星彩 digits in position order, highest position first. */
  digits?: number[];
  /** BINGO BINGO super number (超級獎號): the 20th number drawn. */
  super_number?: number;
  /** BINGO BINGO 猜大小 / 猜單雙 results as published; null when the API shows none. */
  big_small?: string | null;
  odd_even?: string | null;
  /** Last day to claim, YYYY-MM-DD, as published. */
  redeem_deadline?: string;
  /** NTD. */
  sales_amount?: number;
  /** NTD, 獎金總額 as published. */
  total_prize_amount?: number;
  prizes?: Prize[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function fail(game: GameId | "api", what: string): never {
  throw new UpstreamError(`台灣彩券 API 回應格式和預期不同（${game}：${what}），為避免給出錯的號碼，這次不回答。`);
}

function int(v: unknown, game: GameId, what: string): number {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) fail(game, `${what} 不是整數`);
  return n;
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function dateOnly(v: unknown, game: GameId, what: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) fail(game, `${what} 不是日期`);
  return v.slice(0, 10);
}

function intList(v: unknown, game: GameId, what: string): number[] {
  if (!Array.isArray(v)) fail(game, `${what} 不是陣列`);
  return v.map((x, i) => int(x, game, `${what}[${i}]`));
}

function inRange(nums: number[], min: number, max: number, game: GameId, what: string): void {
  for (const n of nums) if (n < min || n > max) fail(game, `${what} 有超出 ${min}~${max} 的號碼 ${n}`);
  if (new Set(nums).size !== nums.length) fail(game, `${what} 有重複號碼`);
}

const ascending = (a: number, b: number) => a - b;

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && [...a].sort(ascending).every((n, i) => n === [...b].sort(ascending)[i]);
}

function prizesOf(def: GameDef, item: Obj): Prize[] | undefined {
  const out: Prize[] = [];
  for (const p of def.prizes) {
    const v = item[p.field];
    if (!isObj(v)) continue;
    out.push({ tier: p.tier, winners: optNum(v.winnerCount) ?? null, prize_per_winner: optNum(v.perPrize) ?? null });
  }
  return out.length ? out : undefined;
}

function common(def: GameDef, item: Obj): Pick<Draw, "redeem_deadline" | "sales_amount" | "total_prize_amount" | "prizes"> {
  const out: Pick<Draw, "redeem_deadline" | "sales_amount" | "total_prize_amount" | "prizes"> = {};
  if (typeof item.redeemableDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(item.redeemableDate))
    out.redeem_deadline = item.redeemableDate.slice(0, 10);
  const sales = optNum(item.sellAmount);
  if (sales !== undefined) out.sales_amount = sales;
  const total = optNum(item.totalAmount);
  if (total !== undefined) out.total_prize_amount = total;
  const prizes = prizesOf(def, item);
  if (prizes) out.prizes = prizes;
  return out;
}

/** One item of a lotto-type or digit-type result list. */
export function parseDrawItem(game: GameId, item: unknown): Draw {
  const def = GAMES[game];
  if (!isObj(item)) fail(game, "開獎資料不是物件");
  if (def.kind === "bingo") fail(game, "賓果賓果要用 parseBingoItem");
  const base = { game, period: int(item.period, game, "period"), date: dateOnly(item.lotteryDate, game, "lotteryDate") };

  if (def.kind === "digits") {
    const digits = intList(item.drawNumberAppear, game, "drawNumberAppear");
    if (digits.length !== def.digits) fail(game, `應該有 ${def.digits} 位數，實際 ${digits.length}`);
    for (const d of digits) if (d < 0 || d > 9) fail(game, `位數 ${d} 不在 0~9`);
    return { ...base, digits, ...common(def, item) };
  }

  const pool = def.pool!;
  const sizes = intList(item.drawNumberSize, game, "drawNumberSize");
  const appear = intList(item.drawNumberAppear, game, "drawNumberAppear");
  const expected = pool.drawn + (def.extra ? 1 : 0);
  if (sizes.length !== expected || appear.length !== expected)
    fail(game, `應該有 ${expected} 個號碼，實際 ${sizes.length} / ${appear.length}`);

  const numbers = sizes.slice(0, pool.drawn).sort(ascending);
  const order = appear.slice(0, pool.drawn);
  inRange(numbers, pool.min, pool.max, game, "主號碼");
  if (!sameSet(numbers, order)) fail(game, "依大小順序與開出順序的號碼不一致");

  const draw: Draw = { ...base, numbers, draw_order: order };
  if (def.extra) {
    const extra = sizes[pool.drawn];
    if (appear[pool.drawn] !== extra) fail(game, "特別號（第二區）在兩個陣列裡不一致");
    if (def.extra === "special") {
      inRange([...numbers, extra], pool.min, pool.max, game, "特別號");
      draw.special_number = extra;
    } else {
      const z = def.secondZone!;
      if (extra < z.min || extra > z.max) fail(game, `第二區號碼 ${extra} 不在 ${z.min}~${z.max}`);
      draw.second_zone = extra;
    }
  }
  return { ...draw, ...common(def, item) };
}

function bingoNumbers(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) fail("bingo", `${what} 不是陣列`);
  const nums = v.map((x, i) => int(x, "bingo", `${what}[${i}]`));
  if (nums.length !== 20) fail("bingo", `${what} 應該有 20 個號碼，實際 ${nums.length}`);
  inRange(nums, 1, 80, "bingo", what);
  return nums;
}

// The API shows a full-width hyphen (U+FF0D) when neither side reached 13 numbers;
// other dashes are accepted in case it ever sends those instead.
const NO_RESULT_MARKS = [0xff0d, 0x2014, 0x2013, 0x2d].map((c) => String.fromCharCode(c));

const topOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && !NO_RESULT_MARKS.includes(v.trim()) ? v.trim() : null;

/** One BINGO BINGO draw from BingoResult (date comes from the query, the item's own date is a placeholder). */
export function parseBingoItem(item: unknown, date: string): Draw {
  if (!isObj(item)) fail("bingo", "開獎資料不是物件");
  const numbers = bingoNumbers(item.bigShowOrder, "bigShowOrder").sort(ascending);
  const order = bingoNumbers(item.openShowOrder, "openShowOrder");
  if (!sameSet(numbers, order)) fail("bingo", "依大小順序與開出順序的號碼不一致");
  const superNumber = int(item.bullEyeTop, "bingo", "bullEyeTop");
  if (superNumber !== order[19]) fail("bingo", "超級獎號不是第 20 個開出的號碼");
  return {
    game: "bingo",
    period: int(item.drawTerm, "bingo", "drawTerm"),
    date,
    numbers,
    draw_order: order,
    super_number: superNumber,
    big_small: topOrNull(item.highLowTop),
    odd_even: topOrNull(item.oddEvenTop),
  };
}

function checkEnvelope(body: unknown): Obj {
  if (!isObj(body)) fail("api", "回應不是 JSON 物件");
  if (body.rtCode !== 0) {
    const msg = typeof body.rtMsg === "string" && body.rtMsg ? body.rtMsg : `rtCode ${String(body.rtCode)}`;
    throw new UpstreamError(`台灣彩券 API 回報錯誤：${msg}`);
  }
  if (!isObj(body.content)) fail("api", "缺少 content");
  return body.content;
}

export interface DrawPage {
  /** Total draws matching the query on the API side (all pages). */
  total: number;
  /** Newest first, as the API returns them. */
  draws: Draw[];
}

/** A full response from one of the *Result endpoints (not bingo). */
export function parseResultList(game: GameId, body: unknown): DrawPage {
  const def = GAMES[game];
  const content = checkEnvelope(body);
  const list = content[def.listKey];
  if (list !== null && list !== undefined && !Array.isArray(list)) fail(game, `${def.listKey} 不是陣列`);
  const draws = (list ?? []).map((item) => parseDrawItem(game, item));
  const total = optNum(content.totalSize) ?? draws.length;
  return { total, draws: draws.sort((a, b) => b.period - a.period) };
}

/** A full BingoResult response for one day. */
export function parseBingoList(body: unknown, date: string): DrawPage {
  const content = checkEnvelope(body);
  const list = content.bingoQueryResult;
  if (list !== null && list !== undefined && !Array.isArray(list)) fail("bingo", "bingoQueryResult 不是陣列");
  const draws = (list ?? []).map((item) => parseBingoItem(item, date));
  return { total: optNum(content.totalSize) ?? draws.length, draws: draws.sort((a, b) => b.period - a.period) };
}

/** LatestBingoResult. */
export function parseBingoLatest(body: unknown): Draw {
  const content = checkEnvelope(body);
  const post = content.lotteryBingoLatestPost;
  if (!isObj(post)) fail("bingo", "缺少 lotteryBingoLatestPost");
  const when = post.dDate;
  if (typeof when !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when)) fail("bingo", "dDate 不是日期時間");
  const prizeNum = isObj(post.prizeNum) ? post.prizeNum : {};
  const draw = parseBingoItem(
    {
      drawTerm: post.drawTerm,
      bigShowOrder: post.bigShowOrder,
      openShowOrder: post.openShowOrder,
      bullEyeTop: prizeNum.bullEye,
      highLowTop: prizeNum.highLow,
      oddEvenTop: prizeNum.oddEven,
    },
    when.slice(0, 10),
  );
  draw.draw_time = when.slice(11, 16);
  if (typeof post.eDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(post.eDate)) draw.redeem_deadline = post.eDate.slice(0, 10);
  return draw;
}

export interface NextDraw {
  gameCode: number;
  date: string;
  time?: string;
  period?: number;
}

/** NextDrawDate: the official next draw date per game. */
export function parseNextDrawDates(body: unknown): NextDraw[] {
  const content = checkEnvelope(body);
  const list = content.nextDrawDateList;
  if (!Array.isArray(list)) fail("api", "nextDrawDateList 不是陣列");
  const out: NextDraw[] = [];
  for (const item of list) {
    if (!isObj(item) || typeof item.gameCode !== "number" || typeof item.drawDate !== "string") continue;
    const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2}))?$/.exec(item.drawDate);
    if (!m) continue;
    const next: NextDraw = { gameCode: item.gameCode, date: `${m[1]}-${m[2]}-${m[3]}` };
    if (m[4]) next.time = `${m[4]}:${m[5]}`;
    if (typeof item.drawTerm === "number") next.period = item.drawTerm;
    out.push(next);
  }
  return out;
}

/** ExceptionNotice: official notices about schedule changes for one game (usually empty). */
export function parseExceptionNotices(body: unknown): string[] {
  const content = checkEnvelope(body);
  const list = content.exceptions;
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => (isObj(e) && typeof e.errorMessage === "string" ? e.errorMessage.trim() : ""))
    .filter(Boolean);
}
