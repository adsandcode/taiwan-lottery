/**
 * The only code that talks to the official API.
 *
 * Polite by construction: one request at a time per URL (identical requests
 * in flight share one answer), an in-memory cache (5 minutes for anything
 * that can still change, 12 hours for finished months), a User-Agent that
 * names this package, and a 15 second timeout. Statistics use the API's own
 * month range parameter, so the last 200 draws are one request, not a fan-out.
 */

import { GAMES, type GameId } from "./games.js";
import {
  parseBingoLatest,
  parseBingoList,
  parseExceptionNotices,
  parseNextDrawDates,
  parseResultList,
  type Draw,
  type DrawPage,
  type NextDraw,
} from "./draws.js";
import { UpstreamError } from "./errors.js";
import { addMonths, taipei } from "./time.js";
import { VERSION } from "./version.js";

export const API_BASE = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/";
export const USER_AGENT = `mcp-server-taiwan-lottery/${VERSION} (open-source draw results lookup; Node.js)`;
export const TIMEOUT_MS = 15_000;
export const TTL = {
  /** Anything that can still change: the current month, today's BINGO BINGO, a draw not found yet. */
  recent: 5 * 60_000,
  /** Finished months, past days, draws already published. */
  past: 12 * 60 * 60_000,
  /** BINGO BINGO draws every 5 minutes. */
  bingoLatest: 60_000,
} as const;
const MAX_CACHE_ENTRIES = 300;

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<FetchResponseLike>;

export interface ClientOptions {
  /** Defaults to the global fetch (Node 18+). */
  fetch?: FetchLike;
  /** Defaults to the system clock. */
  now?: () => Date;
  timeoutMs?: number;
}

export class LotteryClient {
  readonly now: () => Date;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: ClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  /** Taiwan date today, YYYY-MM-DD. */
  today(): string {
    return taipei(this.now()).date;
  }

  /** Taiwan month now, YYYY-MM. */
  currentMonth(): string {
    return taipei(this.now()).monthKey;
  }

  /** GET `path` under API_BASE. `ttl` sees the parsed body and returns how long to keep it (0 = do not cache). */
  async getJson(path: string, ttl: (body: unknown) => number): Promise<unknown> {
    const url = API_BASE + path;
    const hit = this.cache.get(url);
    if (hit && hit.expires > this.now().getTime()) return hit.value;
    const pending = this.inflight.get(url);
    if (pending) return pending;
    const p = this.request(url)
      .then((body) => {
        const ms = ttl(body);
        if (ms > 0) {
          this.cache.delete(url);
          this.cache.set(url, { expires: this.now().getTime() + ms, value: body });
          while (this.cache.size > MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
        }
        return body;
      })
      .finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  private async request(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new UpstreamError(`台灣彩券 API 回應 HTTP ${res.status}，請稍後再試。`);
      try {
        return await res.json();
      } catch (err) {
        if (controller.signal.aborted) throw err;
        throw new UpstreamError("台灣彩券 API 的回應不是 JSON。");
      }
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      if (controller.signal.aborted)
        throw new UpstreamError(`台灣彩券 API 超過 ${Math.round(this.timeoutMs / 1000)} 秒沒有回應，請稍後再試。`);
      throw new UpstreamError(`連不上台灣彩券 API：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Draws from month `from` to month `to` (YYYY-MM, inclusive), newest first, at most `pageSize` (≤ 200). */
  async monthRange(game: GameId, from: string, to: string, pageSize: number): Promise<DrawPage> {
    const def = GAMES[game];
    const size = Math.max(1, Math.min(200, Math.floor(pageSize)));
    const path = `${def.endpoint}?period=&month=${from}&endMonth=${to}&pageNum=1&pageSize=${size}`;
    const stillOpen = to >= addMonths(this.currentMonth(), -1);
    const body = await this.getJson(path, () => (stillOpen ? TTL.recent : TTL.past));
    return parseResultList(game, body);
  }

  /** One draw by period number, or null when the API has no such period (yet). */
  async byPeriod(game: GameId, period: number): Promise<Draw | null> {
    const def = GAMES[game];
    const path = `${def.endpoint}?period=${period}&month=&endMonth=&pageNum=1&pageSize=1`;
    const body = await this.getJson(path, (b) => {
      try {
        return parseResultList(game, b).draws.length ? TTL.past : TTL.recent;
      } catch {
        return 0;
      }
    });
    const page = parseResultList(game, body);
    return page.draws.find((d) => d.period === period) ?? null;
  }

  /** All BINGO BINGO draws of one Taiwan date (YYYY-MM-DD), newest first, at most `pageSize`. */
  async bingoDay(date: string, pageSize = 250): Promise<DrawPage> {
    const size = Math.max(1, Math.min(250, Math.floor(pageSize)));
    const path = `BingoResult?openDate=${date}&pageNum=1&pageSize=${size}`;
    const isPast = date < this.today();
    const body = await this.getJson(path, () => (isPast ? TTL.past : TTL.bingoLatest));
    return parseBingoList(body, date);
  }

  async bingoLatest(): Promise<Draw> {
    const body = await this.getJson("LatestBingoResult", () => TTL.bingoLatest);
    return parseBingoLatest(body);
  }

  async nextDrawDates(): Promise<NextDraw[]> {
    const body = await this.getJson("NextDrawDate", () => TTL.recent);
    return parseNextDrawDates(body);
  }

  async exceptionNotices(gameCode: number): Promise<string[]> {
    const body = await this.getJson(`ExceptionNotice?game=${gameCode}`, () => TTL.recent);
    return parseExceptionNotices(body);
  }
}
