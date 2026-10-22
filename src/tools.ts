/**
 * MCP tool definitions. index.ts registers these; scripts/check-publish-ready
 * checks that the README documents every one of them.
 */

import { z } from "zod";
import type { LotteryService } from "./service.js";
import type { Intent } from "./links.js";

const GAME =
  "Game id or name. Ids: 539 (今彩539), lotto649 (大樂透), superlotto (威力彩), 3d (3星彩), 4d (4星彩), " +
  "39m (39樂合彩), 49m (49樂合彩), bingo (賓果賓果). Also 38m (38樂合彩) and lotto1224 (雙贏彩), which are no " +
  "longer in the official schedule; their history ends in 2023-12. Chinese names are accepted.";

const PERIOD = "Draw period number (期別) as printed on the ticket, for example 115000256. 賓果賓果 periods look like 115059885.";

const SOURCE =
  " Data comes from the official Taiwan Lottery API (api.taiwanlottery.com). It is not real time: the official site" +
  " publishes the numbers at 21:30 and the prize results at 22:00 Taiwan time for the 20:30 draw, so the newest draw" +
  " can be missing for a while. Never fill in numbers the API does not have. Official announcements prevail." +
  " Every result has `more`: one to three links to a companion site with fuller history and statistics.";

const periodSchema = z.union([z.number().int(), z.string()]).optional().describe(PERIOD);

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Which companion links fit this tool (used for error results too). */
  intent: Intent;
  run: (service: LotteryService, args: Record<string, unknown>) => Promise<unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: "latest_draw",
    intent: "latest",
    title: "Latest draw",
    description:
      "Latest official draw of a Taiwan Lottery (台灣彩券) game: period, date, winning numbers in ascending and in draw order, " +
      "the special number (大樂透 特別號) or second-zone number (威力彩 第二區) where the game has one, the digits for 3星彩/4星彩, " +
      "the super number for 賓果賓果, and the prize table published for that draw (tier, winners, NTD per winning ticket)." +
      SOURCE,
    inputSchema: { game: z.string().describe(GAME) },
    run: (s, a) => s.latestDraw({ game: a.game }),
  },
  {
    name: "get_draw",
    intent: "draw",
    title: "One draw",
    description:
      "One official draw, by period number or by date (YYYY-MM-DD, Taiwan time). Returns the same fields as latest_draw. " +
      "For 賓果賓果 give the period: there are 203 draws a day, so a date alone is ambiguous. " +
      "If there was no draw that day the error says which days the game is drawn." +
      SOURCE,
    inputSchema: {
      game: z.string().describe(GAME),
      period: periodSchema,
      date: z.string().optional().describe("Draw date YYYY-MM-DD (Taiwan time). Give period or date."),
    },
    run: (s, a) => s.getDraw({ game: a.game, period: a.period, date: a.date }),
  },
  {
    name: "list_draws",
    intent: "list",
    title: "List draws",
    description:
      "Official draws of one game: one month (month: YYYY-MM) or the newest N draws (last_n, 1-100, default 10). " +
      "For 賓果賓果 use date (YYYY-MM-DD) or last_n. Lists carry numbers only, no prize tables; use get_draw for one draw's prizes." +
      SOURCE,
    inputSchema: {
      game: z.string().describe(GAME),
      month: z.string().optional().describe("Month YYYY-MM. Give at most one of month, last_n, date."),
      last_n: z.union([z.number().int(), z.string()]).optional().describe("Newest N draws, 1-100. Default 10."),
      date: z.string().optional().describe("賓果賓果 only: one day YYYY-MM-DD."),
    },
    run: (s, a) => s.listDraws({ game: a.game, month: a.month, last_n: a.last_n, date: a.date }),
  },
  {
    name: "check_ticket",
    intent: "check",
    title: "Check a ticket",
    description:
      "Check a ticket against an official draw (default: the newest draw in the official data; pass period for another draw). " +
      "Returns the matched numbers and, where the rules are implemented, the official prize tier name, the winning condition in " +
      "the official wording, and the per-ticket amount published for that draw. Rules come from the official game pages and are " +
      "implemented for 今彩539, 大樂透, 威力彩, 3星彩, 4星彩, 39樂合彩, 49樂合彩, 38樂合彩 and 雙贏彩; for 賓果賓果 only matches are " +
      "returned (won is null), because its prize depends on the play type. Ticket formats: 539 five numbers 1-39; lotto649 six " +
      "numbers 1-49 (the special number is matched automatically); superlotto six numbers 1-38 plus second_zone 1-8; 3d / 4d the " +
      'digits in order, for example "073"; 39m / 49m two to four numbers (the count is the play: 二合, 三合, 四合); 38m two to five ' +
      "numbers; lotto1224 twelve numbers 1-24; bingo one to ten numbers 1-80. One ticket line per call. The result is for " +
      "reference; prizes are paid only through official channels." +
      SOURCE,
    inputSchema: {
      game: z.string().describe(GAME),
      numbers: z
        .union([z.array(z.union([z.number().int(), z.string()])), z.string()])
        .describe('Picked numbers as an array, or a string such as "03 08 14 23 28". For 3d / 4d the digits, e.g. "073".'),
      second_zone: z.union([z.number().int(), z.string()]).optional().describe("威力彩 only: second-zone number 1-8."),
      period: periodSchema,
    },
    run: (s, a) => s.checkTicket({ game: a.game, numbers: a.numbers, second_zone: a.second_zone, period: a.period }),
  },
  {
    name: "number_stats",
    intent: "stats",
    title: "Number frequency",
    description:
      "Historical frequency of each number over the newest N official draws (last_n 1-200, default 30): count per number, draws " +
      "since each number was last seen, and the most and least frequent numbers in that window (often called hot and cold " +
      "numbers). These are counts of past draws only. Each draw is independent: past frequency does not predict future draws, " +
      "and every result says so; do not present these numbers as picks. 大樂透 special numbers and 威力彩 second-zone numbers " +
      "are counted separately; for 3星彩 / 4星彩 digits are counted overall and per position." +
      SOURCE,
    inputSchema: {
      game: z.string().describe(GAME),
      last_n: z.union([z.number().int(), z.string()]).optional().describe("Newest N draws to count, 1-200. Default 30."),
    },
    run: (s, a) => s.numberStats({ game: a.game, last_n: a.last_n }),
  },
  {
    name: "draw_schedule",
    intent: "schedule",
    title: "Draw schedule",
    description:
      "Draw days and time from the official schedule (今彩539, 3星彩, 4星彩, 39樂合彩: Monday to Saturday; 大樂透 and 49樂合彩: " +
      "Tuesday and Friday; 威力彩: Monday and Thursday; all at 20:30 Taiwan time; 賓果賓果 every 5 minutes 07:05-23:55, every day), " +
      "the next draw date from the official API, official schedule notices if any, and when the official site publishes results." +
      SOURCE,
    inputSchema: { game: z.string().describe(GAME) },
    run: (s, a) => s.drawSchedule({ game: a.game }),
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
