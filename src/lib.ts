/**
 * Library entry point (package.json "main"). Importing it has no side
 * effects: no server starts, nothing is printed, no request is made until a
 * client method is called.
 *
 *   import { LotteryService } from "mcp-server-taiwan-lottery";
 *   const lottery = new LotteryService();
 *   const latest = await lottery.latestDraw({ game: "今彩539" });
 */

export { GAMES, GAME_IDS, OFFICIAL, resolveGame, type GameDef, type GameId } from "./games.js";
export { parseResultList, parseBingoList, parseBingoLatest, type Draw, type Prize, type DrawPage } from "./draws.js";
export { readTicket, checkTicket, ticketShape, type Ticket, type CheckResult } from "./rules.js";
export { frequencyStats, INDEPENDENCE_NOTE, INDEPENDENCE_NOTE_EN, type FrequencyStats } from "./stats.js";
export { LotteryClient, API_BASE, USER_AGENT, TTL, type ClientOptions, type FetchLike } from "./client.js";
export { LotteryService, NOTICE, LAG_NOTE } from "./service.js";
export { moreLinks, isAllowedLink, ALLOWED_PATHS, AI_TOOL_PAGE, COMPANION_SITE, type MoreLink } from "./links.js";
export { InputError, NotFoundError, UpstreamError } from "./errors.js";
export { VERSION } from "./version.js";
