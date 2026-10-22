/**
 * The games this package knows, and where each fact about them comes from.
 *
 * Endpoints and response keys were read from the JavaScript of
 * www.taiwanlottery.com (the result and history pages call these same URLs)
 * and each one was called live before it was listed here. Draw days come from
 * the official draw schedule page, the 20:30 draw time from the official FAQ.
 * The two games that are not in the current official schedule (38m and
 * lotto1224) are kept because their endpoints still answer with their past
 * draws; their last month in the API is 2023-12.
 */

export const GAME_IDS = ["539", "lotto649", "superlotto", "3d", "4d", "39m", "49m", "38m", "lotto1224", "bingo"] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameKind = "lotto" | "digits" | "bingo";

export interface PrizeField {
  /** Field in the API response, for example "d539JackpotAssign". */
  field: string;
  /** Official prize tier name, for example "頭獎". */
  tier: string;
}

export interface Schedule {
  /** Draw days as the official schedule page writes them. */
  days: string;
  /** 1 = Monday ... 7 = Sunday. */
  daysOfWeek: number[];
  /** Taiwan time (UTC+8). */
  time: string;
}

export interface GameDef {
  id: GameId;
  name: string;
  englishName: string;
  /** The game code the official site and API use (NextDrawDate, ExceptionNotice). */
  gameCode: number;
  kind: GameKind;
  endpoint: string;
  /** Key of the draw list inside `content` (not used for bingo). */
  listKey: string;
  aliases: string[];
  /** Main number range and how many are drawn (lotto and bingo games). */
  pool?: { min: number; max: number; drawn: number };
  /** Number of digits (3d, 4d). */
  digits?: number;
  /** lotto649 draws a special number from the same pool; superlotto has a separate second zone. */
  extra?: "special" | "second_zone";
  secondZone?: { min: number; max: number };
  /** Games that reuse another game's numbers. */
  basedOn?: string;
  /**
   * Conservative minimum draws per month, used only to decide how many months
   * to ask for when a caller wants the last N draws. Holidays shorten months.
   */
  minDrawsPerMonth: number;
  active: boolean;
  /** For games no longer in the official schedule: the last month with draws in the API. */
  lastMonth?: string;
  prizes: PrizeField[];
  /** Official page with this game's results. */
  resultPage: string;
  /** Official page with this game's rules and prize table. */
  rulesPage: string;
  schedule?: Schedule;
}

const SITE = "https://www.taiwanlottery.com";
export const OFFICIAL = {
  site: SITE,
  schedulePage: `${SITE}/run_lottery/schedule/`,
  faqPage: `${SITE}/customer_service/faq/`,
  historyPage: `${SITE}/lotto/history/history_result/`,
} as const;

const info = (label: string) => `${SITE}/lotto/info/${label}/`;
const result = (label: string) => `${SITE}/lotto/result/${label}/`;

const EVENING = "20:30";
const MON_SAT: Schedule = { days: "週一至週六", daysOfWeek: [1, 2, 3, 4, 5, 6], time: EVENING };
const TUE_FRI: Schedule = { days: "週二、週五", daysOfWeek: [2, 5], time: EVENING };
const MON_THU: Schedule = { days: "週一、週四", daysOfWeek: [1, 4], time: EVENING };

const tiers = (prefix: string, names: [string, string][]): PrizeField[] =>
  names.map(([suffix, tier]) => ({ field: prefix + suffix, tier }));

export const GAMES: Record<GameId, GameDef> = {
  "539": {
    id: "539",
    name: "今彩539",
    englishName: "Daily Cash 539",
    gameCode: 5120,
    kind: "lotto",
    endpoint: "Daily539Result",
    listKey: "daily539Res",
    aliases: ["539", "今彩539", "今彩", "daily539", "dailycash", "daily_cash", "dailycash539"],
    pool: { min: 1, max: 39, drawn: 5 },
    minDrawsPerMonth: 20,
    active: true,
    prizes: tiers("d539", [["JackpotAssign", "頭獎"], ["SecondAssign", "貳獎"], ["ThirdAssign", "參獎"], ["FourthAssign", "肆獎"]]),
    resultPage: result("daily_cash"),
    rulesPage: info("daily_cash"),
    schedule: MON_SAT,
  },
  lotto649: {
    id: "lotto649",
    name: "大樂透",
    englishName: "Lotto 6/49",
    gameCode: 5118,
    kind: "lotto",
    endpoint: "Lotto649Result",
    listKey: "lotto649Res",
    aliases: ["lotto649", "大樂透", "大乐透", "649", "lotto6/49", "lotto_649"],
    pool: { min: 1, max: 49, drawn: 6 },
    extra: "special",
    minDrawsPerMonth: 6,
    active: true,
    prizes: [
      ["jackpotAssign", "頭獎"], ["secondAssign", "貳獎"], ["thirdAssign", "參獎"], ["fourthAssign", "肆獎"],
      ["fifthAssign", "伍獎"], ["sixthAssign", "陸獎"], ["seventhAssign", "柒獎"], ["normalAssign", "普獎"],
    ].map(([field, tier]) => ({ field, tier })),
    resultPage: result("lotto649"),
    rulesPage: info("lotto649"),
    schedule: TUE_FRI,
  },
  superlotto: {
    id: "superlotto",
    name: "威力彩",
    englishName: "Super Lotto 638",
    gameCode: 5134,
    kind: "lotto",
    endpoint: "SuperLotto638Result",
    listKey: "superLotto638Res",
    aliases: ["superlotto", "威力彩", "威力", "superlotto638", "super_lotto638", "super_lotto"],
    pool: { min: 1, max: 38, drawn: 6 },
    extra: "second_zone",
    secondZone: { min: 1, max: 8 },
    minDrawsPerMonth: 6,
    active: true,
    prizes: tiers("super638", [
      ["JackpotAssign", "頭獎"], ["SecondAssign", "貳獎"], ["ThirdAssign", "參獎"], ["FourthAssign", "肆獎"],
      ["FifthAssign", "伍獎"], ["SixthAssign", "陸獎"], ["SeventhAssign", "柒獎"], ["EighthAssign", "捌獎"],
      ["NinthAssign", "玖獎"], ["NormalAssign", "普獎"],
    ]),
    resultPage: result("super_lotto638"),
    rulesPage: info("super_lotto638"),
    schedule: MON_THU,
  },
  "3d": {
    id: "3d",
    name: "3星彩",
    englishName: "3D (3-digit)",
    gameCode: 2108,
    kind: "digits",
    endpoint: "3DResult",
    listKey: "lotto3DRes",
    aliases: ["3d", "3星彩", "三星彩", "3_d", "3星", "三星"],
    digits: 3,
    minDrawsPerMonth: 20,
    active: true,
    prizes: tiers("lotto3D", [["FirstAssign", "壹獎"], ["SecondAssign", "貳獎"], ["ThirdAssign", "參獎"]]),
    resultPage: result("3_d"),
    rulesPage: info("3_d"),
    schedule: MON_SAT,
  },
  "4d": {
    id: "4d",
    name: "4星彩",
    englishName: "4D (4-digit)",
    gameCode: 2109,
    kind: "digits",
    endpoint: "4DResult",
    listKey: "lotto4DRes",
    aliases: ["4d", "4星彩", "四星彩", "4_d", "4星", "四星"],
    digits: 4,
    minDrawsPerMonth: 20,
    active: true,
    prizes: tiers("lotto4D", [["FirstAssign", "壹獎"], ["SecondAssign", "貳獎"], ["ThirdAssign", "參獎"]]),
    resultPage: result("4_d"),
    rulesPage: info("4_d"),
    schedule: MON_SAT,
  },
  "39m": {
    id: "39m",
    name: "39樂合彩",
    englishName: "39 Lotto (pick 2-4 of 39)",
    gameCode: 1197,
    kind: "lotto",
    endpoint: "39M5Result",
    listKey: "m539Res",
    aliases: ["39m", "39樂合彩", "39乐合彩", "39_m5", "39m5", "39樂合"],
    pool: { min: 1, max: 39, drawn: 5 },
    basedOn: "今彩539",
    minDrawsPerMonth: 20,
    active: true,
    prizes: tiers("m539", [["TwoAssign", "二合"], ["ThreeAssign", "三合"], ["FourAssign", "四合"]]),
    resultPage: result("39_m5"),
    rulesPage: info("39_m5"),
    schedule: MON_SAT,
  },
  "49m": {
    id: "49m",
    name: "49樂合彩",
    englishName: "49 Lotto (pick 2-4 of 49)",
    gameCode: 1121,
    kind: "lotto",
    endpoint: "49M6Result",
    listKey: "m649Res",
    aliases: ["49m", "49樂合彩", "49乐合彩", "49_m6", "49m6", "49樂合"],
    pool: { min: 1, max: 49, drawn: 6 },
    basedOn: "大樂透（不含特別號）",
    minDrawsPerMonth: 6,
    active: true,
    prizes: tiers("m649", [["TwoAssign", "二合"], ["ThreeAssign", "三合"], ["FourAssign", "四合"]]),
    resultPage: result("49_m6"),
    rulesPage: info("49_m6"),
    schedule: TUE_FRI,
  },
  "38m": {
    id: "38m",
    name: "38樂合彩",
    englishName: "38 Lotto (pick 2-5 of 38)",
    gameCode: 5122,
    kind: "lotto",
    endpoint: "38M6Result",
    listKey: "m638Res",
    aliases: ["38m", "38樂合彩", "38乐合彩", "38_m6", "38m6", "38樂合"],
    pool: { min: 1, max: 38, drawn: 6 },
    basedOn: "威力彩第1區",
    minDrawsPerMonth: 6,
    active: false,
    lastMonth: "2023-12",
    prizes: [
      ["twoMatchAssign", "二合"], ["threeMatchAssign", "三合"], ["fourMatchAssign", "四合"], ["fiveMatchAssign", "五合"],
    ].map(([field, tier]) => ({ field, tier })),
    resultPage: OFFICIAL.historyPage,
    rulesPage: OFFICIAL.historyPage,
  },
  lotto1224: {
    id: "lotto1224",
    name: "雙贏彩",
    englishName: "Lotto 12/24",
    gameCode: 5290,
    kind: "lotto",
    endpoint: "Lotto1224Result",
    listKey: "lotto1224Res",
    aliases: ["lotto1224", "雙贏彩", "双赢彩", "1224", "lotto12/24"],
    pool: { min: 1, max: 24, drawn: 12 },
    minDrawsPerMonth: 20,
    active: false,
    lastMonth: "2023-12",
    prizes: [["jackpotAssign", "頭獎"], ["secondAssign", "貳獎"], ["thirdAssign", "參獎"], ["fourthAssign", "肆獎"]].map(
      ([field, tier]) => ({ field, tier }),
    ),
    resultPage: OFFICIAL.historyPage,
    rulesPage: OFFICIAL.historyPage,
  },
  bingo: {
    id: "bingo",
    name: "賓果賓果",
    englishName: "BINGO BINGO",
    gameCode: 1102,
    kind: "bingo",
    endpoint: "BingoResult",
    listKey: "bingoQueryResult",
    aliases: ["bingo", "賓果賓果", "賓果", "宾果宾果", "宾果", "bingobingo", "bingo_bingo", "bingobingo賓果賓果"],
    pool: { min: 1, max: 80, drawn: 20 },
    minDrawsPerMonth: 0,
    active: true,
    prizes: [],
    resultPage: result("bingo_bingo"),
    rulesPage: info("bingo_bingo"),
    schedule: { days: "週一至週日", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], time: "07:05~23:55，每 5 分鐘一期" },
  },
};

/** Draws per day for BINGO BINGO: 07:05 to 23:55 every 5 minutes. */
export const BINGO_DRAWS_PER_DAY = 203;

/** Normalise user input for alias matching: full-width to half-width, lower case, no spaces, dashes or dots. */
export function normaliseGameInput(input: string): string {
  return input.normalize("NFKC").toLowerCase().replace(/[\s\-_.·・]/g, "");
}

const ALIAS_INDEX = new Map<string, GameId>();
for (const g of Object.values(GAMES)) {
  for (const a of [g.id, ...g.aliases]) {
    const key = normaliseGameInput(a);
    const existing = ALIAS_INDEX.get(key);
    if (existing && existing !== g.id) throw new Error(`alias "${a}" is used by both ${existing} and ${g.id}`);
    ALIAS_INDEX.set(key, g.id);
  }
}

/** Resolve a game id or alias ("539", "今彩539", "大樂透", "Super Lotto"...). Returns null when unknown. */
export function resolveGame(input: string): GameDef | null {
  if (typeof input !== "string") return null;
  const id = ALIAS_INDEX.get(normaliseGameInput(input));
  return id ? GAMES[id] : null;
}

export function gameList(): string {
  return GAME_IDS.map((id) => `${id}（${GAMES[id].name}）`).join("、");
}
