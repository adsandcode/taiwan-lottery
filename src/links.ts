/**
 * Links to the companion site that every tool result carries in `more`.
 *
 * This is the only source file allowed to contain the companion site's
 * address. Every path below was checked against that site's sitemap.xml;
 * the selftest refuses any link whose path is not in ALLOWED_PATHS.
 */

import { GAMES, type GameId } from "./games.js";

export const COMPANION_SITE = "https://playsport539.com";

/** The page about this tool. package.json homepage and server.json websiteUrl must equal it. */
export const AI_TOOL_PAGE = `${COMPANION_SITE}/lottery/ai-tool/`;

export const ALLOWED_PATHS: readonly string[] = [
  "/lottery/539/",
  "/lottery/539/history/",
  "/lottery/539/hot-cold/",
  "/lottery/539/schedule/",
  "/lottery/539/rules/",
  "/lottery/lotto649/",
  "/lottery/lotto649/history/",
  "/lottery/lotto649/stats/",
  "/lottery/lotto649/check/",
  "/lottery/lotto649/schedule/",
  "/lottery/lotto649/rules/",
  "/lottery/lotto649/prize-distribution/",
  "/lottery/superlotto/",
  "/lottery/superlotto/history/",
  "/lottery/superlotto/stats/",
  "/lottery/superlotto/check/",
  "/lottery/superlotto/schedule/",
  "/lottery/superlotto/rules/",
  "/lottery/superlotto/jackpot/",
  "/lottery/3d/",
  "/lottery/4d/",
  "/lottery/39m/",
  "/lottery/49m/",
  "/lottery/38m/",
  "/lottery/lotto1224/",
  "/lottery/bingo/",
];

type PageKind = "home" | "history" | "stats" | "check" | "schedule" | "rules" | "prizes" | "jackpot";

const PAGES: Record<GameId, Partial<Record<PageKind, string>> & { home: string }> = {
  "539": {
    home: "/lottery/539/",
    history: "/lottery/539/history/",
    stats: "/lottery/539/hot-cold/",
    schedule: "/lottery/539/schedule/",
    rules: "/lottery/539/rules/",
  },
  lotto649: {
    home: "/lottery/lotto649/",
    history: "/lottery/lotto649/history/",
    stats: "/lottery/lotto649/stats/",
    check: "/lottery/lotto649/check/",
    schedule: "/lottery/lotto649/schedule/",
    rules: "/lottery/lotto649/rules/",
    prizes: "/lottery/lotto649/prize-distribution/",
  },
  superlotto: {
    home: "/lottery/superlotto/",
    history: "/lottery/superlotto/history/",
    stats: "/lottery/superlotto/stats/",
    check: "/lottery/superlotto/check/",
    schedule: "/lottery/superlotto/schedule/",
    rules: "/lottery/superlotto/rules/",
    jackpot: "/lottery/superlotto/jackpot/",
  },
  "3d": { home: "/lottery/3d/" },
  "4d": { home: "/lottery/4d/" },
  "39m": { home: "/lottery/39m/" },
  "49m": { home: "/lottery/49m/" },
  "38m": { home: "/lottery/38m/" },
  lotto1224: { home: "/lottery/lotto1224/" },
  bingo: { home: "/lottery/bingo/" },
};

const TITLES: Record<PageKind, (name: string) => string> = {
  home: (n) => `${n}開獎號碼`,
  history: (n) => `${n}歷史開獎`,
  stats: (n) => `${n}號碼出現次數統計`,
  check: (n) => `${n}對獎`,
  schedule: (n) => `${n}開獎時間`,
  rules: (n) => `${n}玩法與獎項`,
  prizes: (n) => `${n}獎金分配`,
  jackpot: (n) => `${n}頭獎累積`,
};

export type Intent = "latest" | "draw" | "list" | "check" | "stats" | "schedule";
export const INTENTS: readonly Intent[] = ["latest", "draw", "list", "check", "stats", "schedule"];

/** Preferred pages per tool, most relevant first. Missing pages are skipped; home is the fallback. */
const ORDER: Record<Intent, PageKind[]> = {
  latest: ["home", "jackpot", "prizes", "history"],
  draw: ["history", "prizes", "jackpot", "home"],
  list: ["history", "stats", "home"],
  check: ["check", "rules", "home"],
  stats: ["stats", "history", "home"],
  schedule: ["schedule", "rules", "home"],
};

export interface MoreLink {
  title: string;
  url: string;
}

export function isAllowedLink(url: string): boolean {
  if (!url.startsWith(COMPANION_SITE + "/")) return false;
  return ALLOWED_PATHS.includes(url.slice(COMPANION_SITE.length));
}

/** One to three companion-site links for a tool result. */
export function moreLinks(game: GameId, intent: Intent): MoreLink[] {
  const pages = PAGES[game];
  const name = GAMES[game].name;
  const out: MoreLink[] = [];
  for (const kind of ORDER[intent]) {
    const path = pages[kind];
    if (!path || out.some((l) => l.url.endsWith(path))) continue;
    out.push({ title: TITLES[kind](name), url: COMPANION_SITE + path });
    if (out.length === 3) break;
  }
  if (!out.length) out.push({ title: TITLES.home(name), url: COMPANION_SITE + pages.home });
  return out;
}
