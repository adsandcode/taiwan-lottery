/** Plain-text rendering of tool results for the CLI. */

import { GAMES, type GameId } from "./games.js";
import type { Draw, Prize } from "./draws.js";
import type { MoreLink } from "./links.js";
import type { NumberCount } from "./stats.js";

const two = (n: number) => String(n).padStart(2, "0");
const money = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString("en-US") : "-");

export function numbersLine(game: GameId, d: Partial<Draw>): string {
  if (d.digits) return d.digits.join(" ");
  const parts = [(d.numbers ?? []).map(two).join(" ")];
  if (d.special_number !== undefined) parts.push(`特別號 ${two(d.special_number)}`);
  if (d.second_zone !== undefined) parts.push(`第二區 ${two(d.second_zone)}`);
  if (d.super_number !== undefined) parts.push(`超級獎號 ${two(d.super_number)}`);
  return parts.join("　");
}

function prizeLines(prizes: Prize[] | undefined): string[] {
  if (!prizes?.length) return [];
  const width = Math.max(...prizes.map((p) => p.tier.length));
  return [
    "獎項（本期官方公布）：",
    ...prizes.map((p) => `  ${p.tier.padEnd(width, "　")}  ${money(p.winners).padStart(9)} 注　每注 ${money(p.prize_per_winner)} 元`),
  ];
}

function tail(r: { notes?: string[]; more?: MoreLink[] }): string[] {
  const out: string[] = [];
  if (r.notes?.length) out.push("", "說明：", ...r.notes.map((n) => `  - ${n}`));
  if (r.more?.length) out.push("", "更多：", ...r.more.map((m) => `  ${m.title}  ${m.url}`));
  return out;
}

function head(game: GameId, d: Draw, weekday?: string): string {
  return `${GAMES[game].name}　第 ${d.period} 期　${d.date}${weekday ? `（${weekday}）` : ""}${d.draw_time ? ` ${d.draw_time}` : ""}`;
}

type DrawResult = { game: GameId; draw: Draw; weekday?: string; notes?: string[]; more?: MoreLink[] };

export function formatDraw(r: DrawResult): string {
  const d = r.draw;
  const lines = [head(r.game, d, r.weekday)];
  if (d.digits) lines.push(`開獎號碼：${d.digits.join(" ")}`);
  else {
    lines.push(`開獎號碼（由小到大）：${numbersLine(r.game, d)}`);
    if (d.draw_order) lines.push(`開出順序：${d.draw_order.map(two).join(" ")}`);
  }
  if (d.big_small !== undefined || d.odd_even !== undefined)
    lines.push(`猜大小：${d.big_small ?? "無（兩邊都未達 13 個）"}　猜單雙：${d.odd_even ?? "無（兩邊都未達 13 個）"}`);
  lines.push(...prizeLines(d.prizes));
  if (d.sales_amount !== undefined) lines.push(`銷售金額：${money(d.sales_amount)} 元`);
  if (d.redeem_deadline) lines.push(`兌獎期限：${d.redeem_deadline}`);
  return [...lines, ...tail(r)].join("\n");
}

export function formatList(r: { game: GameId; query: Record<string, unknown>; count: number; draws: Draw[]; notes?: string[]; more?: MoreLink[] }): string {
  const q = Object.entries(r.query).map(([k, v]) => `${k}=${v}`).join(" ");
  const lines = [`${GAMES[r.game].name}　${q}　共 ${r.count} 期`];
  for (const d of r.draws) lines.push(`  ${d.period}  ${d.date}${d.draw_time ? " " + d.draw_time : ""}  ${numbersLine(r.game, d)}`);
  return [...lines, ...tail(r)].join("\n");
}

interface CheckView {
  game: GameId;
  period: number;
  date: string;
  your_numbers: number[];
  your_second_zone?: number;
  drawn: Partial<Draw>;
  matched: number[];
  matched_count: number;
  special_matched?: boolean;
  second_zone_matched?: boolean;
  super_number_matched?: boolean;
  positions?: { position: string; yours: number; drawn: number; match: boolean }[];
  play?: string;
  tier: string | null;
  rule: string | null;
  won: boolean | null;
  published_prize_per_winner?: number | null;
  notes?: string[];
  more?: MoreLink[];
}

export function formatCheck(r: CheckView): string {
  const def = GAMES[r.game];
  const lines = [`${def.name}　第 ${r.period} 期　${r.date}`];
  if (r.positions) {
    lines.push(`你的號碼：${r.your_numbers.join(" ")}`, `開獎號碼：${(r.drawn.digits ?? []).join(" ")}`);
    lines.push(`逐位比對：${r.positions.map((p) => `${p.position}${p.match ? "○" : "×"}`).join(" ")}`);
  } else {
    const mine = r.your_numbers.map(two).join(" ") + (r.your_second_zone !== undefined ? `　第二區 ${two(r.your_second_zone)}` : "");
    lines.push(`你的號碼：${mine}`, `開獎號碼：${numbersLine(r.game, r.drawn)}`);
    const extras = [
      r.special_matched ? "＋特別號" : "",
      r.second_zone_matched ? "＋第二區" : "",
      r.super_number_matched ? "（含超級獎號）" : "",
    ].join("");
    lines.push(`對中：${r.matched.length ? r.matched.map(two).join(" ") : "無"}（${r.matched_count} 個）${extras}`);
    if (r.play) lines.push(`玩法：${r.play}`);
  }
  if (r.won === true) lines.push(`結果：${r.tier}（${r.rule}）`);
  else if (r.won === false) lines.push("結果：未中獎");
  else lines.push("結果：這裡不判定獎項（見下方說明）");
  if (r.won && r.published_prize_per_winner !== undefined)
    lines.push(`本期${r.tier}每注：${money(r.published_prize_per_winner)} 元（官方公布）`);
  return [...lines, ...tail(r)].join("\n");
}

function grid(counts: NumberCount[], digits: boolean): string[] {
  const cells = counts.map(
    (c) => `${digits ? c.number : two(c.number)}:${String(c.count).padStart(2)}次/${c.draws_since_last_seen === null ? "未開" : `${c.draws_since_last_seen}期前`}`,
  );
  const out: string[] = [];
  for (let i = 0; i < cells.length; i += 5) out.push(("  " + cells.slice(i, i + 5).map((c) => c.padEnd(14)).join("")).trimEnd());
  return out;
}

export function formatStats(r: {
  game: GameId;
  requested_last_n: number;
  draws_analyzed: number;
  window: { from: { period: number; date: string }; to: { period: number; date: string } } | null;
  frequency: NumberCount[];
  most_frequent: number[];
  least_frequent: number[];
  by_position?: { position: string; counts: NumberCount[] }[];
  second_zone_frequency?: NumberCount[];
  special_number_frequency?: NumberCount[];
  notes?: string[];
  more?: MoreLink[];
}): string {
  const digits = GAMES[r.game].kind === "digits";
  const fmt = (ns: number[]) => ns.map((n) => (digits ? String(n) : two(n))).join(" ");
  const w = r.window;
  const lines = [
    `${GAMES[r.game].name}　最近 ${r.draws_analyzed} 期的歷史出現次數` +
      (w ? `（${w.from.date} 第 ${w.from.period} 期 ～ ${w.to.date} 第 ${w.to.period} 期）` : ""),
    `出現最多：${fmt(r.most_frequent)}`,
    `出現最少：${fmt(r.least_frequent)}`,
    "號碼:次數/上次出現",
    ...grid(r.frequency, digits),
  ];
  for (const p of r.by_position ?? []) lines.push(`${p.position}位：`, ...grid(p.counts, true));
  if (r.second_zone_frequency) lines.push("第二區：", ...grid(r.second_zone_frequency, false));
  if (r.special_number_frequency) {
    const seen = r.special_number_frequency.filter((c) => c.count > 0);
    lines.push(`特別號（有開出的）：${seen.map((c) => `${two(c.number)}×${c.count}`).join(" ") || "無"}`);
  }
  return [...lines, ...tail(r)].join("\n");
}

export function formatSchedule(r: {
  game: GameId;
  active: boolean;
  draw_days: string | null;
  draw_time: string | null;
  based_on?: string;
  next_draw: { date: string; weekday: string; time?: string; period?: number } | null;
  official_notices: string[];
  results_published: string;
  sources: string[];
  notes?: string[];
  more?: MoreLink[];
}): string {
  const lines = [`${GAMES[r.game].name} 開獎時間`];
  if (!r.active) lines.push("目前不在官方開獎時程裡。");
  if (r.draw_days) lines.push(`開獎日：${r.draw_days}`);
  if (r.draw_time) lines.push(`時間：${r.draw_time}`);
  if (r.based_on) lines.push(`號碼：${r.based_on}`);
  if (r.next_draw)
    lines.push(
      `下一期：${r.next_draw.date}（${r.next_draw.weekday}）${r.next_draw.time ? " " + r.next_draw.time : ""}` +
        (r.next_draw.period ? `　第 ${r.next_draw.period} 期` : ""),
    );
  for (const n of r.official_notices) lines.push(`官方公告：${n}`);
  if (r.active) lines.push(`官網公布：${r.results_published}`);
  lines.push(`來源：${r.sources.join(" ")}`);
  return [...lines, ...tail(r)].join("\n");
}
