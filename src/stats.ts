/**
 * Historical number frequencies over a window of past draws.
 *
 * These are counts of what already happened, nothing more. Every draw is an
 * independent random event: a number that came up often is not "due" to stop,
 * and one that has not come up is not "due" to appear. The disclaimer below
 * travels with every result.
 */

import { GAMES, type GameId } from "./games.js";
import type { Draw } from "./draws.js";

export const INDEPENDENCE_NOTE =
  "每一期開獎都是獨立的隨機事件，過去出現的次數不能預測下一期。以下只是歷史出現次數的統計。";
export const INDEPENDENCE_NOTE_EN = "Each draw is independent; past frequency does not predict future draws.";

export interface NumberCount {
  number: number;
  count: number;
  /** Draws since this number last appeared: 0 = in the newest draw of the window, null = not seen in the window. */
  draws_since_last_seen: number | null;
}

export interface PositionCounts {
  position: string;
  counts: NumberCount[];
}

export interface FrequencyStats {
  draws_analyzed: number;
  window: { from: { period: number; date: string }; to: { period: number; date: string } } | null;
  /** One entry per possible number, ascending. */
  frequency: NumberCount[];
  /** Most often drawn in the window (count high to low, ties by smaller number). */
  most_frequent: number[];
  /** Least often drawn in the window (count low to high, ties by smaller number). */
  least_frequent: number[];
  /** 3星彩 / 4星彩: counts per position. */
  by_position?: PositionCounts[];
  /** 大樂透 special number / 威力彩 second zone, counted separately. */
  special_number_frequency?: NumberCount[];
  second_zone_frequency?: NumberCount[];
  disclaimer: string;
  disclaimer_en: string;
}

function countRange(min: number, max: number, sets: number[][]): NumberCount[] {
  const out: NumberCount[] = [];
  for (let n = min; n <= max; n++) {
    let count = 0;
    let since: number | null = null;
    sets.forEach((set, i) => {
      if (set.includes(n)) {
        count++;
        if (since === null) since = i;
      }
    });
    out.push({ number: n, count, draws_since_last_seen: since });
  }
  return out;
}

function extremes(counts: NumberCount[], k: number): { most: number[]; least: number[] } {
  const most = [...counts].sort((a, b) => b.count - a.count || a.number - b.number).slice(0, k).map((c) => c.number);
  const least = [...counts].sort((a, b) => a.count - b.count || a.number - b.number).slice(0, k).map((c) => c.number);
  return { most, least };
}

/** `draws` must all be from `game`, newest first. */
export function frequencyStats(game: GameId, draws: Draw[]): FrequencyStats {
  const def = GAMES[game];
  const sorted = [...draws].sort((a, b) => b.period - a.period);
  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const window = newest
    ? { from: { period: oldest.period, date: oldest.date }, to: { period: newest.period, date: newest.date } }
    : null;
  const base = {
    draws_analyzed: sorted.length,
    window,
    disclaimer: INDEPENDENCE_NOTE,
    disclaimer_en: INDEPENDENCE_NOTE_EN,
  };

  if (def.kind === "digits") {
    const digitSets = sorted.map((d) => d.digits ?? []);
    const frequency = countRange(0, 9, digitSets).map((c) => ({
      ...c,
      // A digit can appear in several positions of one draw; count every occurrence.
      count: digitSets.reduce((sum, set) => sum + set.filter((x) => x === c.number).length, 0),
    }));
    const names = def.digits === 3 ? ["佰", "拾", "個"] : ["仟", "佰", "拾", "個"];
    const by_position = names.map((position, i) => ({
      position,
      counts: countRange(0, 9, sorted.map((d) => [d.digits?.[i] ?? -1])),
    }));
    const { most, least } = extremes(frequency, 3);
    return { ...base, frequency, most_frequent: most, least_frequent: least, by_position };
  }

  const pool = def.pool!;
  const frequency = countRange(pool.min, pool.max, sorted.map((d) => d.numbers ?? []));
  const { most, least } = extremes(frequency, 5);
  const result: FrequencyStats = { ...base, frequency, most_frequent: most, least_frequent: least };
  if (def.extra === "special")
    result.special_number_frequency = countRange(pool.min, pool.max, sorted.map((d) => (d.special_number ? [d.special_number] : [])));
  if (def.extra === "second_zone") {
    const z = def.secondZone!;
    result.second_zone_frequency = countRange(z.min, z.max, sorted.map((d) => (d.second_zone ? [d.second_zone] : [])));
  }
  return result;
}
