/**
 * The six tools, shared by the MCP server and the CLI.
 *
 * Inputs are validated before any request is made. Every result carries the
 * official source, the notes a reader needs (the API lag, 以台灣彩券官方公告為準)
 * and `more`: one to three links to the companion site.
 */

import { OFFICIAL, gameList, resolveGame, type GameDef } from "./games.js";
import type { Draw } from "./draws.js";
import { API_BASE, LotteryClient } from "./client.js";
import { InputError, NotFoundError, UpstreamError } from "./errors.js";
import { moreLinks, type Intent, type MoreLink } from "./links.js";
import { checkTicket as judge, readTicket, type CheckResult } from "./rules.js";
import { frequencyStats, type FrequencyStats } from "./stats.js";
import { addDays, addMonths, bingoDateFromPeriod, parseDate, parseMonth, weekdayOf } from "./time.js";

export const NOTICE = "資料取自台灣彩券官方 API，一切以台灣彩券官方公告為準。";
export const LAG_NOTE =
  "官方資料不是即時的：台灣彩券官網常見問題寫明每晚 21:30 公告當日獎號、22:00 公告開獎結果（各獎項注數與獎金）。21:30 以前查不到當期是正常的，22:00 以前可能還沒有獎金資料。";
export const PRIZES_PENDING_NOTE =
  "這一期的獎金尚未公告（台灣彩券官網 22:00 公告開獎結果），目前只有號碼；這不代表沒有人中獎，請 22:00 以後再查。";
export const BINGO_NOTE = "賓果賓果每 5 分鐘開獎一期，最新一期以台灣彩券官網即時公告為準。";

const discontinuedNote = (def: GameDef) =>
  `${def.name}不在台灣彩券目前的開獎時程裡（官方的下期開獎清單沒有這個遊戲），官方 API 最後一個有開獎資料的月份是 ${def.lastMonth}。以下是歷史資料。`;

export interface Envelope {
  game: string;
  game_name: string;
  notes: string[];
  source: { api: string; official_page: string };
  more: MoreLink[];
}

function envelope<T extends object>(def: GameDef, intent: Intent, body: T, notes: string[]): T & Envelope {
  const all = [...notes, NOTICE];
  if (!def.active) all.unshift(discontinuedNote(def));
  return {
    game: def.id,
    game_name: def.name,
    ...body,
    notes: [...new Set(all)],
    source: { api: API_BASE + (def.kind === "bingo" ? "BingoResult" : def.endpoint), official_page: def.resultPage },
    more: moreLinks(def.id, intent),
  };
}

/** A draw without prize and sales fields, for lists. */
function compact(d: Draw): Draw {
  const { prizes: _p, sales_amount: _s, total_prize_amount: _t, ...rest } = d;
  return rest;
}

function dropUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function toInt(value: unknown, what: string): number {
  const n = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) throw new InputError(`${what} 要是正整數。`);
  return n;
}

export class LotteryService {
  constructor(readonly client: LotteryClient = new LotteryClient()) {}

  game(input: unknown): GameDef {
    const def = typeof input === "string" ? resolveGame(input) : null;
    if (!def) throw new InputError(`不認得這個遊戲：「${String(input)}」。可用的有：${gameList()}。`);
    return def;
  }

  private async latestOf(def: GameDef): Promise<Draw> {
    if (def.kind === "bingo") return this.client.bingoLatest();
    const to = def.active ? this.client.currentMonth() : def.lastMonth!;
    let page = await this.client.monthRange(def.id, addMonths(to, -1), to, 1);
    // A long holiday break can leave two months empty; look once more, further back.
    if (!page.draws.length) page = await this.client.monthRange(def.id, addMonths(to, -6), to, 1);
    if (!page.draws.length) throw new NotFoundError(`官方 API 最近幾個月沒有${def.name}的開獎資料。`);
    return page.draws[0];
  }

  /** The newest `n` draws (n ≤ 200), newest first. At most two requests. */
  private async lastN(def: GameDef, n: number): Promise<Draw[]> {
    if (def.kind === "bingo") {
      const today = this.client.today();
      const draws = [...(await this.client.bingoDay(today)).draws];
      if (draws.length < n) draws.push(...(await this.client.bingoDay(addDays(today, -1))).draws);
      return draws.slice(0, n);
    }
    const to = def.active ? this.client.currentMonth() : def.lastMonth!;
    let months = Math.ceil(n / def.minDrawsPerMonth) + 1;
    let page = await this.client.monthRange(def.id, addMonths(to, -(months - 1)), to, n);
    if (page.draws.length < n) {
      months *= 2;
      page = await this.client.monthRange(def.id, addMonths(to, -(months - 1)), to, n);
    }
    return page.draws.slice(0, n);
  }

  private async byPeriod(def: GameDef, period: number, date?: string): Promise<Draw> {
    if (def.kind !== "bingo") {
      const draw = await this.client.byPeriod(def.id, period);
      if (!draw) throw new NotFoundError(`找不到${def.name}第 ${period} 期。可能是期別打錯，或官方資料還沒更新。`);
      return draw;
    }
    let day = date ?? bingoDateFromPeriod(period);
    if (!day) throw new InputError(`賓果賓果的期別是 9 位數，例如 115059885，收到 ${period}。`);
    // Periods run 203 a day from January 1; if a day was skipped, step at most two days toward the period.
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await this.client.bingoDay(day);
      const found = page.draws.find((d) => d.period === period);
      if (found) return found;
      if (date || !page.draws.length) break;
      const newest = page.draws[0].period;
      const oldest = page.draws[page.draws.length - 1].period;
      if (period < oldest) day = addDays(day, -1);
      else if (period > newest) day = addDays(day, 1);
      else break;
    }
    throw new NotFoundError(`找不到賓果賓果第 ${period} 期。可能是期別打錯、還沒開出，或請加上開獎日期 date 再查一次。`);
  }

  // ---- tools -------------------------------------------------------------

  async latestDraw(args: { game: unknown }) {
    const def = this.game(args.game);
    const draw = await this.latestOf(def);
    const notes = def.kind === "bingo" ? [BINGO_NOTE] : def.active ? [LAG_NOTE] : [];
    if (draw.prizes_pending) notes.unshift(PRIZES_PENDING_NOTE);
    return envelope(def, "latest", { weekday: weekdayOf(draw.date), draw }, notes);
  }

  async getDraw(args: { game: unknown; period?: unknown; date?: unknown }) {
    const def = this.game(args.game);
    const hasPeriod = args.period !== undefined && args.period !== null && args.period !== "";
    const hasDate = args.date !== undefined && args.date !== null && args.date !== "";
    const date = hasDate ? parseDate(String(args.date)) : undefined;
    let draw: Draw;
    if (hasPeriod) {
      draw = await this.byPeriod(def, toInt(args.period, "period"), date);
    } else if (date) {
      if (def.kind === "bingo")
        throw new InputError("賓果賓果一天有 203 期，請給 period（期別），或用 list_draws 加 date 看整天的開獎。");
      if (date > this.client.today()) throw new InputError(`${date} 還沒到。`);
      const month = date.slice(0, 7);
      const page = await this.client.monthRange(def.id, month, month, 50);
      const found = page.draws.find((d) => d.date === date);
      if (!found) {
        const days = def.schedule ? `${def.name}的開獎日是${def.schedule.days}。` : "";
        const today = date === this.client.today() ? "如果是今天的開獎：台灣彩券官網 21:30 才公告當日獎號，請晚點再查。" : "";
        throw new NotFoundError(`${date}（${weekdayOf(date)}）沒有${def.name}的開獎資料。${days}${today}`);
      }
      draw = found;
    } else {
      throw new InputError("請給 period（期別）或 date（YYYY-MM-DD）其中一個。");
    }
    const notes = def.active && def.kind !== "bingo" ? [LAG_NOTE] : [];
    if (draw.prizes_pending) notes.unshift(PRIZES_PENDING_NOTE);
    return envelope(def, "draw", { weekday: weekdayOf(draw.date), draw }, notes);
  }

  async listDraws(args: { game: unknown; month?: unknown; last_n?: unknown; date?: unknown }) {
    const def = this.game(args.game);
    const given = (["month", "last_n", "date"] as const).filter((k) => args[k] !== undefined && args[k] !== null && args[k] !== "");
    if (given.length > 1) throw new InputError("month、last_n、date 只能給其中一個。");
    const mode = given[0] ?? "last_n";
    const notes: string[] = [];
    let draws: Draw[];
    let query: Record<string, string | number>;

    if (mode === "month") {
      if (def.kind === "bingo") throw new InputError("賓果賓果一天有 203 期，請用 date（YYYY-MM-DD）或 last_n。");
      const month = parseMonth(String(args.month));
      if (month > this.client.currentMonth()) throw new InputError(`${month} 還沒到。`);
      draws = (await this.client.monthRange(def.id, month, month, 50)).draws;
      query = { month };
      if (!draws.length) notes.push(`${month} 沒有${def.name}的開獎資料。`);
    } else if (mode === "date") {
      if (def.kind !== "bingo") throw new InputError("date 只用在賓果賓果；其他遊戲請用 month（YYYY-MM）或 last_n，或用 get_draw 查某一天。");
      const date = parseDate(String(args.date));
      if (date > this.client.today()) throw new InputError(`${date} 還沒到。`);
      draws = (await this.client.bingoDay(date)).draws;
      query = { date };
      if (!draws.length) notes.push(`${date} 沒有賓果賓果的開獎資料。`);
    } else {
      const n = args.last_n === undefined || args.last_n === null || args.last_n === "" ? 10 : toInt(args.last_n, "last_n");
      if (n > 100) throw new InputError("last_n 最多 100。要看更多請用 month 分月查詢。");
      draws = await this.lastN(def, n);
      query = { last_n: n };
      if (draws.length < n) notes.push(`官方資料只找到 ${draws.length} 期。`);
    }
    if (def.active && def.kind !== "bingo") notes.push(LAG_NOTE);
    if (def.kind === "bingo") notes.push(BINGO_NOTE);
    return envelope(def, "list", { query, count: draws.length, draws: draws.map(compact) }, notes);
  }

  async checkTicket(args: { game: unknown; numbers: unknown; second_zone?: unknown; period?: unknown }) {
    const def = this.game(args.game);
    const ticket = readTicket(def.id, args.numbers, args.second_zone);
    const hasPeriod = args.period !== undefined && args.period !== null && args.period !== "";
    const draw = hasPeriod ? await this.byPeriod(def, toInt(args.period, "period")) : await this.latestOf(def);
    const result: CheckResult = judge(def.id, ticket, draw);
    // A tier nobody won shows 0 per ticket for pari-mutuel prizes; only a real published amount is passed on.
    const published = result.tier ? draw.prizes?.find((p) => p.tier === result.tier && (p.prize_per_winner ?? 0) > 0) : undefined;

    const notes: string[] = [];
    if (!hasPeriod)
      notes.push(`沒有指定期別，這裡對的是官方資料裡最新的一期（第 ${draw.period} 期，${draw.date}）。請確認和彩券上的期別相同。`);
    if (!hasPeriod && def.active) notes.push(def.kind === "bingo" ? BINGO_NOTE : LAG_NOTE);
    if (result.note) notes.push(result.note);
    if (draw.prizes_pending && result.won) notes.push("本期獎金尚未公告（台灣彩券官網 22:00 公告開獎結果），每注金額請 22:00 以後再查。");
    else if (draw.prizes_pending) notes.push(PRIZES_PENDING_NOTE);
    notes.push("對獎結果僅供參考，兌獎以彩券本身及台灣彩券官方兌獎結果為準。");

    const drawn = dropUndefined({
      numbers: draw.numbers,
      special_number: draw.special_number,
      second_zone: draw.second_zone,
      digits: draw.digits,
      super_number: draw.super_number,
    });
    return envelope(
      def,
      "check",
      {
        period: draw.period,
        date: draw.date,
        your_numbers: ticket.numbers,
        ...(ticket.secondZone !== undefined ? { your_second_zone: ticket.secondZone } : {}),
        drawn,
        ...result,
        ...(published ? { published_prize_per_winner: published.prize_per_winner, published_winners: published.winners } : {}),
        rules_source: def.rulesPage,
      },
      notes,
    );
  }

  async numberStats(args: { game: unknown; last_n?: unknown }) {
    const def = this.game(args.game);
    const n = args.last_n === undefined || args.last_n === null || args.last_n === "" ? 30 : toInt(args.last_n, "last_n");
    if (n > 200) throw new InputError("last_n 最多 200。");
    const draws = await this.lastN(def, n);
    if (!draws.length) throw new NotFoundError(`官方 API 沒有${def.name}的開獎資料。`);
    const stats: FrequencyStats = frequencyStats(def.id, draws);
    const notes = [stats.disclaimer];
    if (draws.length < n) notes.push(`要求 ${n} 期，官方資料只找到 ${draws.length} 期。`);
    if (def.extra === "special") notes.push("frequency 只算六個主號碼；特別號另外統計在 special_number_frequency。");
    if (def.extra === "second_zone") notes.push("frequency 只算第1區；第2區另外統計在 second_zone_frequency。");
    if (def.kind === "digits") notes.push("frequency 是 0~9 各數字在所有位數出現的總次數；各位數分開的次數在 by_position。");
    return envelope(def, "stats", { requested_last_n: n, ...stats }, notes);
  }

  async drawSchedule(args: { game: unknown }) {
    const def = this.game(args.game);
    const notes: string[] = [];
    let next: { date: string; weekday: string; time?: string; period?: number } | null = null;
    let notices: string[] = [];
    if (def.active) {
      try {
        const found = (await this.client.nextDrawDates()).find((d) => d.gameCode === def.gameCode);
        if (found)
          next = {
            date: found.date,
            weekday: weekdayOf(found.date),
            ...(found.time ? { time: found.time } : {}),
            ...(found.period ? { period: found.period } : {}),
          };
      } catch (err) {
        if (!(err instanceof UpstreamError)) throw err;
        notes.push("暫時查不到官方的下期開獎日（API 沒有回應），以下只列出固定的開獎日。");
      }
      try {
        notices = await this.client.exceptionNotices(def.gameCode);
      } catch (err) {
        if (!(err instanceof UpstreamError)) throw err;
      }
    }
    const isBingo = def.kind === "bingo";
    const body = {
      active: def.active,
      draw_days: def.schedule?.days ?? null,
      draw_time: def.schedule ? (isBingo ? def.schedule.time : `${def.schedule.time}（台灣時間）`) : null,
      ...(def.basedOn ? { based_on: `依附${def.basedOn}的開獎號碼，不另外開獎` } : {}),
      next_draw: next,
      official_notices: notices,
      results_published: isBingo
        ? "各期獎號開出後即時公布於台灣彩券網站"
        : "台灣彩券官網每晚 21:30 公告當日獎號、22:00 公告開獎結果",
      sources: isBingo ? [OFFICIAL.schedulePage, def.resultPage, OFFICIAL.faqPage] : [OFFICIAL.schedulePage, OFFICIAL.faqPage],
    };
    if (def.active && !isBingo) notes.push(LAG_NOTE);
    return envelope(def, "schedule", body, notes);
  }
}
