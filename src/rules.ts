/**
 * Ticket checking against the official prize rules.
 *
 * Tier names and the wording in `rule` are copied from the official game
 * pages on www.taiwanlottery.com (the prize tables of /lotto/info/<game>/,
 * and for the two games no longer in the schedule, the prize labels of the
 * official history result page). Where a game's rules are not implemented,
 * or the official sources disagree for a combination, `tier` is null and
 * `note` says why. Prize amounts are never taken from the rules pages: the
 * amount shown is the one published for that draw.
 */

import { GAMES, type GameDef, type GameId } from "./games.js";
import type { Draw } from "./draws.js";
import { InputError } from "./errors.js";

export interface Ticket {
  /** Picked numbers, or digits in position order for 3星彩 / 4星彩. */
  numbers: number[];
  /** 威力彩 second-zone pick. */
  secondZone?: number;
}

export interface PositionMatch {
  position: string;
  yours: number;
  drawn: number;
  match: boolean;
}

export interface CheckResult {
  /** Picked numbers that are among the drawn main numbers. */
  matched: number[];
  matched_count: number;
  /** 大樂透: whether a pick equals the special number. */
  special_matched?: boolean;
  /** 威力彩: whether the second-zone pick matches. */
  second_zone_matched?: boolean;
  /** BINGO BINGO: whether the super number (the 20th drawn) is among the picks. */
  super_number_matched?: boolean;
  /** 3星彩 / 4星彩. */
  positions?: PositionMatch[];
  /** 39/49/38樂合彩: the play implied by how many numbers were picked (二合, 三合...). */
  play?: string;
  /** Official tier name, null when nothing was won or when the tier cannot be determined. */
  tier: string | null;
  /** Official wording of the winning condition for `tier`. */
  rule: string | null;
  /** true / false when the rules are implemented, null when they are not or the sources disagree. */
  won: boolean | null;
  rules_implemented: boolean;
  note?: string;
}

const PLAY_NAMES: Record<number, string> = { 2: "二合", 3: "三合", 4: "四合", 5: "五合" };
const DIGIT_POSITIONS: Record<number, string[]> = { 3: ["佰", "拾", "個"], 4: ["仟", "佰", "拾", "個"] };

/** Expected ticket shape per game: how many numbers, from which range. */
export function ticketShape(def: GameDef): { min: number; max: number; countMin: number; countMax: number; digits?: number } {
  switch (def.id) {
    case "539": return { min: 1, max: 39, countMin: 5, countMax: 5 };
    case "lotto649": return { min: 1, max: 49, countMin: 6, countMax: 6 };
    case "superlotto": return { min: 1, max: 38, countMin: 6, countMax: 6 };
    case "39m": return { min: 1, max: 39, countMin: 2, countMax: 4 };
    case "49m": return { min: 1, max: 49, countMin: 2, countMax: 4 };
    case "38m": return { min: 1, max: 38, countMin: 2, countMax: 5 };
    case "lotto1224": return { min: 1, max: 24, countMin: 12, countMax: 12 };
    case "bingo": return { min: 1, max: 80, countMin: 1, countMax: 10 };
    case "3d": return { min: 0, max: 9, countMin: 3, countMax: 3, digits: 3 };
    case "4d": return { min: 0, max: 9, countMin: 4, countMax: 4, digits: 4 };
  }
}

/**
 * Read a ticket from user input. Numbers may be an array or a string such as
 * "03 08 14 23 28" or "3,8,14,23,28". For 3星彩 / 4星彩 a string is read
 * digit by digit ("073"), an array as one digit per element.
 */
export function readTicket(game: GameId, numbers: unknown, secondZone?: unknown): Ticket {
  const def = GAMES[game];
  const shape = ticketShape(def);
  let list: number[];
  if (typeof numbers === "string") {
    const s = numbers.normalize("NFKC").trim();
    if (shape.digits) {
      const digits = s.replace(/[\s,，、\-]/g, "");
      if (!/^\d+$/.test(digits)) throw new InputError(`${def.name}請輸入 ${shape.digits} 位數字，例如 ${"0123456789".slice(0, shape.digits)}。`);
      list = [...digits].map(Number);
    } else {
      const parts = s.split(/[^0-9]+/).filter(Boolean);
      list = parts.map(Number);
    }
  } else if (Array.isArray(numbers)) {
    list = numbers.map((n) => (typeof n === "string" && /^\s*\d+\s*$/.test(n) ? Number(n) : n)) as number[];
  } else {
    throw new InputError("numbers 要是號碼陣列，或用空白、逗號分隔的字串。");
  }

  if (!list.every((n) => typeof n === "number" && Number.isInteger(n)))
    throw new InputError("號碼只能是整數。");
  const count =
    shape.countMin === shape.countMax ? `${shape.countMin} 個` : `${shape.countMin}~${shape.countMax} 個`;
  if (list.length < shape.countMin || list.length > shape.countMax)
    throw new InputError(
      shape.digits
        ? `${def.name}要 ${shape.digits} 位數，收到 ${list.length} 位。`
        : `${def.name}要選 ${count}號碼（${shape.min}~${shape.max}），收到 ${list.length} 個。`,
    );
  const bad = list.filter((n) => n < shape.min || n > shape.max);
  if (bad.length)
    throw new InputError(`${def.name}的號碼範圍是 ${shape.min}~${shape.max}，這些超出範圍：${bad.join("、")}。`);
  if (!shape.digits && new Set(list).size !== list.length) throw new InputError("號碼不能重複。");

  const ticket: Ticket = { numbers: list };
  if (def.extra === "second_zone") {
    const z = typeof secondZone === "string" && /^\s*\d+\s*$/.test(secondZone) ? Number(secondZone) : secondZone;
    const zone = def.secondZone!;
    if (z === undefined || z === null)
      throw new InputError(`${def.name}要提供第二區號碼（second_zone，${zone.min}~${zone.max}）。`);
    if (typeof z !== "number" || !Number.isInteger(z) || z < zone.min || z > zone.max)
      throw new InputError(`${def.name}第二區號碼要是 ${zone.min}~${zone.max} 的整數。`);
    ticket.secondZone = z;
  } else if (secondZone !== undefined && secondZone !== null) {
    throw new InputError(`${def.name}沒有第二區，second_zone 只用在威力彩。`);
  }
  return ticket;
}

type Tier = { tier: string; rule: string };

const T539: Record<number, Tier> = {
  5: { tier: "頭獎", rule: "與當期五個中獎號碼完全相同者" },
  4: { tier: "貳獎", rule: "對中當期獎號之其中任四碼" },
  3: { tier: "參獎", rule: "對中當期獎號之其中任三碼" },
  2: { tier: "肆獎", rule: "對中當期獎號之其中任二碼" },
};

function lotto649Tier(m: number, special: boolean): Tier | null {
  if (m === 6) return { tier: "頭獎", rule: "與當期六個獎號完全相同者" };
  if (m === 5 && special) return { tier: "貳獎", rule: "對中當期獎號之任五碼＋特別號" };
  if (m === 5) return { tier: "參獎", rule: "對中當期獎號之任五碼" };
  if (m === 4 && special) return { tier: "肆獎", rule: "對中當期獎號之任四碼＋特別號" };
  if (m === 4) return { tier: "伍獎", rule: "對中當期獎號之任四碼" };
  if (m === 3 && special) return { tier: "陸獎", rule: "對中當期獎號之任三碼＋特別號" };
  if (m === 2 && special) return { tier: "柒獎", rule: "對中當期獎號之任兩碼＋特別號" };
  if (m === 3) return { tier: "普獎", rule: "對中當期獎號之任三碼" };
  return null;
}

function superlottoTier(m: number, zone2: boolean): Tier | null {
  const table: [number, boolean, string, string][] = [
    [6, true, "頭獎", "第1區六個獎號全中，且第2區亦對中獎號"],
    [6, false, "貳獎", "第1區六個獎號全中，但第2區未對中"],
    [5, true, "參獎", "第1區對中任五個獎號，且第2區亦對中獎號"],
    [5, false, "肆獎", "第1區對中任五個獎號，但第2區未對中"],
    [4, true, "伍獎", "第1區對中任四個獎號，且第2區亦對中獎號"],
    [4, false, "陸獎", "第1區對中任四個獎號，但第2區未對中"],
    [3, true, "柒獎", "第1區對中任三個獎號，且第2區亦對中獎號"],
    [2, true, "捌獎", "第1區對中任二個獎號，且第2區亦對中獎號"],
    [3, false, "玖獎", "第1區對中任三個獎號，但第2區未對中"],
    [1, true, "普獎", "第1區對中任一個獎號，且第2區亦對中獎號"],
  ];
  const row = table.find(([count, z]) => count === m && z === zone2);
  return row ? { tier: row[2], rule: row[3] } : null;
}

function lotto1224Tier(m: number): Tier | null {
  const label: Record<number, [string, string]> = {
    12: ["頭獎", "12個 或 0個"], 0: ["頭獎", "12個 或 0個"],
    11: ["貳獎", "任11個 或 任1個"], 1: ["貳獎", "任11個 或 任1個"],
    10: ["參獎", "任10個 或 任2個"], 2: ["參獎", "任10個 或 任2個"],
    9: ["肆獎", "任9個 或 任3個"], 3: ["肆獎", "任9個 或 任3個"],
  };
  const hit = label[m];
  return hit ? { tier: hit[0], rule: `對中${hit[1]}` } : null;
}

const CHINESE_DIGIT: Record<number, string> = { 2: "二", 3: "三", 4: "四", 5: "五" };
const MULTI_RULE: Record<string, (k: number) => string> = {
  "39m": (k) => `對中同期今彩539獎號之任${CHINESE_DIGIT[k]}碼`,
  "49m": (k) => `對中同期大樂透獎號之任${CHINESE_DIGIT[k]}碼(不含特別號)`,
  "38m": (k) => `投注${k}個號碼對中${k}個`,
};

const DIGIT_DISAGREEMENT =
  "這個組合（最高位對中、中間位未對中、末段對中）在官方遊戲介紹頁的獎項表裡不符合任何一個獎項，" +
  "但官方「對獎小幫手」的判斷方式會把它算成中獎。兩個官方來源說法不同，這裡不判定獎項，請以台灣彩券官方公告或投注站兌獎結果為準。";

function checkDigits(def: GameDef, ticket: Ticket, draw: Draw): CheckResult {
  const drawn = draw.digits!;
  const names = DIGIT_POSITIONS[def.digits!];
  const positions = names.map((position, i) => ({ position, yours: ticket.numbers[i], drawn: drawn[i], match: ticket.numbers[i] === drawn[i] }));
  const p = positions.map((x) => x.match);
  const base = {
    matched: positions.filter((x) => x.match).map((x) => x.yours),
    matched_count: p.filter(Boolean).length,
    positions,
    rules_implemented: true,
  };
  const t = (tier: string, rule: string): CheckResult => ({ ...base, tier, rule, won: true });
  if (def.digits === 3) {
    const [h, te, u] = p;
    if (h && te && u) return t("壹獎", "三位數全部對中");
    if (!h && te && u) return t("貳獎", "對中拾位數和個位數，且佰位數未對中");
    if (!h && !te && u) return t("參獎", "對中個位數，且佰位數和拾位數均未對中");
    if (h && !te && u) return { ...base, tier: null, rule: null, won: null, note: DIGIT_DISAGREEMENT };
  } else {
    const [th, h, te, u] = p;
    if (th && h && te && u) return t("壹獎", "四位數全部對中");
    if (!th && h && te && u) return t("貳獎", "對中佰位數、拾位數和個位數，且仟位數未對中");
    if (!th && !h && te && u) return t("參獎", "對中拾位數和個位數，且仟位數和佰位數未對中");
    if (th && !h && te && u) return { ...base, tier: null, rule: null, won: null, note: DIGIT_DISAGREEMENT };
  }
  return { ...base, tier: null, rule: null, won: false };
}

/** Check one ticket against one draw of the same game. */
export function checkTicket(game: GameId, ticket: Ticket, draw: Draw): CheckResult {
  const def = GAMES[game];
  if (draw.game !== game) throw new InputError(`開獎資料是 ${draw.game}，不是 ${game}。`);
  if (def.kind === "digits") return checkDigits(def, ticket, draw);

  const drawn = new Set(draw.numbers ?? []);
  const matched = ticket.numbers.filter((n) => drawn.has(n)).sort((a, b) => a - b);
  const m = matched.length;
  const base = { matched, matched_count: m };
  const verdict = (tier: Tier | null): CheckResult => ({
    ...base,
    tier: tier?.tier ?? null,
    rule: tier?.rule ?? null,
    won: tier !== null,
    rules_implemented: true,
  });

  switch (def.id) {
    case "539":
      return verdict(T539[m] ?? null);
    case "lotto649": {
      const special = draw.special_number !== undefined && ticket.numbers.includes(draw.special_number);
      return { ...verdict(lotto649Tier(m, special)), special_matched: special };
    }
    case "superlotto": {
      const zone2 = ticket.secondZone !== undefined && ticket.secondZone === draw.second_zone;
      return { ...verdict(superlottoTier(m, zone2)), second_zone_matched: zone2 };
    }
    case "39m":
    case "49m":
    case "38m": {
      const k = ticket.numbers.length;
      const play = PLAY_NAMES[k];
      const won = m === k;
      return {
        ...base,
        play,
        tier: won ? play : null,
        rule: won ? MULTI_RULE[def.id](k) : null,
        won,
        rules_implemented: true,
        note: `選 ${k} 個號碼視為「${play}」玩法，要全部對中才算中獎。系統組合或系統配號的彩券請把每一注分開對獎。`,
      };
    }
    case "lotto1224":
      return verdict(lotto1224Tier(m));
    case "bingo": {
      const superHit = draw.super_number !== undefined && ticket.numbers.includes(draw.super_number);
      return {
        ...base,
        super_number_matched: superHit,
        tier: null,
        rule: null,
        won: null,
        rules_implemented: false,
        note:
          "賓果賓果有基本玩法（1~10 星）、超級獎號、猜大小、猜單雙四種玩法，獎金依玩法、星數與對中個數而定，" +
          "這個工具只列出對中的號碼，不判定獎項。請以官方遊戲介紹頁的獎金表為準。",
      };
    }
  }
  throw new InputError(`不支援的遊戲 ${game}`);
}
