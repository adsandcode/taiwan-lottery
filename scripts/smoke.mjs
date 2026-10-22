/**
 * Talks to the built server over stdio the way a real MCP client would, and
 * runs the CLI as a separate process. Compiling is not evidence that either
 * one answers.
 *
 * The network is replaced by scripts/mock-fetch.cjs, which answers from the
 * recorded official responses in fixtures/ and logs every request, so this
 * also checks the User-Agent and that repeated questions are served from the
 * cache. A second server runs against an API that fails every request.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");
const mock = resolve(here, "mock-fetch.cjs");
const load = (f) => import(pathToFileURL(resolve(dist, f)).href);
const { isAllowedLink } = await load("links.js");
const { TOOL_NAMES } = await load("tools.js");
const { NOTICE } = await load("service.js");
const { GAME_IDS } = await load("games.js");

const work = mkdtempSync(join(tmpdir(), "taiwan-lottery-smoke-"));
const logFile = join(work, "requests.jsonl");
const requests = () => (existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

let failures = 0;
const expect = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  [${ok ? "ok" : "FAIL"}] ${label}: got ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
};
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`  [${ok ? "ok" : "FAIL"}] ${label}${detail ? ": " + detail : ""}`);
};

async function startServer(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["-r", mock, resolve(dist, "index.js")],
    env: { ...getDefaultEnvironment(), ...env },
  });
  const client = new Client({ name: "taiwan-lottery-smoke", version: "0.0.0" });
  await client.connect(transport);
  return client;
}
const call = async (c, name, args) => {
  const r = await c.callTool({ name, arguments: args });
  return { isError: r.isError === true, body: JSON.parse(r.content[0].text) };
};
const linksOk = (body) =>
  Array.isArray(body.more) && body.more.length >= 1 && body.more.length <= 3 && body.more.every((l) => isAllowedLink(l.url));

console.log("MCP server over stdio");
const client = await startServer({ MOCK_FETCH_LOG: logFile });
const { tools } = await client.listTools();
expect("tool list", tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
check("every tool is marked read-only", tools.every((t) => t.annotations?.readOnlyHint === true));

const latest = await call(client, "latest_draw", { game: "今彩539" });
expect("latest_draw 今彩539", [latest.isError, latest.body.game, latest.body.draw.period, latest.body.draw.numbers], [false, "539", 115000256, [3, 8, 14, 23, 28]]);
check("latest_draw says official announcements prevail", latest.body.notes.includes(NOTICE));
check("latest_draw explains the official publishing delay", latest.body.notes.some((n) => n.includes("21:30") && n.includes("22:00")));
check("latest_draw links are on the allowlist", linksOk(latest.body), JSON.stringify(latest.body.more.map((l) => l.url)));

const before = requests().length;
await call(client, "latest_draw", { game: "539" });
expect("the same question again is answered from the cache", requests().length - before, 0);

for (const id of GAME_IDS) {
  const r = await call(client, "latest_draw", { game: id });
  check(`latest_draw ${id}`, !r.isError && r.body.game === id && linksOk(r.body), r.isError ? r.body.error : `period ${r.body.draw.period}`);
}

const d649 = await call(client, "get_draw", { game: "大樂透", period: 115000098 });
expect("get_draw 大樂透 by period", [d649.body.draw.numbers, d649.body.draw.special_number], [[2, 5, 19, 33, 40, 43], 6]);
const sunday = await call(client, "get_draw", { game: "539", date: "2026-10-18" });
expect("get_draw on a day without a draw is a clear not_found", [sunday.isError, sunday.body.kind], [true, "not_found"]);
check("a not_found result still carries allowlisted links", linksOk(sunday.body), JSON.stringify(sunday.body.more));

const list = await call(client, "list_draws", { game: "539", last_n: 3 });
expect("list_draws last 3", list.body.draws.map((d) => d.period), [115000256, 115000255, 115000254]);

const won = await call(client, "check_ticket", { game: "威力彩", numbers: [1, 9, 10, 21, 22, 31], second_zone: 6 });
expect("check_ticket 威力彩 頭獎", [won.body.tier, won.body.won, won.body.second_zone_matched], ["頭獎", true, true]);
check("check_ticket links to the check page first", won.body.more[0].url.endsWith("/lottery/superlotto/check/"));
const lost = await call(client, "check_ticket", { game: "539", numbers: "01 02 04 05 06" });
expect("check_ticket 539 no prize", [lost.body.tier, lost.body.won, lost.body.matched_count], [null, false, 0]);
const badTicket = await call(client, "check_ticket", { game: "539", numbers: [1, 2, 3] });
expect("check_ticket with three numbers is an input error", [badTicket.isError, badTicket.body.kind], [true, "input"]);
for (const numbers of ["3.8 14 23 28", "-3 8 14 23 28", "3 8 14 23 28 ×"]) {
  const r = await call(client, "check_ticket", { game: "539", numbers });
  expect(`check_ticket ${JSON.stringify(numbers)} is refused, not judged`, [r.isError, r.body.kind, r.body.tier], [true, "input", undefined]);
}
const host = new URL((await load("links.js")).COMPANION_SITE).host;
check("every tool description names the linked site and says it has ads", tools.every((t) => t.description.includes(host) && t.description.includes("ads") && t.description.includes("廣告")));

const stats = await call(client, "number_stats", { game: "539", last_n: 5 });
expect("number_stats", [stats.body.draws_analyzed, stats.body.most_frequent], [5, [4, 8, 15, 28, 36]]);
check("number_stats states that draws are independent", stats.body.disclaimer.includes("獨立") && stats.body.disclaimer_en.includes("independent"));
const statsText = await call(client, "number_stats", { game: "539", last_n: "5" });
expect("last_n given as a string works", [statsText.isError, statsText.body.draws_analyzed], [false, 5]);

const sched = await call(client, "draw_schedule", { game: "bingo" });
expect("draw_schedule 賓果", [sched.body.draw_days, sched.body.draw_time], ["週一至週日", "07:05~23:55，每 5 分鐘一期"]);

const unknown = await call(client, "latest_draw", { game: "樂透" });
expect("unknown game is an input error", [unknown.isError, unknown.body.kind], [true, "input"]);

const log = requests();
check("every request names the package in its User-Agent", log.length > 0 && log.every((r) => /^mcp-server-taiwan-lottery\/\d/.test(r.ua)), `${log.length} requests`);
check("every request goes to the official API", log.every((r) => r.url.startsWith("https://api.taiwanlottery.com/TLCAPIWeB/Lottery/")));
await client.close();

console.log("MCP server with the official API failing");
const broken = await startServer({ MOCK_FETCH_FAIL: "500" });
const down = await call(broken, "latest_draw", { game: "539" });
expect("API failure is reported as an error", [down.isError, down.body.kind], [true, "upstream"]);
const downSched = await call(broken, "draw_schedule", { game: "539" });
expect("draw_schedule still gives the official draw days", [downSched.isError, downSched.body.draw_days, downSched.body.next_draw], [false, "週一至週六", null]);
await broken.close();

console.log("CLI");
const cli = (args, env = {}) => {
  const r = spawnSync(process.execPath, ["-r", mock, resolve(dist, "cli.js"), ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const c1 = cli(["latest", "539"]);
check("latest 539 exits 0 and prints the numbers", c1.code === 0 && c1.out.includes("03 08 14 23 28"), `exit ${c1.code}`);
const c2 = cli(["check", "539", "03", "08", "14", "23", "28"]);
check("check prints the tier", c2.code === 0 && c2.out.includes("頭獎"), `exit ${c2.code}`);
const c3 = cli(["draw", "539", "--date", "2026-10-18"]);
expect("a day without a draw exits 1", c3.code, 1);
const c4 = cli(["latest", "樂透"]);
expect("an unknown game exits 2", c4.code, 2);
const c5 = cli(["latest", "539", "--json"]);
let parsed = null;
try { parsed = JSON.parse(c5.out); } catch { /* reported below */ }
expect("--json prints JSON", [c5.code, parsed?.draw?.period], [0, 115000256]);
const c6 = cli(["latest", "539"], { MOCK_FETCH_FAIL: "500" });
expect("API failure exits 2", c6.code, 2);
const c7 = cli(["--selftest"]);
check("--selftest exits 0", c7.code === 0 && c7.out.includes("selftest passed"), `exit ${c7.code}`);
const c8 = cli(["stats", "539", "--last", "5"]);
check("stats prints the independence note", c8.code === 0 && c8.out.includes("獨立"), `exit ${c8.code}`);
const c9 = cli(["latest", "539", "--bogus"]);
expect("an unknown option exits 2", c9.code, 2);
const c10 = cli(["check", "539", "-1", "2", "3", "4", "5"]);
check("check 539 -1 2 3 4 5 is refused (exit 2), not judged", c10.code === 2 && !c10.out.includes("頭獎"), `exit ${c10.code}, stdout ${JSON.stringify(c10.out.split("\n")[4] ?? "")}`);

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} smoke check(s) failed` : "\nall smoke checks passed");
process.exit(failures ? 1 : 0);
