/** Dates in Taiwan time (UTC+8, no daylight saving). */

import { InputError } from "./errors.js";

const OFFSET_MS = 8 * 60 * 60 * 1000;

export interface TaipeiDate {
  year: number;
  month: number;
  day: number;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  monthKey: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function taipei(now: Date): TaipeiDate {
  const t = new Date(now.getTime() + OFFSET_MS);
  const year = t.getUTCFullYear();
  const month = t.getUTCMonth() + 1;
  const day = t.getUTCDate();
  return { year, month, day, date: `${year}-${pad(month)}-${pad(day)}`, monthKey: `${year}-${pad(month)}` };
}

export function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function addDays(date: string, delta: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

/** Validate YYYY-MM. */
export function parseMonth(input: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(input).trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new InputError(`月份格式要是 YYYY-MM，例如 2026-10，收到「${input}」。`);
  return `${m[1]}-${m[2]}`;
}

/** Validate YYYY-MM-DD, including that the day exists. */
export function parseDate(input: string): string {
  const s = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new InputError(`日期格式要是 YYYY-MM-DD，例如 2026-10-22，收到「${input}」。`);
  const t = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== s) throw new InputError(`沒有這一天：${input}。`);
  return s;
}

/** BINGO BINGO periods: ROC year (3 digits) + running number within the year, 203 draws a day from January 1. */
export function bingoDateFromPeriod(period: number): string | null {
  if (!Number.isInteger(period) || period < 100_000_001 || period > 999_999_999) return null;
  const rocYear = Math.floor(period / 1_000_000);
  const index = period % 1_000_000;
  if (index < 1) return null;
  const dayOfYear = Math.ceil(index / 203);
  const year = rocYear + 1911;
  const date = addDays(`${year}-01-01`, dayOfYear - 1);
  return date.startsWith(String(year)) ? date : null;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
/** Weekday name (週一...) of a YYYY-MM-DD date. */
export function weekdayOf(date: string): string {
  return `週${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}`;
}
